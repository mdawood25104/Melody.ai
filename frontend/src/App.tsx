import { Component, useCallback, useEffect, useMemo, useState } from "react";

type IconName = "arrow" | "spark" | "play" | "music" | "home" | "library" | "activity" | "plus" | "search" | "logout" | "download" | "edit" | "trash" | "close" | "check" | "clock" | "wave" | "headphones" | "wand" | "menu" | "chevron" | "refresh" | "heart";
type Generation = { id: string; title: string; prompt: string; status: string; error_code?: string | null; created_at: string; provider: string };
type Track = { id: string; title: string; duration_seconds: number; created_at: string; generation_id: string; content_type: string; prompt?: string; lyrics?: string; provider?: string; settings?: Record<string, unknown> };
type Form = { title: string; prompt: string; lyrics: string; genre: string; mood: string; language: string; instrumental: boolean; duration: number };
type Screen = "home" | "auth" | "studio";
type StudioTab = "create" | "library" | "activity";

const initialForm: Form = { title: "", prompt: "", lyrics: "", genre: "Pop", mood: "Cinematic", language: "English", instrumental: false, duration: 60 };
const samples = ["A late-night drive through a neon-lit city", "A hopeful sunrise after the hardest year", "A warm, dusty soul record from another era"];

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    arrow: <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>,
    spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" /><path d="m19 14 1.2 2.8L23 18l-2.8 1.2L19 22l-1.2-2.8L15 18l2.8-1.2L19 14Z" /></>,
    play: <path d="m8 5 12 7-12 7V5Z" />,
    music: <><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>,
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9" /><path d="M9 20v-6h6v6" /></>,
    library: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z" /><path d="M4 16a2 2 0 0 1 2-2h14" /><path d="M8 7h8M8 10h8" /></>,
    activity: <><path d="M3 12h4l3-8 4 16 3-8h4" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5M12 15V3" /></>,
    edit: <><path d="m15 5 4 4M4 20l4-.8L19 8a2.8 2.8 0 0 0-4-4L4 15z" /></>,
    trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    wave: <><path d="M2 10v4M6 6v12M10 3v18M14 7v10M18 5v14M22 9v6" /></>,
    headphones: <><path d="M3 14v-3a9 9 0 0 1 18 0v3" /><path d="M3 14h4v7H5a2 2 0 0 1-2-2zM17 14h4v5a2 2 0 0 1-2 2h-2z" /></>,
    wand: <><path d="m15 4 5 5M4 20 16 8M7 4v4M5 6h4M18 15v4M16 17h4" /></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
    chevron: <path d="m7 10 5 5 5-5" />,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9A7 7 0 0 1 18 6l2 2M4 16l2 2a7 7 0 0 0 12.4-3" /></>,
    heart: <path d="M20.8 8.8c0 5.5-8.8 10-8.8 10s-8.8-4.5-8.8-10A4.8 4.8 0 0 1 12 6a4.8 4.8 0 0 1 8.8 2.8Z" />,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

async function call(path: string, opts: RequestInit = {}) {
  let token: string | null;
  try { token = localStorage.getItem("t"); }
  catch { throw new ApiError("Browser storage is unavailable. Enable site storage and try again.", 0); }
  let response: Response;
  try {
    response = await fetch("/api/v1" + path, {
      ...opts,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts.headers },
    });
  } catch {
    throw new ApiError("Could not reach MelodyAI. Check that the backend is running, then try again.", 0);
  }
  if (!response.ok) {
    if (response.status === 401) {
      try { localStorage.removeItem("t"); } catch { /* The original authentication error is more useful. */ }
    }
    const error = await response.json().catch(() => ({}));
    const detail = typeof error.detail === "string" ? error.detail : error.detail?.[0]?.msg;
    throw new ApiError(detail || response.statusText || `Request failed (${response.status}).`, response.status);
  }
  return response;
}
const api = async <T,>(path: string, opts?: RequestInit): Promise<T> => {
  const response = await call(path, opts);
  if (response.status === 204) return null as T;
  try { return await response.json() as T; }
  catch { throw new ApiError("The server returned an invalid response. Please try again.", response.status); }
};
const wordCount = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;
const formatDate = (date: string) => new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const sourceLabel = (provider?: string) => provider === "mock" ? "Demo audio" : "AI-generated song";

function Brand({ onClick }: { onClick?: () => void }) {
  return <button className="brand" onClick={onClick} aria-label="MelodyAI home"><span className="brand-mark"><Icon name="wave" size={20} /></span><span>melody<span className="brand-ai">.ai</span></span></button>;
}

function Waveform({ bars = 36 }: { bars?: number }) {
  return <div className="waveform" aria-hidden="true">{Array.from({ length: bars }, (_, index) => <i key={index} style={{ "--bar": `${14 + ((index * 17 + index * index * 3) % 85)}%`, "--delay": `${(index % 9) * -0.11}s` } as React.CSSProperties} />)}</div>;
}

function Landing({ onAuth }: { onAuth: (mode: "register" | "login") => void }) {
  return <main className="landing">
    <header className="site-header">
      <div className="site-nav"><Brand onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} />
        <nav className="public-nav" aria-label="Main navigation">
          <a href="#home">Home</a><a href="#about">About</a>
          <button className="button button-primary button-nav" onClick={() => onAuth("register")}>Try it now <Icon name="arrow" size={16} /></button>
          <button className="button button-outline button-nav" onClick={() => onAuth("login")}>Sign in</button>
        </nav>
      </div>
    </header>
    <section className="hero-section" id="home">
      <div className="hero-glow hero-glow-one" /><div className="hero-glow hero-glow-two" />
      <div className="hero-content">
        <div className="eyebrow"><span className="eyebrow-dot" /> YOUR IDEAS, IN FULL COLOR</div>
        <h1>Make music<br />that <span className="text-gradient">feels like you.</span></h1>
        <p className="hero-copy">Turn the sound in your head into a song you can actually hear. One idea, a little imagination, and you’re off.</p>
        <div className="hero-actions"><button className="button button-primary button-large" onClick={() => onAuth("register")}>Create your first song <Icon name="arrow" size={18} /></button><a className="text-link" href="#about">See how it works <span>↓</span></a></div>
        <div className="hero-note"><span className="avatar-stack"><i>M</i><i>J</i><i>A</i></span><span>For daydreamers, playlist makers &amp; almost-musicians.</span></div>
      </div>
      <div className="hero-art" aria-label="Abstract music artwork">
        <div className="orbit orbit-outer" /><div className="orbit orbit-inner" />
        <div className="art-disc"><div className="disc-lines" /><div className="disc-center"><Icon name="wave" size={34} /></div></div>
        <div className="floating-note note-one">♪</div><div className="floating-note note-two">♫</div><div className="floating-note note-three">✳</div>
        <div className="now-playing"><span className="playing-icon"><Icon name="music" size={17} /></span><div><b>something from nothing</b><small>your next favorite song</small></div><span className="playing-bars"><i /><i /><i /><i /></span></div>
        <div className="art-caption">A whole new kind of <span>playlist.</span></div>
      </div>
      <div className="hero-scroll"><span /> SCROLL TO EXPLORE</div>
    </section>
    <section className="about-section" id="about">
      <div className="section-heading"><div className="eyebrow"><span className="eyebrow-dot" /> THE IDEA IS YOURS</div><h2>From a passing thought<br />to a <span className="text-gradient">full-on feeling.</span></h2><p>No instruments, studio, or music theory required. Just bring a feeling and let the creative part begin.</p></div>
      <div className="feature-grid">
        <article className="feature-card feature-prompt"><div className="feature-icon"><Icon name="wand" size={22} /></div><span className="feature-index">01 / THE IDEA</span><h3>Start with a feeling.</h3><p>A rainy-day thought? A made-up movie soundtrack? Describe what you hear. We’ll help turn a few words into a direction.</p><div className="mini-prompt"><span>♪</span> hazy afternoon, warm guitar, no rush</div></article>
        <article className="feature-card feature-write"><div className="feature-icon"><Icon name="spark" size={22} /></div><span className="feature-index">02 / THE DETAILS</span><h3>Make it yours.</h3><p>Pick a style, set the mood, add lyrics, or keep it instrumental. Tweak the ingredients until it sounds like your kind of magic.</p><div className="mini-tags"><span>Dream pop</span><span>+ Warm</span><span>+ You</span></div></article>
        <article className="feature-card feature-sound"><div className="feature-icon"><Icon name="headphones" size={22} /></div><span className="feature-index">03 / THE SOUND</span><h3>Press play on an idea.</h3><p>Your description becomes an original AI-generated track. Keep the ones you love, make another, and build a library that’s yours.</p><div className="feature-wave"><Waveform bars={24} /></div></article>
      </div>
    </section>
    <section className="cta-section"><div className="cta-noise" /><div className="eyebrow"><span className="eyebrow-dot" /> YOUR NEXT FAVORITE SONG ISN'T MADE YET</div><h2>Maybe it starts<br />with <span>you.</span></h2><button className="button button-dark button-large" onClick={() => onAuth("register")}>Make something <Icon name="arrow" size={18} /></button><div className="cta-orb">♫</div></section>
    <footer className="site-footer"><Brand onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} /><span>Made for the music in your head.</span><button onClick={() => onAuth("login")}>Sign in <Icon name="arrow" size={14} /></button><small>Design &amp; Developed by Tekkdev</small><small>© {new Date().getFullYear()} MelodyAI</small></footer>
  </main>;
}

function AuthScreen({ initialMode, onHome, onAuth }: { initialMode: "register" | "login"; onHome: () => void; onAuth: () => void }) {
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setMode(initialMode); setError(""); }, [initialMode]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const data = await api<{ access_token: string }>(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(mode === "register" ? { name: name.trim(), email: email.trim(), password } : { email: email.trim(), password }),
      });
      if (!data.access_token) throw new ApiError("The server did not return a sign-in token. Please try again.", 502);
      try { localStorage.setItem("t", data.access_token); }
      catch { throw new ApiError("Sign-in succeeded, but this browser could not save your session. Enable site storage and try again.", 0); }
      onAuth();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not complete your account request. Please try again."); }
    finally { setBusy(false); }
  };
  return <main className="auth-page">
    <div className="auth-backdrop"><div className="auth-ring auth-ring-one" /><div className="auth-ring auth-ring-two" /><div className="auth-glow" /></div>
    <header className="auth-header"><Brand onClick={onHome} /><button className="auth-back" onClick={onHome}>← Back to home</button></header>
    <section className="auth-layout">
      <div className="auth-story"><div className="eyebrow"><span className="eyebrow-dot" /> YOUR STUDIO, WHENEVER YOU NEED IT</div><h1>A little idea<br />can go <span className="text-gradient">a long way.</span></h1><p>Keep every sound, lyric, and late-night idea in one place. Your next song is closer than you think.</p><div className="auth-story-art"><div className="auth-disc"><div><Icon name="wave" size={30} /></div></div><Waveform bars={40} /></div><small>MAKE SPACE FOR WHAT YOU HEAR.</small></div>
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-tabs"><button type="button" className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); window.history.replaceState({}, "", "/signup"); setError(""); }}>Create account</button><button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); window.history.replaceState({}, "", "/signin"); setError(""); }}>Sign in</button></div>
        <div className="auth-card-heading"><span className="auth-card-icon"><Icon name="spark" size={22} /></span><h2>{mode === "register" ? "Your studio awaits." : "Good to have you back."}</h2><p>{mode === "register" ? "Create an account and make your first track." : "Pick up where your next song started."}</p></div>
        {mode === "register" && <><label className="field-label" htmlFor="auth-name">Your name</label><input id="auth-name" className="field-input" type="text" autoComplete="name" placeholder="What should we call you?" maxLength={100} value={name} onChange={(event) => setName(event.target.value)} required /></>}
        <label className="field-label" htmlFor="auth-email">Email address</label><input id="auth-email" className="field-input" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <label className="field-label" htmlFor="auth-password">Password</label><input id="auth-password" className="field-input" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} placeholder={mode === "register" ? "At least 8 characters" : "Your password"} minLength={mode === "register" ? 8 : undefined} value={password} onChange={(event) => setPassword(event.target.value)} required />
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-primary auth-submit" disabled={busy}>{busy ? <><span className="spinner" /> One moment…</> : <>{mode === "register" ? "Create my account" : "Sign in to MelodyAI"} <Icon name="arrow" size={17} /></>}</button>
        <p className="auth-switch">{mode === "register" ? "Already made an account?" : "New around here?"} <button type="button" onClick={() => { const next = mode === "register" ? "login" : "register"; setMode(next); window.history.replaceState({}, "", next === "login" ? "/signin" : "/signup"); setError(""); }}>{mode === "register" ? "Sign in" : "Create an account"}</button></p>
        <div className="auth-safe"><Icon name="check" size={15} /> Your music space is yours alone</div>
      </form>
    </section>
  </main>;
}

function TrackCard({ track, onRefresh, favorite, onFavorite }: { track: Track; onRefresh: () => void; favorite: boolean; onFavorite: () => void }) {
  const [audioUrl, setAudioUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(track.title);
  const [busy, setBusy] = useState(false);
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);
  const play = async () => {
    setLoading(true); setError("");
    try { const response = await call(`/tracks/${track.id}/audio`); setAudioUrl(URL.createObjectURL(await response.blob())); }
    catch (e) { setError(e instanceof Error ? e.message : "Audio could not be loaded."); }
    finally { setLoading(false); }
  };
  const rename = async () => {
    if (!title.trim()) { setError("A title is required."); return; }
    setBusy(true); setError("");
    try { await api(`/tracks/${track.id}`, { method: "PATCH", body: JSON.stringify({ title: title.trim() }) }); setEditing(false); onRefresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not rename this song."); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm(`Delete “${track.title}” from your library?`)) return;
    setBusy(true); setError("");
    try { await api(`/tracks/${track.id}`, { method: "DELETE" }); onRefresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not delete this song."); }
    finally { setBusy(false); }
  };
  const extension = track.content_type?.includes("mpeg") || track.content_type?.includes("mp3") ? ".mp3" : track.content_type?.includes("ogg") ? ".ogg" : ".wav";
  return <article className="track-card">
    <div className="track-art"><div className="track-disc"><Icon name="wave" size={26} /></div><div className="track-art-glint" /></div>
    <div className="track-main">
      <div className="track-topline"><span className="track-provider"><span />{sourceLabel(track.provider)}</span><span className="track-duration">{track.duration_seconds}s</span></div>
      {editing ? <div className="rename-row"><input aria-label="Song title" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void rename(); if (event.key === "Escape") setEditing(false); }} autoFocus /><button className="icon-button" aria-label="Save title" disabled={busy} onClick={() => void rename()}><Icon name="check" size={17} /></button><button className="icon-button" aria-label="Cancel rename" onClick={() => setEditing(false)}><Icon name="close" size={17} /></button></div> : <h3>{track.title}</h3>}
      <div className="track-meta">{formatDate(track.created_at)}{track.settings && typeof track.settings.genre === "string" ? ` · ${track.settings.genre}` : ""}</div>
      {audioUrl && <audio controls autoPlay src={audioUrl} className="track-audio" />}
      {error && <p className="inline-error">{error}</p>}
    </div>
    <div className="track-actions">
      <button className="icon-button favorite-button" aria-label={favorite ? "Remove from favorites" : "Add to favorites"} title={favorite ? "Remove from favorites" : "Add to favorites"} onClick={onFavorite}><Icon name="heart" size={18} /></button>
      {audioUrl ? <a className="icon-button" href={audioUrl} download={`${track.title}${extension}`} aria-label="Download song" title="Download"><Icon name="download" size={18} /></a> : <button className="icon-button play-track" aria-label={`Play ${track.title}`} disabled={loading || busy} onClick={() => void play()}>{loading ? <span className="spinner" /> : <Icon name="play" size={18} />}</button>}
      <button className="icon-button" aria-label="Rename song" title="Rename" disabled={busy} onClick={() => { setTitle(track.title); setEditing(!editing); }}><Icon name="edit" size={17} /></button>
      <button className="icon-button danger-action" aria-label="Delete song" title="Delete" disabled={busy} onClick={() => void remove()}><Icon name="trash" size={17} /></button>
    </div>
  </article>;
}

function Studio({ onLogout }: { onLogout: () => void }) {
  const [form, setForm] = useState<Form>(initialForm);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [tab, setTab] = useState<StudioTab>("create");
  const [search, setSearch] = useState("");
  const favoriteStorageKey = `melody-favorites:${localStorage.getItem("t") || "guest"}`;
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(favoriteStorageKey) || "[]"); } catch { return []; } });
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [userName, setUserName] = useState("Music maker");

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [trackData, generationData] = await Promise.all([
        api<Track[]>(`/tracks?q=${encodeURIComponent(search)}`),
        api<Generation[]>("/generations"),
      ]);
      setTracks(trackData || []); setGenerations(generationData || []); setError("");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not load your studio.";
      if (e instanceof ApiError && e.status === 401) onLogout();
      else setError(message);
    } finally { setLoading(false); }
  }, [search, onLogout]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const active = generations.some((generation) => ["queued", "processing"].includes(generation.status));
    if (!active) return;
    const interval = window.setInterval(() => { void refresh(true); }, 4000);
    return () => window.clearInterval(interval);
  }, [generations, refresh]);
  useEffect(() => {
    void api<{ name?: string; email?: string }>("/auth/me").then((result) => {
      if (result.name?.trim()) setUserName(result.name.trim());
    }).catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 401) onLogout();
      else setError(e instanceof Error ? e.message : "Could not load your account details.");
    });
  }, [onLogout]);
  useEffect(() => {
    const openSearch = () => {
      setOnlyFavorites(false);
      setTab("library");
      window.setTimeout(() => document.querySelector<HTMLInputElement>(".search-box input")?.focus(), 50);
    };
    window.addEventListener("melody:open-search", openSearch);
    return () => window.removeEventListener("melody:open-search", openSearch);
  }, []);

  const active = generations.find((generation) => ["queued", "processing"].includes(generation.status));
  const successful = generations.filter((generation) => generation.status === "completed").length;
  const visibleTracks = useMemo(() => onlyFavorites ? tracks.filter((track) => favoriteIds.includes(track.id)) : tracks, [tracks, onlyFavorites, favoriteIds]);
  const updateForm = <K extends keyof Form>(key: K, value: Form[K]) => setForm((current) => ({ ...current, [key]: value }));
  const toggleFavorite = (id: string) => {
    const next = favoriteIds.includes(id) ? favoriteIds.filter((item) => item !== id) : [...favoriteIds, id];
    try { localStorage.setItem(favoriteStorageKey, JSON.stringify(next)); }
    catch { setError("Favorites could not be saved. Enable browser storage and try again."); return; }
    setFavoriteIds(next);
  };

  const generate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.prompt.trim() || wordCount(form.prompt) > 100 || active) return;
    setBusy("generate"); setError(""); setMessage("");
    try {
      const generation = await api<Generation>("/generations", { method: "POST", body: JSON.stringify({ ...form, title: form.title.trim() || "Untitled" }) });
      setGenerations((current) => [generation, ...current]); setMessage("Your track is in the studio queue. We’ll let you know when it’s ready.");
      setTab("create");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not start your song."); }
    finally { setBusy(""); }
  };
  const useAi = async (kind: "lyrics" | "enhance-prompt") => {
    if (!form.prompt.trim()) { setError("Add a short description first, then try the AI helper."); return; }
    setBusy(kind); setError(""); setMessage("");
    try {
      const result = await api<{ lyrics: string; title: string } | { prompt: string }>(`/ai/${kind}`, { method: "POST", body: JSON.stringify({ prompt: form.prompt, genre: form.genre, mood: form.mood, language: form.language }) });
      if (kind === "lyrics" && "lyrics" in result) setForm((current) => ({ ...current, lyrics: result.lyrics, title: current.title || result.title }));
      if (kind === "enhance-prompt" && "prompt" in result) setForm((current) => ({ ...current, prompt: result.prompt }));
      setMessage(kind === "lyrics" ? "Fresh lyrics added. Make them your own." : "Prompt polished. Tweak it however you like.");
    } catch (e) { setError(e instanceof Error ? e.message : "AI helper couldn’t complete that request."); }
    finally { setBusy(""); }
  };
  const cancelGeneration = async (id: string) => {
    setError("");
    try { await api(`/generations/${id}/cancel`, { method: "POST" }); await refresh(true); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not cancel that generation."); }
  };

  const navigate = (next: StudioTab) => { setTab(next); setMobileMenu(false); setError(""); setMessage(""); };
  return <main className="studio-shell">
    <aside className={`studio-sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
      <div className="sidebar-brand"><Brand onClick={() => navigate("create")} /><button className="mobile-close icon-button" onClick={() => setMobileMenu(false)} aria-label="Close menu"><Icon name="close" /></button></div>
      <div className="sidebar-label">YOUR WORKSPACE</div>
      <nav className="studio-nav" aria-label="Studio navigation">
        <button className={tab === "create" ? "active" : ""} onClick={() => navigate("create")}><Icon name="plus" /><span>Create a song</span><span className="nav-shortcut">N</span></button>
        <button className={tab === "library" ? "active" : ""} onClick={() => navigate("library")}><Icon name="library" /><span>My library</span><span className="nav-count">{tracks.length || ""}</span></button>
        <button className={tab === "activity" ? "active" : ""} onClick={() => navigate("activity")}><Icon name="activity" /><span>Activity</span>{active && <i className="nav-live-dot" />}</button>
      </nav>
      <div className="sidebar-note"><span className="sidebar-note-icon"><Icon name="spark" size={18} /></span><b>A little note</b><p>The best prompts sound like a feeling, not a genre. Start wherever you are.</p><button onClick={() => { navigate("create"); document.getElementById("song-prompt")?.focus(); }}>Got it <Icon name="arrow" size={14} /></button></div>
      <div className="sidebar-bottom"><div className="profile-avatar">{userName.charAt(0).toUpperCase()}</div><div className="profile-copy"><b>{userName}</b><small>Your music studio</small></div><button className="icon-button logout-button" title="Sign out" aria-label="Sign out" onClick={onLogout}><Icon name="logout" size={18} /></button></div>
    </aside>
    {mobileMenu && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileMenu(false)} />}
    <div className="studio-main">
      <header className="studio-topbar"><button className="mobile-menu-button icon-button" onClick={() => setMobileMenu(true)} aria-label="Open navigation"><Icon name="menu" /></button><div className="breadcrumb"><span>Studio</span><i>/</i><b>{tab === "create" ? "Create" : tab === "library" ? "My library" : "Activity"}</b></div><div className="topbar-right"><span className="connection-status"><i /> ALL YOURS, ALL ORIGINAL</span><button className="top-avatar" title={userName}>{userName.charAt(0).toUpperCase()}</button></div></header>
      <div className="studio-content">
        {error && <div className="studio-alert" role="alert"><Icon name="close" size={17} /><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><Icon name="close" size={15} /></button></div>}
        {tab === "create" && <section className="create-view page-enter">
          <div className="studio-welcome"><div><div className="eyebrow"><span className="eyebrow-dot" /> YOUR CREATIVE SPACE</div><h1>Good things start<br />with <span className="text-gradient">a sound.</span></h1><p>Tell us what’s on your mind. We’ll help you turn it into something you can play.</p></div><div className="welcome-art"><div className="welcome-disc"><Icon name="music" size={32} /></div><div className="welcome-wave"><Waveform bars={34} /></div><span>IDEA → AUDIO</span></div></div>
          <div className="studio-stat-row"><div className="studio-stat"><span className="stat-icon"><Icon name="music" size={17} /></span><span><b>{tracks.length}</b><small>songs in your library</small></span></div><div className="studio-stat"><span className="stat-icon stat-icon-green"><Icon name="check" size={17} /></span><span><b>{successful}</b><small>songs brought to life</small></span></div>{active && <div className="studio-stat stat-in-progress"><span className="stat-pulse" /><span><b>Making music</b><small>{active.status} · AI music</small></span></div>}</div>
          {active && <div className="active-job"><div className="job-spinner"><span /></div><div className="job-copy"><b>{active.title || "Your new song"} is on its way</b><span>{active.status === "queued" ? "In the queue — we’ll start creating it soon." : "The music is coming together. This can take a few minutes."}</span></div><button className="button button-quiet button-small" onClick={() => void cancelGeneration(active.id)}>Cancel</button></div>}
          <form className="composer-card" onSubmit={generate}>
            <div className="composer-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> THE SONG STARTS HERE</div><h2>What should it sound like?</h2></div><span className="powered-badge"><Icon name="spark" size={14} /> AI MUSIC</span></div>
            <label className="field-label" htmlFor="song-prompt">Describe your song <span>the more you can picture it, the better</span></label>
            <textarea id="song-prompt" className="prompt-field" rows={4} placeholder="A little dreamy, like driving home just after the rain. Soft guitar, a slow beat, and lyrics that feel like letting go..." maxLength={2000} value={form.prompt} onChange={(event) => updateForm("prompt", event.target.value)} />
            <div className="prompt-under"><span className={wordCount(form.prompt) > 100 ? "word-count over-limit" : "word-count"}>{wordCount(form.prompt)} / 100 words</span><span>Not sure where to start? Try one:</span></div>
            <div className="prompt-samples">{samples.map((sample) => <button type="button" key={sample} onClick={() => updateForm("prompt", sample)}>{sample} <Icon name="arrow" size={13} /></button>)}</div>
            <div className="composer-divider" />
            <div className="composer-options">
              <div className="option-block"><label className="field-label" htmlFor="song-title">Song title <span>optional</span></label><input id="song-title" className="field-input" placeholder="A name for this feeling" maxLength={200} value={form.title} onChange={(event) => updateForm("title", event.target.value)} /></div>
              <div className="option-block"><label className="field-label" htmlFor="song-style">Style</label><select id="song-style" className="field-input" value={form.genre} onChange={(event) => updateForm("genre", event.target.value)}>{["Pop", "Indie", "R&B", "Hip-hop", "Electronic", "Rock", "Folk", "Jazz", "Cinematic", "Lo-fi", "Soul", "Classical"].map((genre) => <option key={genre}>{genre}</option>)}</select></div>
              <div className="option-block"><label className="field-label" htmlFor="song-mood">Mood</label><select id="song-mood" className="field-input" value={form.mood} onChange={(event) => updateForm("mood", event.target.value)}>{["Cinematic", "Dreamy", "Hopeful", "Melancholic", "Confident", "Peaceful", "Energetic", "Romantic", "Nostalgic", "Playful"].map((mood) => <option key={mood}>{mood}</option>)}</select></div>
              <div className="option-block"><label className="field-label" htmlFor="song-language">Language</label><select id="song-language" className="field-input" value={form.language} onChange={(event) => updateForm("language", event.target.value)}>{["English", "Spanish", "French", "Hindi", "Japanese", "Korean", "Portuguese"].map((language) => <option key={language}>{language}</option>)}</select></div>
              <div className="option-block duration-option"><label className="field-label" htmlFor="song-duration">Length <span>{form.duration} sec</span></label><input id="song-duration" type="range" min={10} max={180} step={5} value={form.duration} onChange={(event) => updateForm("duration", Number(event.target.value))} /><div className="range-labels"><span>Short</span><span>Long</span></div></div>
            </div>
            <div className="lyrics-area"><div className="lyrics-heading"><div><label className="field-label" htmlFor="song-lyrics">Lyrics <span>optional · add your own or let AI help</span></label></div><button className="text-button" type="button" disabled={!!busy || !form.prompt.trim()} onClick={() => void useAi("lyrics")}><Icon name="spark" size={15} />{busy === "lyrics" ? "Writing..." : "Write with AI"}</button></div><textarea id="song-lyrics" className="lyrics-field" rows={3} placeholder="Your words go here. Or leave this blank and let the music surprise you." maxLength={5000} value={form.lyrics} onChange={(event) => updateForm("lyrics", event.target.value)} /></div>
            <div className="composer-footer"><label className="toggle-label"><input type="checkbox" checked={form.instrumental} onChange={(event) => updateForm("instrumental", event.target.checked)} /><span className="toggle-control" /><span>Instrumental only <small>no vocals</small></span></label><button className="button button-quiet button-small" type="button" disabled={!!busy || !form.prompt.trim()} onClick={() => void useAi("enhance-prompt")}><Icon name="wand" size={16} />{busy === "enhance-prompt" ? "Polishing..." : "Polish prompt"}</button></div>
            {message && <div className="success-note" role="status"><Icon name="check" size={16} />{message}</div>}
            <div className="composer-submit"><div className="generation-note"><Icon name="clock" size={15} /><span>Usually ready in a few minutes</span></div><button className="button button-primary button-generate" disabled={busy !== "" || !form.prompt.trim() || wordCount(form.prompt) > 100 || !!active}><Icon name="spark" size={17} />{busy === "generate" ? "Sending to the studio..." : "Make my song"} <Icon name="arrow" size={17} /></button></div>
            {wordCount(form.prompt) > 100 && <p className="form-error">Keep the prompt to 100 words or fewer so it stays focused.</p>}
          </form>
          <div className="recent-heading"><div><span className="eyebrow"><span className="eyebrow-dot" /> FRESH FROM YOUR STUDIO</span><h2>Your latest tracks</h2></div><button className="text-button" onClick={() => navigate("library")}>Open library <Icon name="arrow" size={15} /></button></div>
          {loading ? <div className="loading-panel"><span className="spinner" /> Gathering your songs...</div> : tracks.length ? <div className="track-list">{tracks.slice(0, 3).map((track) => <TrackCard key={track.id} track={track} onRefresh={() => void refresh(true)} favorite={favoriteIds.includes(track.id)} onFavorite={() => toggleFavorite(track.id)} />)}</div> : <EmptyState onCreate={() => document.getElementById("song-prompt")?.focus()} />}
        </section>}
        {tab === "library" && <section className="library-view page-enter">
          <div className="page-title-row"><div><div className="eyebrow"><span className="eyebrow-dot" /> YOUR PERSONAL COLLECTION</div><h1>The library<span className="text-gradient">.</span></h1><p>Every idea you turned into something real.</p></div><button className="button button-primary" onClick={() => navigate("create")}><Icon name="plus" size={17} /> Make a song</button></div>
          <div className="library-toolbar"><label className="search-box"><Icon name="search" size={19} /><input placeholder="Find a song by title..." value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>⌘ K</kbd></label><button className={`filter-button ${onlyFavorites ? "filter-active" : ""}`} onClick={() => setOnlyFavorites(!onlyFavorites)}><Icon name="heart" size={16} /> Favorites</button><span className="library-count">{visibleTracks.length} {visibleTracks.length === 1 ? "song" : "songs"}</span><button className="icon-button refresh-button" aria-label="Refresh library" onClick={() => void refresh()}><Icon name="refresh" size={17} /></button></div>
          {loading ? <div className="loading-panel"><span className="spinner" /> Gathering your songs...</div> : visibleTracks.length ? <div className="track-list">{visibleTracks.map((track) => <TrackCard key={track.id} track={track} onRefresh={() => void refresh(true)} favorite={favoriteIds.includes(track.id)} onFavorite={() => toggleFavorite(track.id)} />)}</div> : <EmptyState favorite={onlyFavorites} onCreate={() => { setOnlyFavorites(false); navigate("create"); }} />}
        </section>}
        {tab === "activity" && <section className="activity-view page-enter">
          <div className="page-title-row"><div><div className="eyebrow"><span className="eyebrow-dot" /> THE MAKING OF IT</div><h1>In the works<span className="text-gradient">.</span></h1><p>All the songs you’ve put into motion.</p></div><button className="icon-button refresh-button" aria-label="Refresh activity" onClick={() => void refresh()}><Icon name="refresh" size={18} /></button></div>
          {loading ? <div className="loading-panel"><span className="spinner" /> Checking your activity...</div> : generations.length ? <div className="activity-list">{generations.map((generation) => <article className="activity-card" key={generation.id}><div className={`activity-icon activity-${generation.status}`}><Icon name={generation.status === "completed" ? "check" : generation.status === "failed" ? "close" : generation.status === "cancelled" ? "close" : "music"} size={19} /></div><div className="activity-copy"><b>{generation.title || "Untitled song"}</b><span>{generation.prompt}</span><small>AI music · {formatDate(generation.created_at)}</small></div><div className={`status-pill status-${generation.status}`}>{generation.status === "processing" || generation.status === "queued" ? <span className="status-dot" /> : null}{generation.status}</div>{["queued", "processing"].includes(generation.status) && <button className="button button-quiet button-small" onClick={() => void cancelGeneration(generation.id)}>Cancel</button>}</article>)}</div> : <EmptyState onCreate={() => navigate("create")} />}
        </section>}
      </div>
    </div>
  </main>;
}

function EmptyState({ onCreate, favorite = false }: { onCreate: () => void; favorite?: boolean }) {
  return <div className="empty-state"><div className="empty-art"><Icon name={favorite ? "heart" : "music"} size={27} /></div><h3>{favorite ? "No favorites just yet." : "A blank page has potential."}</h3><p>{favorite ? "Tap the heart on any song to keep it close." : "Your first song is one small idea away. Start with a mood, a moment, anything."}</p><button className="button button-primary button-small" onClick={onCreate}>{favorite ? "Back to the music" : "Make your first song"} <Icon name="arrow" size={15} /></button></div>;
}

function AppRouter() {
  const route = () => window.location.pathname;
  const [screen, setScreen] = useState<Screen>(() => route() === "/studio" ? "studio" : route() === "/signup" || route() === "/signin" ? "auth" : "home");
  const [authMode, setAuthMode] = useState<"register" | "login">(() => route() === "/signin" ? "login" : "register");
  const [checkingSession, setCheckingSession] = useState(true);
  const [globalError, setGlobalError] = useState("");
  const openAuth = (mode: "register" | "login") => { window.history.pushState({}, "", mode === "login" ? "/signin" : "/signup"); setAuthMode(mode); setScreen("auth"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const logout = useCallback(() => {
    try { localStorage.removeItem("t"); }
    catch { setGlobalError("Could not clear the saved sign-in from this browser. Enable site storage and try again."); return; }
    window.history.replaceState({}, "", "/");
    setScreen("home");
  }, []);
  useEffect(() => {
    const token = localStorage.getItem("t");
    if (!token) {
      if (route() === "/studio") { window.history.replaceState({}, "", "/signin"); setAuthMode("login"); setScreen("auth"); }
      setCheckingSession(false);
      return;
    }
    void api("/auth/me").then(() => {
      if (route() !== "/studio") window.history.replaceState({}, "", "/studio");
      setScreen("studio");
    }).catch(() => {
      localStorage.removeItem("t");
      if (route() === "/studio") { window.history.replaceState({}, "", "/signin"); setAuthMode("login"); setScreen("auth"); }
      else setScreen(route() === "/signin" || route() === "/signup" ? "auth" : "home");
    }).finally(() => setCheckingSession(false));
  }, []);
  useEffect(() => {
    const onPopState = () => {
      const path = route();
      if (path === "/studio" && !localStorage.getItem("t")) {
        window.history.replaceState({}, "", "/signin"); setAuthMode("login"); setScreen("auth");
      } else if (path === "/studio") setScreen("studio");
      else if (path === "/signin" || path === "/signup") { setAuthMode(path === "/signin" ? "login" : "register"); setScreen("auth"); }
      else setScreen("home");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      console.error("MelodyAI encountered an unexpected error.", event.error);
      setGlobalError("Something unexpected happened. Your account and saved songs are still safe; reload the page to continue.");
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      console.error("MelodyAI encountered an unexpected async error.", event.reason);
      setGlobalError(event.reason instanceof Error ? event.reason.message : "A background request failed. Please try again.");
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  useEffect(() => {
    if (screen === "home") return;
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (screen === "studio") window.dispatchEvent(new Event("melody:open-search"));
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [screen]);
  if (checkingSession) return <div className="app-loading"><span className="spinner" /> Getting your studio ready...</div>;
  return <>
    {globalError && <div className="global-error" role="alert"><span>{globalError}</span><button onClick={() => setGlobalError("")} aria-label="Dismiss error"><Icon name="close" size={16} /></button></div>}
    {screen === "studio" ? <Studio onLogout={logout} /> :
      screen === "auth" ? <AuthScreen initialMode={authMode} onHome={() => { window.history.replaceState({}, "", "/"); setScreen("home"); }} onAuth={() => { window.history.replaceState({}, "", "/studio"); setScreen("studio"); }} /> :
        <Landing onAuth={openAuth} />}
  </>;
}

class AppErrorBoundary extends Component<React.PropsWithChildren, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("MelodyAI could not render this page.", error, info.componentStack);
  }
  render() {
    if (this.state.hasError) return <main className="fatal-page"><div className="auth-card"><span className="auth-card-icon"><Icon name="close" /></span><h1>We hit a snag.</h1><p>Your account and saved songs are safe. Reload MelodyAI to try again.</p><button className="button button-primary" onClick={() => window.location.reload()}>Reload app <Icon name="refresh" size={16} /></button></div></main>;
    return this.props.children;
  }
}

export default function App() {
  return <AppErrorBoundary><AppRouter /></AppErrorBoundary>;
}
