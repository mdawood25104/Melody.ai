"""Background queue that turns queued generation records into stored tracks."""

import logging
import os
import threading
import time
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import STORAGE_PATH
from app.database import engine
from app.models import Generation, Track, new_id, utc_now
from app.services.music_providers import PROVIDERS, sniff_audio


logger = logging.getLogger("melodyai")


def _safe_failure_message(error: Exception) -> str:
    if isinstance(error, (RuntimeError, TimeoutError)):
        message = str(error)[:1000]
    else:
        message = "Generation failed unexpectedly. Check backend logs or contact support."

    for secret_name in ("KIE_API_KEY", "GEMINI_API_KEY", "APP_SECRET_KEY"):
        secret = os.getenv(secret_name)
        if secret:
            message = message.replace(secret, "[redacted]")
    return message or "Generation failed. Check backend logs for details."


def run_one_generation() -> bool:
    """Claim and process one queued generation; return whether work was found."""
    with Session(engine) as session:
        generation = session.scalar(
            select(Generation)
            .where(Generation.status == "queued")
            .order_by(Generation.created_at)
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        if generation is None:
            return False

        generation.status = "processing"
        session.commit()
        generation_id = generation.id
        temporary_path = STORAGE_PATH / f"{new_id()}.bin"
        final_path = temporary_path

        try:
            duration = PROVIDERS[generation.provider](generation, temporary_path)
            updated_lyrics = generation.lyrics
            session.refresh(generation)
            if updated_lyrics:
                generation.lyrics = updated_lyrics
            if generation.status == "cancelled":
                temporary_path.unlink(missing_ok=True)
                return True

            audio = temporary_path.read_bytes()
            content_type, extension = sniff_audio(audio)
            storage_key = temporary_path.stem + extension
            final_path = STORAGE_PATH / storage_key
            if final_path != temporary_path:
                final_path.write_bytes(audio)
                temporary_path.unlink(missing_ok=True)

            title = generation.title
            if generation.provider == "mock":
                title += " (MOCK demo audio)"
            session.add(
                Track(
                    user_id=generation.user_id,
                    generation_id=generation.id,
                    title=title,
                    storage_key=storage_key,
                    content_type=content_type,
                    duration_seconds=duration,
                    file_size_bytes=final_path.stat().st_size,
                )
            )
            generation.status = "completed"
            generation.completed_at = utc_now()
        except Exception as error:
            logger.exception("generation %s failed", generation_id)
            for failed_path in {temporary_path, final_path}:
                try:
                    failed_path.unlink(missing_ok=True)
                except OSError:
                    logger.exception(
                        "could not remove partial generation file for %s",
                        generation_id,
                    )

            session.rollback()
            failed_generation = session.get(Generation, generation_id)
            if failed_generation and failed_generation.status != "cancelled":
                failed_generation.status = "failed"
                failed_generation.error_code = type(error).__name__[:50]
                failed_generation.error_message = _safe_failure_message(error)
                session.commit()
            return True

        session.commit()
        return True


def worker_loop() -> None:
    while True:
        try:
            if not run_one_generation():
                time.sleep(1)
        except Exception:
            logger.exception("worker error")
            time.sleep(3)


def start_generation_worker() -> None:
    """Requeue interrupted work and launch the in-process worker thread."""
    with Session(engine) as session:
        interrupted = session.scalars(
            select(Generation).where(Generation.status == "processing")
        )
        for generation in interrupted:
            generation.status = "queued"
        session.commit()
    threading.Thread(target=worker_loop, daemon=True).start()
