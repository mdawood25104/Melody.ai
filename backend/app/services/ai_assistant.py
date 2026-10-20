"""Gemini-backed lyric writing and music-prompt enhancement."""

import json
import logging
import os
import time

from fastapi import HTTPException


logger = logging.getLogger("melodyai")


def generate_json(prompt: str) -> dict:
    """Call Gemini with bounded retries and return its JSON response."""
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        raise HTTPException(503, "Gemini is not configured (set GEMINI_API_KEY)")

    from google import genai

    client = genai.Client(api_key=key)
    for attempt in range(3):
        try:
            response = client.models.generate_content(
                model=os.getenv("GEMINI_MODEL") or "gemini-2.5-flash",
                contents=prompt,
                config={"response_mime_type": "application/json"},
            )
            return json.loads(response.text)
        except Exception as error:
            logger.warning(
                "Gemini attempt %d failed (%s)",
                attempt + 1,
                type(error).__name__,
            )
            time.sleep(2**attempt)
    raise HTTPException(502, "AI service temporarily unavailable")
