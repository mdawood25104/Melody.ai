"""Application settings loaded from environment variables and the project .env file."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv()
load_dotenv(PROJECT_ROOT / ".env", override=True)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("melodyai")

SECRET_KEY = os.getenv("APP_SECRET_KEY", "dev-secret-change-me")
STORAGE_PATH = Path(os.getenv("LOCAL_STORAGE_PATH", "storage"))
if not STORAGE_PATH.is_absolute():
    STORAGE_PATH = PROJECT_ROOT / STORAGE_PATH
STORAGE_PATH = STORAGE_PATH.resolve()
STORAGE_PATH.mkdir(parents=True, exist_ok=True)

MAX_GENERATION_DURATION_SECONDS = int(os.getenv("MAX_GENERATION_DURATION_SECONDS", "180"))
MAX_CONCURRENT_GENERATIONS_PER_USER = int(
    os.getenv("MAX_CONCURRENT_GENERATIONS_PER_USER", "1")
)

MUSIC_PROVIDER = os.getenv("MUSIC_PROVIDER", "kie")
MUSIC_MODEL = os.getenv("MUSIC_MODEL") or "lyria-3.5"
KIE_MODEL = os.getenv("KIE_MODEL") or "V6_MINI"
KIE_API_BASE = os.getenv("KIE_API_BASE", "https://api.kie.ai").rstrip("/")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

if MUSIC_PROVIDER == "mock":
    logger.warning("MOCK music provider enabled: output is demo audio, NOT AI-generated music.")
