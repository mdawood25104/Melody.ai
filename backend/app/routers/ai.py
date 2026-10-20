"""Authenticated AI-assistance endpoints."""

from fastapi import APIRouter, Depends

from app.models import User
from app.schemas import AiRequest
from app.security import require_user
from app.services.ai_assistant import generate_json


router = APIRouter(prefix="/api/v1/ai", tags=["ai"])


@router.post("/lyrics")
def write_lyrics(request: AiRequest, _: User = Depends(require_user)):
    result = generate_json(
        f"Write song lyrics in {request.language}. Concept: {request.prompt}. "
        f"Genre: {request.genre}. Mood: {request.mood}. "
        'Use [Verse]/[Chorus]/[Bridge] tags. Return JSON: {"title": str, "lyrics": str}'
    )
    return {
        "title": str(result.get("title", ""))[:200],
        "lyrics": str(result.get("lyrics", ""))[:5000],
    }


@router.post("/enhance-prompt")
def enhance_prompt(request: AiRequest, _: User = Depends(require_user)):
    result = generate_json(
        "Rewrite as a concise music-generation prompt (style, instruments, mood, "
        "tempo, vocals), keeping the original intent, max 80 words: "
        f'"{request.prompt}". Return JSON: {{"prompt": str}}'
    )
    prompt = str(result.get("prompt", request.prompt))
    return {"prompt": " ".join(prompt.split()[:100])}
