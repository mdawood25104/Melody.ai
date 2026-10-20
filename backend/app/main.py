"""FastAPI application assembly and process startup."""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import FRONTEND_ORIGIN, MUSIC_PROVIDER
from app.database import initialize_database
from app.errors import register_error_handlers
from app.routers import ai, auth, music
from app.services.generation_worker import start_generation_worker


logger = logging.getLogger("melodyai")
app = FastAPI(title="MelodyAI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)
register_error_handlers(app)

app.include_router(auth.router)
app.include_router(ai.router)
app.include_router(music.router)


@app.get("/health")
def health():
    """Expose the configured music provider for container health checks."""
    return {"ok": True, "provider": MUSIC_PROVIDER}


@app.on_event("startup")
def startup() -> None:
    """Initialize existing database installations before starting the queue."""
    initialize_database()
    start_generation_worker()
    logger.info("MelodyAI backend started with provider '%s'", MUSIC_PROVIDER)
