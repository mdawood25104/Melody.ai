# MelodyAI

React + FastAPI + PostgreSQL/SQLite. Gemini writes lyrics and improves prompts; Kie.ai's Suno music API generates songs.

## Project structure
The backend is organized by responsibility rather than keeping application code in one entry point:
- `backend/app/main.py` assembles FastAPI, middleware, routers, and startup.
- `backend/app/config.py`, `database.py`, and `models.py` contain configuration and persistence.
- `backend/app/schemas.py`, `security.py`, and `errors.py` handle request validation, authentication, and API errors.
- `backend/app/routers/` contains account, AI-assistance, and music/library endpoints.
- `backend/app/services/` contains Gemini and music-provider integrations plus the generation worker.
- `frontend/src/App.tsx` owns route selection and the top-level error boundary.
- `frontend/src/pages/` contains the landing, account, and studio screens; `components/` contains reusable visual and track components.
- `frontend/src/api.ts` centralizes API/error handling, while `types.ts` defines shared client-side models.
- `frontend/src/index.css` contains the application styles.

Generated audio is stored in the project-level `storage/` directory for local development and is mounted at `/data` in Docker. `LOCAL_STORAGE_PATH` can override this location. Keep the database and audio directory together when switching between local and Docker runs; database records do not contain the audio files themselves.

## Setup A: Docker (recommended)
```bash
# Ensure .env has APP_SECRET_KEY, GEMINI_API_KEY, and KIE_API_KEY
docker compose up --build
```
Open http://localhost:5173 (API docs: http://localhost:8000/docs).

## Setup B: Local backend and frontend (Python 3.11+, Node 20+, Docker)
```bash
docker compose up -d db
cd backend && python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload                                     # http://localhost:8000
# second terminal
cd frontend && npm install && npm run dev                         # http://localhost:5173
```
Run uvicorn from `backend/`. The root `.env` is loaded automatically and should set `DATABASE_URL` to `postgresql+psycopg://postgres:postgres@localhost:5433/melodyai`; the included `db` service publishes PostgreSQL on port 5433. Use Setup A to run the full app in Docker instead.

## Accounts and saved credentials
Account details are stored in PostgreSQL, in the `melodyai` database configured by `DATABASE_URL`. In local development this is the Docker PostgreSQL service on `localhost:5433`; its data persists in the `pgdata` Docker volume. Docker Compose connects the backend to that same database service internally. Each account stores its name, email, and a **bcrypt password hash**—never the plain-text password. Existing accounts are kept when the `name` column is added. Sign-in tokens are stored in the browser and expire after `ACCESS_TOKEN_EXPIRE_MINUTES` (60 minutes by default); signing out removes the browser's saved token without deleting the account.

## Use it
Register, write a prompt (max 100 words), optionally click Generate lyrics / Improve prompt, then Generate song. Play, download, rename, and delete from the library.

## Gemini and Kie.ai music
Set `GEMINI_API_KEY` for lyrics and prompt improvement. Create a music API key at https://kie.ai/api-key and set `KIE_API_KEY`; the key is only used by the backend. The default music provider is Kie.ai (`MUSIC_PROVIDER=kie`) with the faster `KIE_MODEL=V6_MINI`. Kie.ai creates an asynchronous Suno task, which the backend polls and downloads when complete. Generation time and cost depend on the Kie.ai account and model. Use `MUSIC_PROVIDER=lyria` to switch back to Google Lyria, or `MUSIC_PROVIDER=mock` only for demo tones. Refer to [Kie.ai's music API docs](https://docs.kie.ai/suno-api/generate-music) and [task status docs](https://docs.kie.ai/market/common/get-task-detail) for current limits and pricing.

The selected music provider is saved with each generation. Switching providers affects new songs only; existing tracks remain in the library. The studio shows a general AI-generated label rather than the backend provider/model name. Restart the backend after changing `.env`.

## Common errors
- "Gemini is not configured": `GEMINI_API_KEY` is missing.
- "Kie is not configured": `KIE_API_KEY` is missing.
- 429 "generation in progress": limited by `MAX_CONCURRENT_GENERATIONS_PER_USER`.
- Port in use: change ports in `docker-compose.yml`.
- API errors include a request reference ID; use it to match the response to backend logs (`docker compose logs -f --tail=100 backend`). Failed song generations save a sanitized provider message and show it in Activity.

## Not included yet
Alembic migrations (tables auto-create at startup), Tailwind/shadcn, waveform, SSE, rate limiting, automated tests, retry endpoint, S3 storage, separate worker container (the worker runs as a thread in the API process).
