"""Music-provider integrations and audio-format helpers."""

import base64
import json
import math
import os
import struct
import time
import wave
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request as UrlRequest, urlopen

from app.config import (
    KIE_API_BASE,
    KIE_MODEL,
    MAX_GENERATION_DURATION_SECONDS,
    MUSIC_MODEL,
)
from app.models import Generation


def mock_provider(generation: Generation, path: Path) -> int:
    """Create short demo tones; this is not AI-generated music."""
    settings = json.loads(generation.settings_json)
    seconds = min(
        settings.get("duration", 20),
        MAX_GENERATION_DURATION_SECONDS,
        30,
    )
    sample_rate = 22050
    notes = [261.6, 293.7, 329.6, 392.0, 440.0]
    seed = sum(map(ord, generation.id)) % len(notes)
    samples = bytearray()
    for index in range(sample_rate * seconds):
        frequency = notes[(index // (sample_rate // 2) + seed) % len(notes)]
        samples += struct.pack(
            "<h",
            int(7000 * math.sin(2 * math.pi * frequency * index / sample_rate)),
        )

    time.sleep(3)
    with wave.open(str(path), "wb") as audio_file:
        audio_file.setnchannels(1)
        audio_file.setsampwidth(2)
        audio_file.setframerate(sample_rate)
        audio_file.writeframes(bytes(samples))
    return seconds


def audio_bytes(data: Any) -> bytes:
    """Normalize audio payloads returned by the Gemini SDK."""
    if data is None:
        raise RuntimeError("Lyria returned no audio")
    if isinstance(data, (bytes, bytearray)):
        return bytes(data)
    if isinstance(data, str):
        return base64.b64decode(data)
    inner = getattr(data, "data", None)
    if inner is not None and inner is not data:
        return audio_bytes(inner)
    return base64.b64decode(str(data))


def sniff_audio(raw: bytes) -> tuple[str, str]:
    """Identify common generated audio formats from their file signatures."""
    if raw.startswith(b"RIFF") and b"WAVE" in raw[:16]:
        return "audio/wav", ".wav"
    if raw.startswith(b"ID3") or (
        len(raw) > 1 and raw[0] == 0xFF and raw[1] & 0xE0 == 0xE0
    ):
        return "audio/mpeg", ".mp3"
    if raw.startswith(b"fLaC"):
        return "audio/flac", ".flac"
    if raw.startswith(b"OggS"):
        return "audio/ogg", ".ogg"
    return "audio/mpeg", ".mp3"


def wav_duration(path: Path, fallback: int) -> int:
    try:
        with wave.open(str(path), "rb") as audio_file:
            return max(
                1,
                int(round(audio_file.getnframes() / float(audio_file.getframerate()))),
            )
    except (OSError, wave.Error, ZeroDivisionError):
        return fallback


def music_prompt(generation: Generation) -> str:
    settings = json.loads(generation.settings_json or "{}")
    seconds = min(
        int(settings.get("duration") or 60),
        MAX_GENERATION_DURATION_SECONDS,
    )
    parts = [
        f"Create a complete {seconds}-second song from this description:",
        generation.prompt.strip(),
    ]
    if settings.get("genre"):
        parts.append(f"Genre: {settings['genre']}.")
    if settings.get("mood"):
        parts.append(f"Mood: {settings['mood']}.")
    language = settings.get("language") or "English"
    if settings.get("instrumental"):
        parts.append("Instrumental only — no vocals, no singing, no spoken words.")
    else:
        parts.append(f"Include vocals in {language}.")
        if (generation.lyrics or "").strip():
            parts.append("Sing these lyrics:\n" + generation.lyrics.strip())
    return "\n".join(parts)


def _genai_client():
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY is not set")

    from google import genai
    from google.genai import types

    return genai.Client(
        api_key=key,
        http_options=types.HttpOptions(timeout=600_000),
    )


def _audio_from_interactions(client, model: str, prompt: str) -> tuple[bytes, str]:
    interaction = client.interactions.create(
        model=model,
        input=prompt,
        response_format={"type": "audio"},
    )
    audio_block = getattr(interaction, "output_audio", None)
    if not audio_block or getattr(audio_block, "data", None) is None:
        raise RuntimeError("Lyria interactions returned no audio")
    return (
        audio_bytes(audio_block.data),
        (getattr(interaction, "output_text", None) or "").strip(),
    )


def lyria_provider(generation: Generation, path: Path) -> int:
    settings = json.loads(generation.settings_json or "{}")
    fallback = min(
        int(settings.get("duration") or 60),
        MAX_GENERATION_DURATION_SECONDS,
    )
    audio, extra_lyrics = _audio_from_interactions(
        _genai_client(),
        MUSIC_MODEL,
        music_prompt(generation),
    )
    path.write_bytes(audio)
    if extra_lyrics and not (generation.lyrics or "").strip():
        generation.lyrics = extra_lyrics[:5000]

    content_type, _extension = sniff_audio(audio)
    return wav_duration(path, fallback) if content_type == "audio/wav" else fallback


def _kie_request(method: str, endpoint: str, *, payload=None, query=None):
    key = os.getenv("KIE_API_KEY")
    if not key:
        raise RuntimeError("KIE_API_KEY is not set")

    url = f"{KIE_API_BASE}{endpoint}"
    if query:
        url = f"{url}?{urlencode(query)}"
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = UrlRequest(
        url,
        data=body,
        method=method,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=30) as response:
            raw = response.read(1_000_001)
    except HTTPError as error:
        raw = error.read(16_384)
        try:
            detail = json.loads(raw).get("msg", "")
        except (ValueError, AttributeError):
            detail = ""
        raise RuntimeError(
            f"Kie API returned HTTP {error.code}: {detail or 'request failed'}"
        ) from error
    except URLError as error:
        raise RuntimeError(f"Kie API request failed: {error.reason}") from error

    if len(raw) > 1_000_000:
        raise RuntimeError("Kie API response exceeded the size limit")
    try:
        result = json.loads(raw)
    except (ValueError, UnicodeDecodeError) as error:
        raise RuntimeError("Kie API returned invalid JSON") from error
    if not isinstance(result, dict):
        raise RuntimeError("Kie API returned an unexpected response")
    if result.get("code") != 200:
        raise RuntimeError(
            f"Kie API error {result.get('code')}: "
            f"{result.get('msg', 'request failed')}"
        )
    return result.get("data")


def _kie_audio_result(task: dict[str, Any]) -> tuple[str, Any]:
    pending = [task.get("response"), task.get("resultJson")]
    while pending:
        value = pending.pop()
        if isinstance(value, str):
            try:
                pending.append(json.loads(value))
            except ValueError:
                continue
        elif isinstance(value, list):
            pending.extend(value)
        elif isinstance(value, dict):
            audio_url = value.get("audio_url") or value.get("stream_audio_url")
            if audio_url:
                return audio_url, value.get("duration")
            pending.extend(value.values())
    raise RuntimeError("Kie music task completed without an audio URL")


def kie_provider(generation: Generation, path: Path) -> int:
    settings = json.loads(generation.settings_json or "{}")
    if not os.getenv("KIE_API_KEY"):
        raise RuntimeError("KIE_API_KEY is not set")

    duration = min(
        int(settings.get("duration") or 60),
        MAX_GENERATION_DURATION_SECONDS,
    )
    style = ", ".join(
        str(value).strip()
        for value in (settings.get("genre"), settings.get("mood"))
        if value and str(value).strip()
    )
    prompt = f"{generation.prompt.strip()} Aim for a song around {duration} seconds."
    if not settings.get("instrumental") and settings.get("language"):
        prompt += f" Vocals should be in {settings['language']}."

    provider_input = {
        "prompt": prompt,
        "style": style or "Pop",
        "title": (generation.title or "Untitled")[:80],
        "custom_mode": False,
        "instrumental": bool(settings.get("instrumental")),
        "model": KIE_MODEL,
    }
    if (generation.lyrics or "").strip() and not settings.get("instrumental"):
        provider_input["lyrics"] = generation.lyrics.strip()[:5000]

    created = _kie_request(
        "POST",
        "/api/v1/jobs/createTask",
        payload={"model": "ai-music-api/generate", "input": provider_input},
    )
    task_id = created.get("taskId") if isinstance(created, dict) else None
    if not task_id:
        raise RuntimeError("Kie API did not return a task ID")

    deadline = time.monotonic() + 600
    wait_seconds = 3
    while time.monotonic() < deadline:
        time.sleep(wait_seconds)
        task = _kie_request(
            "GET",
            "/api/v1/jobs/recordInfo",
            query={"taskId": task_id},
        )
        if not isinstance(task, dict):
            raise RuntimeError("Kie API returned invalid task status")

        state = task.get("state")
        if state == "success":
            audio_url, actual_duration = _kie_audio_result(task)
            parsed_url = urlparse(audio_url)
            if parsed_url.scheme != "https" or not parsed_url.hostname:
                raise RuntimeError("Kie API returned an invalid audio URL")
            try:
                with urlopen(
                    UrlRequest(audio_url, headers={"Accept": "audio/*"}),
                    timeout=60,
                ) as response:
                    audio = response.read(100_000_001)
            except (HTTPError, URLError) as error:
                raise RuntimeError(
                    f"Could not download generated Kie audio: {error}"
                ) from error
            if len(audio) > 100_000_000:
                raise RuntimeError("Generated Kie audio exceeded the 100 MB limit")
            path.write_bytes(audio)
            return max(1, int(float(actual_duration))) if actual_duration else duration
        if state == "fail":
            raise RuntimeError(
                f"Kie music generation failed ({task.get('failCode', 'unknown')}): "
                f"{task.get('failMsg', 'no details')}"
            )
        if state not in {"waiting", "queuing", "generating"}:
            raise RuntimeError(f"Kie API returned unknown task state: {state}")
        wait_seconds = min(wait_seconds + 1, 8)
    raise TimeoutError("Kie music generation exceeded the 10-minute timeout")


PROVIDERS = {
    "mock": mock_provider,
    "lyria": lyria_provider,
    "kie": kie_provider,
}
