"""MelodyAI backend: AI assistance, music generation, DB-backed worker, tracks."""
import base64, json, logging, math, os, struct, threading, time, uuid, wave
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen
import bcrypt, jwt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, create_engine, func, inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

_ROOT = Path(__file__).resolve().parents[2]
load_dotenv()
load_dotenv(_ROOT / ".env", override=True)
log = logging.getLogger("melodyai"); logging.basicConfig(level=logging.INFO)
E = os.getenv
SECRET = E("APP_SECRET_KEY", "dev-secret-change-me")
STORE = Path(E("LOCAL_STORAGE_PATH", "./storage")); STORE.mkdir(parents=True, exist_ok=True)
MAXDUR = int(E("MAX_GENERATION_DURATION_SECONDS", "180"))
MAXCONC = int(E("MAX_CONCURRENT_GENERATIONS_PER_USER", "1"))
PROVIDER = E("MUSIC_PROVIDER", "kie")
MUSIC_MODEL = E("MUSIC_MODEL") or "lyria-3.5"
KIE_MODEL = E("KIE_MODEL") or "V6_MINI"
KIE_API_BASE = E("KIE_API_BASE", "https://api.kie.ai").rstrip("/")
if PROVIDER == "mock": log.warning("MOCK music provider enabled: output is demo audio, NOT AI-generated music.")
engine = create_engine(E("DATABASE_URL", "sqlite:///./melodyai.db"), pool_pre_ping=True)
now = lambda: datetime.now(timezone.utc)
uid = lambda: str(uuid.uuid4())

class Base(DeclarativeBase): pass
class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(100), default="")
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
class Generation(Base):
    __tablename__ = "generations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    prompt: Mapped[str] = mapped_column(Text)
    lyrics: Mapped[str] = mapped_column(Text, default="")
    settings_json: Mapped[str] = mapped_column(Text, default="{}")
    provider: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    error_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
class Track(Base):
    __tablename__ = "tracks"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    generation_id: Mapped[str] = mapped_column(ForeignKey("generations.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    storage_key: Mapped[str] = mapped_column(String(200))
    content_type: Mapped[str] = mapped_column(String(50))
    duration_seconds: Mapped[int] = mapped_column(Integer)
    file_size_bytes: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
if "users" in inspect(engine).get_table_names():
    user_columns = {column["name"] for column in inspect(engine).get_columns("users")}
    if "name" not in user_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE users ADD COLUMN name VARCHAR(100) NOT NULL DEFAULT ''"))
Base.metadata.create_all(engine)
with Session(engine) as s:
    for user in s.scalars(select(User).where(User.name == "")):
        user.name = user.email.partition("@")[0].replace(".", " ").replace("_", " ").replace("-", " ").title()
    s.commit()

class Cred(BaseModel):
    email: str = Field(min_length=5, max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=8, max_length=72)
class RegisterIn(Cred):
    name: str = Field(min_length=1, max_length=100)
    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Name cannot be blank")
        return value
def _max_words(v: str) -> str:
    if len(v.split()) > 100: raise ValueError("Prompt must be 100 words or fewer")
    return v
class GenIn(BaseModel):
    title: str = Field(default="Untitled", max_length=200)
    prompt: str = Field(min_length=3)
    lyrics: str = Field(default="", max_length=5000)
    genre: str = ""; mood: str = ""; language: str = "English"; instrumental: bool = False
    duration: int = Field(default=60, ge=5)
    _w = field_validator("prompt")(lambda cls, v: _max_words(v))
class AiIn(BaseModel):
    prompt: str = Field(min_length=3)
    genre: str = ""; mood: str = ""; language: str = "English"
    _w = field_validator("prompt")(lambda cls, v: _max_words(v))
class Rename(BaseModel): title: str = Field(min_length=1, max_length=200)

def db():
    with Session(engine) as s: yield s
def user_dep(authorization: str = Header(default=""), s: Session = Depends(db)) -> User:
    try: uid_ = jwt.decode(authorization.removeprefix("Bearer "), SECRET, algorithms=["HS256"])["sub"]
    except Exception: raise HTTPException(401, "Not authenticated")
    u = s.get(User, uid_)
    if not u: raise HTTPException(401, "Not authenticated")
    return u
def token(u):
    exp = now() + timedelta(minutes=int(E("ACCESS_TOKEN_EXPIRE_MINUTES", "60")))
    return {"access_token": jwt.encode({"sub": u.id, "exp": exp}, SECRET, algorithm="HS256")}

app = FastAPI(title="MelodyAI")
app.add_middleware(CORSMiddleware, allow_origins=[E("FRONTEND_ORIGIN", "http://localhost:5173")],
                   allow_methods=["*"], allow_headers=["*"])
@app.get("/health")
def health(): return {"ok": True, "provider": PROVIDER}
@app.post("/api/v1/auth/register", status_code=201)
def register(c: RegisterIn, s: Session = Depends(db)):
    if s.scalar(select(User).where(User.email == c.email.lower())): raise HTTPException(409, "Email already registered")
    u = User(name=c.name, email=c.email.lower(), password_hash=bcrypt.hashpw(c.password.encode(), bcrypt.gensalt()).decode())
    s.add(u)
    try:
        s.commit()
    except IntegrityError as e:
        s.rollback()
        if s.scalar(select(User.id).where(User.email == c.email.lower())):
            raise HTTPException(409, "Email already registered") from e
        raise
    return token(u)
@app.post("/api/v1/auth/login")
def login(c: Cred, s: Session = Depends(db)):
    u = s.scalar(select(User).where(User.email == c.email.lower()))
    if not u or not bcrypt.checkpw(c.password.encode(), u.password_hash.encode()): raise HTTPException(401, "Invalid credentials")
    return token(u)
@app.get("/api/v1/auth/me")
def me(u: User = Depends(user_dep)): return {"id": u.id, "name": u.name, "email": u.email}

def gemini_json(prompt: str) -> dict:
    key = E("GEMINI_API_KEY")
    if not key: raise HTTPException(503, "Gemini is not configured (set GEMINI_API_KEY)")
    from google import genai
    client = genai.Client(api_key=key)
    for attempt in range(3):
        try:
            r = client.models.generate_content(model=E("GEMINI_MODEL") or "gemini-2.5-flash", contents=prompt,
                                               config={"response_mime_type": "application/json"})
            return json.loads(r.text)
        except Exception as e:
            log.warning("Gemini attempt %d failed: %s", attempt + 1, type(e).__name__); time.sleep(2 ** attempt)
    raise HTTPException(502, "AI service temporarily unavailable")
@app.post("/api/v1/ai/lyrics")
def ai_lyrics(b: AiIn, _: User = Depends(user_dep)):
    d = gemini_json(f'Write song lyrics in {b.language}. Concept: {b.prompt}. Genre: {b.genre}. Mood: {b.mood}. '
                    'Use [Verse]/[Chorus]/[Bridge] tags. Return JSON: {"title": str, "lyrics": str}')
    return {"title": str(d.get("title", ""))[:200], "lyrics": str(d.get("lyrics", ""))[:5000]}
@app.post("/api/v1/ai/enhance-prompt")
def ai_enhance(b: AiIn, _: User = Depends(user_dep)):
    d = gemini_json('Rewrite as a concise music-generation prompt (style, instruments, mood, tempo, vocals), '
                    f'keeping the original intent, max 80 words: "{b.prompt}". Return JSON: {{"prompt": str}}')
    return {"prompt": " ".join(str(d.get("prompt", b.prompt)).split()[:100])}

def mock_provider(g: Generation, path: Path) -> int:
    seconds = min(json.loads(g.settings_json).get("duration", 20), MAXDUR, 30); rate = 22050
    notes = [261.6, 293.7, 329.6, 392.0, 440.0]; seed = sum(map(ord, g.id)) % 5
    buf = bytearray()
    for i in range(rate * seconds):
        f = notes[(i // (rate // 2) + seed) % 5]
        buf += struct.pack("<h", int(7000 * math.sin(2 * math.pi * f * i / rate)))
    time.sleep(3)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(bytes(buf))
    return seconds

def _audio_bytes(data) -> bytes:
    if data is None: raise RuntimeError("Lyria returned no audio")
    if isinstance(data, (bytes, bytearray)): return bytes(data)
    if isinstance(data, str): return base64.b64decode(data)
    inner = getattr(data, "data", None)
    if inner is not None and inner is not data: return _audio_bytes(inner)
    return base64.b64decode(str(data))

def _sniff_audio(raw: bytes) -> tuple[str, str]:
    if raw.startswith(b"RIFF") and b"WAVE" in raw[:16]: return "audio/wav", ".wav"
    if raw.startswith(b"ID3") or (len(raw) > 1 and raw[0] == 0xFF and raw[1] & 0xE0 == 0xE0):
        return "audio/mpeg", ".mp3"
    if raw.startswith(b"fLaC"): return "audio/flac", ".flac"
    if raw.startswith(b"OggS"): return "audio/ogg", ".ogg"
    return "audio/mpeg", ".mp3"

def _wav_seconds(path: Path, fallback: int) -> int:
    try:
        with wave.open(str(path), "rb") as w:
            return max(1, int(round(w.getnframes() / float(w.getframerate()))))
    except Exception:
        return fallback

def _music_prompt(g: Generation) -> str:
    s = json.loads(g.settings_json or "{}")
    seconds = min(int(s.get("duration") or 60), MAXDUR)
    bits = [f"Create a complete {seconds}-second song from this description:", g.prompt.strip()]
    if s.get("genre"): bits.append(f"Genre: {s['genre']}.")
    if s.get("mood"): bits.append(f"Mood: {s['mood']}.")
    lang = s.get("language") or "English"
    if s.get("instrumental"):
        bits.append("Instrumental only — no vocals, no singing, no spoken words.")
    else:
        bits.append(f"Include vocals in {lang}.")
        if (g.lyrics or "").strip():
            bits.append("Sing these lyrics:\n" + g.lyrics.strip())
    return "\n".join(bits)

def _genai_client():
    key = E("GEMINI_API_KEY")
    if not key: raise RuntimeError("GEMINI_API_KEY is not set")
    from google import genai
    from google.genai import types
    return genai.Client(api_key=key, http_options=types.HttpOptions(timeout=600_000))

def _audio_from_interactions(client, model: str, prompt: str) -> tuple[bytes, str]:
    interaction = client.interactions.create(
        model=model, input=prompt, response_format={"type": "audio"})
    audio_block = getattr(interaction, "output_audio", None)
    if not audio_block or getattr(audio_block, "data", None) is None:
        raise RuntimeError("Lyria interactions returned no audio")
    return _audio_bytes(audio_block.data), (getattr(interaction, "output_text", None) or "").strip()

def lyria_provider(g: Generation, path: Path) -> int:
    s = json.loads(g.settings_json or "{}")
    fallback = min(int(s.get("duration") or 60), MAXDUR)
    prompt = _music_prompt(g)
    client = _genai_client()
    audio, extra = _audio_from_interactions(client, MUSIC_MODEL, prompt)
    path.write_bytes(audio)
    if extra and not (g.lyrics or "").strip():
        g.lyrics = extra[:5000]
    mime, _ext = _sniff_audio(audio)
    if mime == "audio/wav":
        return _wav_seconds(path, fallback)
    return fallback

def _kie_request(method: str, endpoint: str, *, payload=None, query=None):
    key = E("KIE_API_KEY")
    if not key:
        raise RuntimeError("KIE_API_KEY is not set")
    url = f"{KIE_API_BASE}{endpoint}"
    if query:
        url = f"{url}?{urlencode(query)}"
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = Request(url, data=body, method=method, headers={
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    })
    try:
        with urlopen(request, timeout=30) as response:
            raw = response.read(1_000_001)
    except HTTPError as e:
        raw = e.read(16_384)
        try:
            detail = json.loads(raw).get("msg", "")
        except (ValueError, AttributeError):
            detail = ""
        raise RuntimeError(f"Kie API returned HTTP {e.code}: {detail or 'request failed'}") from e
    except URLError as e:
        raise RuntimeError(f"Kie API request failed: {e.reason}") from e
    if len(raw) > 1_000_000:
        raise RuntimeError("Kie API response exceeded the size limit")
    try:
        result = json.loads(raw)
    except (ValueError, UnicodeDecodeError) as e:
        raise RuntimeError("Kie API returned invalid JSON") from e
    if not isinstance(result, dict):
        raise RuntimeError("Kie API returned an unexpected response")
    if result.get("code") != 200:
        raise RuntimeError(f"Kie API error {result.get('code')}: {result.get('msg', 'request failed')}")
    return result.get("data")

def _kie_audio_result(task: dict):
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

def kie_provider(g: Generation, path: Path) -> int:
    settings = json.loads(g.settings_json or "{}")
    key = E("KIE_API_KEY")
    if not key:
        raise RuntimeError("KIE_API_KEY is not set")
    duration = min(int(settings.get("duration") or 60), MAXDUR)
    style = ", ".join(str(value).strip() for value in (
        settings.get("genre"), settings.get("mood")
    ) if value and str(value).strip())
    prompt = f"{g.prompt.strip()} Aim for a song around {duration} seconds."
    if not settings.get("instrumental") and settings.get("language"):
        prompt += f" Vocals should be in {settings['language']}."
    payload = {
        "model": "ai-music-api/generate",
        "input": {
            "prompt": prompt,
            "style": style or "Pop",
            "title": (g.title or "Untitled")[:80],
            "custom_mode": False,
            "instrumental": bool(settings.get("instrumental")),
            "model": KIE_MODEL,
        },
    }
    if (g.lyrics or "").strip() and not settings.get("instrumental"):
        payload["input"]["lyrics"] = g.lyrics.strip()[:5000]
    created = _kie_request("POST", "/api/v1/jobs/createTask", payload=payload)
    task_id = created.get("taskId") if isinstance(created, dict) else None
    if not task_id:
        raise RuntimeError("Kie API did not return a task ID")

    deadline = time.monotonic() + 600
    wait_seconds = 3
    while time.monotonic() < deadline:
        time.sleep(wait_seconds)
        task = _kie_request("GET", "/api/v1/jobs/recordInfo", query={"taskId": task_id})
        if not isinstance(task, dict):
            raise RuntimeError("Kie API returned invalid task status")
        state = task.get("state")
        if state == "success":
            audio_url, actual_duration = _kie_audio_result(task)
            path_url = urlparse(audio_url)
            if path_url.scheme != "https" or not path_url.hostname:
                raise RuntimeError("Kie API returned an invalid audio URL")
            try:
                with urlopen(Request(audio_url, headers={"Accept": "audio/*"}), timeout=60) as response:
                    audio = response.read(100_000_001)
            except (HTTPError, URLError) as e:
                raise RuntimeError(f"Could not download generated Kie audio: {e}") from e
            if len(audio) > 100_000_000:
                raise RuntimeError("Generated Kie audio exceeded the 100 MB limit")
            path.write_bytes(audio)
            return max(1, int(float(actual_duration))) if actual_duration else duration
        if state == "fail":
            raise RuntimeError(f"Kie music generation failed ({task.get('failCode', 'unknown')}): "
                               f"{task.get('failMsg', 'no details')}")
        if state not in {"waiting", "queuing", "generating"}:
            raise RuntimeError(f"Kie API returned unknown task state: {state}")
        wait_seconds = min(wait_seconds + 1, 8)
    raise TimeoutError("Kie music generation exceeded the 10-minute timeout")

PROVIDERS = {"mock": mock_provider, "lyria": lyria_provider, "kie": kie_provider}

def run_one() -> bool:
    with Session(engine) as s:
        g = s.scalar(select(Generation).where(Generation.status == "queued").order_by(Generation.created_at)
                     .limit(1).with_for_update(skip_locked=True))
        if not g: return False
        g.status = "processing"; s.commit()
        tmp = STORE / f"{uid()}.bin"; path = tmp
        try:
            dur = PROVIDERS[g.provider](g, tmp)
            lyrics_update = g.lyrics
            s.refresh(g)
            if lyrics_update: g.lyrics = lyrics_update
            if g.status == "cancelled": tmp.unlink(missing_ok=True); return True
            raw = tmp.read_bytes()
            mime, ext = _sniff_audio(raw)
            key = tmp.stem + ext
            path = STORE / key
            if path != tmp:
                path.write_bytes(raw); tmp.unlink(missing_ok=True)
            title = g.title + (" (MOCK demo audio)" if g.provider == "mock" else "")
            s.add(Track(user_id=g.user_id, generation_id=g.id, title=title, storage_key=key, content_type=mime,
                        duration_seconds=dur, file_size_bytes=path.stat().st_size))
            g.status = "completed"; g.completed_at = now()
        except Exception as e:
            log.exception("generation %s failed", g.id); tmp.unlink(missing_ok=True); path.unlink(missing_ok=True)
            g.status = "failed"; g.error_code = type(e).__name__[:50]
        s.commit(); return True
def worker_loop():
    while True:
        try:
            if not run_one(): time.sleep(1)
        except Exception: log.exception("worker error"); time.sleep(3)
@app.on_event("startup")
def start_worker():
    with Session(engine) as s:
        for g in s.scalars(select(Generation).where(Generation.status == "processing")): g.status = "queued"
        s.commit()
    threading.Thread(target=worker_loop, daemon=True).start()

def gen_out(g): return {"id": g.id, "title": g.title, "prompt": g.prompt, "status": g.status, "error_code": g.error_code,
                        "created_at": g.created_at, "provider": g.provider}
def trk_out(t, g=None):
    d = {"id": t.id, "title": t.title, "duration_seconds": t.duration_seconds, "created_at": t.created_at,
         "generation_id": t.generation_id, "content_type": t.content_type}
    if g: d.update(prompt=g.prompt, lyrics=g.lyrics, settings=json.loads(g.settings_json), provider=g.provider)
    return d
@app.get("/api/v1/music-provider/capabilities")
def caps():
    model = MUSIC_MODEL if PROVIDER == "lyria" else KIE_MODEL if PROVIDER == "kie" else PROVIDER
    return {"provider": PROVIDER, "max_duration": 30 if PROVIDER == "mock" else MAXDUR, "model": model}
@app.post("/api/v1/generations", status_code=202)
def create_gen(b: GenIn, u: User = Depends(user_dep), s: Session = Depends(db)):
    active = s.scalar(select(func.count()).select_from(Generation).where(
        Generation.user_id == u.id, Generation.status.in_(["queued", "processing"])))
    if active >= MAXCONC: raise HTTPException(429, "You already have a generation in progress")
    if PROVIDER not in PROVIDERS: raise HTTPException(503, f"Provider '{PROVIDER}' is not implemented")
    if PROVIDER == "lyria" and not E("GEMINI_API_KEY"):
        raise HTTPException(503, "Gemini is not configured (set GEMINI_API_KEY)")
    if PROVIDER == "kie" and not E("KIE_API_KEY"):
        raise HTTPException(503, "Kie is not configured (set KIE_API_KEY)")
    g = Generation(user_id=u.id, title=b.title, prompt=b.prompt, lyrics=b.lyrics, provider=PROVIDER,
                   settings_json=json.dumps({"genre": b.genre, "mood": b.mood, "language": b.language,
                                             "instrumental": b.instrumental, "duration": min(b.duration, MAXDUR)}))
    s.add(g); s.commit(); return gen_out(g)
def owned(s, model, id_, u):
    o = s.get(model, id_)
    if not o or o.user_id != u.id: raise HTTPException(404, "Not found")
    return o
@app.get("/api/v1/generations/{gid}")
def get_gen(gid: str, u: User = Depends(user_dep), s: Session = Depends(db)): return gen_out(owned(s, Generation, gid, u))
@app.post("/api/v1/generations/{gid}/cancel")
def cancel(gid: str, u: User = Depends(user_dep), s: Session = Depends(db)):
    g = owned(s, Generation, gid, u)
    if g.status in ("queued", "processing"): g.status = "cancelled"; s.commit()
    return gen_out(g)
@app.get("/api/v1/generations")
def list_gens(u: User = Depends(user_dep), s: Session = Depends(db)):
    return [gen_out(g) for g in s.scalars(select(Generation).where(Generation.user_id == u.id).order_by(Generation.created_at.desc()).limit(50))]
@app.get("/api/v1/tracks")
def list_tracks(q: str = "", page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=100),
                u: User = Depends(user_dep), s: Session = Depends(db)):
    st = (select(Track, Generation).join(Generation, Track.generation_id == Generation.id)
          .where(Track.user_id == u.id, Track.title.ilike(f"%{q}%"))
          .order_by(Track.created_at.desc()))
    return [trk_out(t, g) for t, g in s.execute(st.offset((page - 1) * size).limit(size))]
@app.get("/api/v1/tracks/{tid}")
def get_track(tid: str, u: User = Depends(user_dep), s: Session = Depends(db)):
    t = owned(s, Track, tid, u); return trk_out(t, s.get(Generation, t.generation_id))
@app.patch("/api/v1/tracks/{tid}")
def rename(tid: str, b: Rename, u: User = Depends(user_dep), s: Session = Depends(db)):
    t = owned(s, Track, tid, u); t.title = b.title; s.commit(); return trk_out(t)
@app.delete("/api/v1/tracks/{tid}", status_code=204)
def delete_track(tid: str, u: User = Depends(user_dep), s: Session = Depends(db)):
    t = owned(s, Track, tid, u); (STORE / Path(t.storage_key).name).unlink(missing_ok=True); s.delete(t); s.commit()
@app.get("/api/v1/tracks/{tid}/audio")
def audio(tid: str, u: User = Depends(user_dep), s: Session = Depends(db)):
    t = owned(s, Track, tid, u)
    ext = Path(t.storage_key).suffix or ".wav"
    return FileResponse(STORE / Path(t.storage_key).name, media_type=t.content_type, filename=f"{t.title}{ext}")
