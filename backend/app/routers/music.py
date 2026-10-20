"""Generation queue, library, and generated-audio endpoints."""

import json
import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import (
    KIE_MODEL,
    MAX_CONCURRENT_GENERATIONS_PER_USER,
    MAX_GENERATION_DURATION_SECONDS,
    MUSIC_MODEL,
    MUSIC_PROVIDER,
    STORAGE_PATH,
)
from app.database import get_db
from app.models import Generation, Track, User
from app.schemas import GenerationRequest, RenameRequest
from app.security import require_user
from app.services.music_providers import PROVIDERS


router = APIRouter(prefix="/api/v1", tags=["music"])


def serialize_generation(generation: Generation) -> dict:
    return {
        "id": generation.id,
        "title": generation.title,
        "prompt": generation.prompt,
        "status": generation.status,
        "error_code": generation.error_code,
        "error_message": generation.error_message,
        "created_at": generation.created_at,
        "provider": generation.provider,
    }


def serialize_track(track: Track, generation: Generation | None = None) -> dict:
    result = {
        "id": track.id,
        "title": track.title,
        "duration_seconds": track.duration_seconds,
        "created_at": track.created_at,
        "generation_id": track.generation_id,
        "content_type": track.content_type,
    }
    if generation is not None:
        result.update(
            prompt=generation.prompt,
            lyrics=generation.lyrics,
            settings=json.loads(generation.settings_json),
            provider=generation.provider,
        )
    return result


def get_owned(session: Session, model, record_id: str, user: User):
    record = session.get(model, record_id)
    if record is None or record.user_id != user.id:
        raise HTTPException(404, "Not found")
    return record


@router.get("/music-provider/capabilities")
def provider_capabilities():
    model = (
        MUSIC_MODEL
        if MUSIC_PROVIDER == "lyria"
        else KIE_MODEL
        if MUSIC_PROVIDER == "kie"
        else MUSIC_PROVIDER
    )
    return {
        "provider": MUSIC_PROVIDER,
        "max_duration": 30 if MUSIC_PROVIDER == "mock" else MAX_GENERATION_DURATION_SECONDS,
        "model": model,
    }


@router.post("/generations", status_code=202)
def create_generation(
    request: GenerationRequest,
    user: User = Depends(require_user),
    session: Session = Depends(get_db),
):
    active_count = session.scalar(
        select(func.count())
        .select_from(Generation)
        .where(
            Generation.user_id == user.id,
            Generation.status.in_(["queued", "processing"]),
        )
    )
    if active_count >= MAX_CONCURRENT_GENERATIONS_PER_USER:
        raise HTTPException(429, "You already have a generation in progress")
    if MUSIC_PROVIDER not in PROVIDERS:
        raise HTTPException(503, f"Provider '{MUSIC_PROVIDER}' is not implemented")
    if MUSIC_PROVIDER == "lyria" and not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(503, "Gemini is not configured (set GEMINI_API_KEY)")
    if MUSIC_PROVIDER == "kie" and not os.getenv("KIE_API_KEY"):
        raise HTTPException(503, "Kie is not configured (set KIE_API_KEY)")

    generation = Generation(
        user_id=user.id,
        title=request.title,
        prompt=request.prompt,
        lyrics=request.lyrics,
        provider=MUSIC_PROVIDER,
        settings_json=json.dumps(
            {
                "genre": request.genre,
                "mood": request.mood,
                "language": request.language,
                "instrumental": request.instrumental,
                "duration": min(
                    request.duration,
                    MAX_GENERATION_DURATION_SECONDS,
                ),
            }
        ),
    )
    session.add(generation)
    session.commit()
    return serialize_generation(generation)


@router.get("/generations/{generation_id}")
def get_generation(
    generation_id: str,
    user: User = Depends(require_user),
    session: Session = Depends(get_db),
):
    return serialize_generation(
        get_owned(session, Generation, generation_id, user)
    )


@router.post("/generations/{generation_id}/cancel")
def cancel_generation(
    generation_id: str,
    user: User = Depends(require_user),
    session: Session = Depends(get_db),
):
    generation = get_owned(session, Generation, generation_id, user)
    if generation.status in ("queued", "processing"):
        generation.status = "cancelled"
        session.commit()
    return serialize_generation(generation)


@router.get("/generations")
def list_generations(
    user: User = Depends(require_user),
    session: Session = Depends(get_db),
):
    generations = session.scalars(
        select(Generation)
        .where(Generation.user_id == user.id)
        .order_by(Generation.created_at.desc())
        .limit(50)
    )
    return [serialize_generation(generation) for generation in generations]


@router.get("/tracks")
def list_tracks(
    q: str = "",
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    user: User = Depends(require_user),
    session: Session = Depends(get_db),
):
    statement = (
        select(Track, Generation)
        .join(Generation, Track.generation_id == Generation.id)
        .where(
            Track.user_id == user.id,
            Track.title.ilike(f"%{q}%"),
        )
        .order_by(Track.created_at.desc())
    )
    rows = session.execute(statement.offset((page - 1) * size).limit(size))
    return [serialize_track(track, generation) for track, generation in rows]


@router.get("/tracks/{track_id}")
def get_track(
    track_id: str,
    user: User = Depends(require_user),
    session: Session = Depends(get_db),
):
    track = get_owned(session, Track, track_id, user)
    return serialize_track(track, session.get(Generation, track.generation_id))


@router.patch("/tracks/{track_id}")
def rename_track(
    track_id: str,
    request: RenameRequest,
    user: User = Depends(require_user),
    session: Session = Depends(get_db),
):
    track = get_owned(session, Track, track_id, user)
    track.title = request.title
    session.commit()
    return serialize_track(track)


@router.delete("/tracks/{track_id}", status_code=204)
def delete_track(
    track_id: str,
    user: User = Depends(require_user),
    session: Session = Depends(get_db),
):
    track = get_owned(session, Track, track_id, user)
    audio_path = STORAGE_PATH / Path(track.storage_key).name
    audio_path.unlink(missing_ok=True)
    session.delete(track)
    session.commit()


@router.get("/tracks/{track_id}/audio")
def get_track_audio(
    track_id: str,
    user: User = Depends(require_user),
    session: Session = Depends(get_db),
):
    track = get_owned(session, Track, track_id, user)
    extension = Path(track.storage_key).suffix or ".wav"
    audio_path = STORAGE_PATH / Path(track.storage_key).name
    if not audio_path.is_file():
        raise HTTPException(404, "This song's audio file is no longer available")
    return FileResponse(
        audio_path,
        media_type=track.content_type,
        filename=f"{track.title}{extension}",
    )
