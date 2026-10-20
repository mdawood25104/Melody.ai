/** Authenticated studio workspace for composing, library, and activity views. */

import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, api, favoriteKeyForCurrentSession, formatDate, wordCount } from "../api";
import { Brand, Icon, Waveform } from "../components/Visuals";
import { TrackCard } from "../components/TrackCard";
import type { Form, Generation, StudioTab, Track } from "../types";
import { initialForm, samples } from "../types";

export function Studio({ onLogout }: { onLogout: () => void }) {
  const [form, setForm] = useState<Form>(initialForm);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [tab, setTab] = useState<StudioTab>("create");
  const [search, setSearch] = useState("");
  const favoriteStorageKey = favoriteKeyForCurrentSession();
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(favoriteStorageKey) || "[]");
      return Array.isArray(value) && value.every((id): id is string => typeof id === "string") ? value : [];
    } catch { return []; }
  });
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
          {active && <div className={`active-job active-job-${active.status}`} role="status" aria-live="polite">
            <div className="job-art" aria-hidden="true">
              <div className="job-record"><span className="job-record-label"><Icon name="music" size={15} /></span></div>
              <i className="job-tonearm" />
            </div>
            <div className="job-copy">
              <div className="job-overline"><span>NOW IN THE STUDIO</span><span className="job-live"><i />{active.status === "queued" ? "IN THE QUEUE" : "CREATING YOUR TRACK"}</span></div>
              <b className="job-track-title">{active.title || "Your new song"}</b>
              <span>{active.status === "queued" ? "Your track is next up. We’ll start shaping the sound shortly." : "Building the arrangement, layer by layer. This can take a few minutes."}</span>
              <div className="job-sound-wave" aria-hidden="true">{Array.from({ length: 25 }, (_, index) => <i key={index} />)}</div>
              <div className="job-progress" aria-hidden="true"><i /></div>
            </div>
            <button className="button button-quiet button-small job-cancel" onClick={() => void cancelGeneration(active.id)}>Cancel</button>
          </div>}
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
          {loading ? <div className="loading-panel"><span className="spinner" /> Checking your activity...</div> : generations.length ? <div className="activity-list">{generations.map((generation) => <article className="activity-card" key={generation.id}><div className={`activity-icon activity-${generation.status}`}><Icon name={generation.status === "completed" ? "check" : generation.status === "failed" ? "close" : generation.status === "cancelled" ? "close" : "music"} size={19} /></div><div className="activity-copy"><b>{generation.title || "Untitled song"}</b><span>{generation.prompt}</span>{generation.status === "failed" && <span className="activity-error" role="alert">{generation.error_message || "The generation failed. Try again, or check the backend logs for details."}</span>}<small>AI music · {formatDate(generation.created_at)}</small></div><div className={`status-pill status-${generation.status}`}>{generation.status === "processing" || generation.status === "queued" ? <span className="status-dot" /> : null}{generation.status}</div>{["queued", "processing"].includes(generation.status) && <button className="button button-quiet button-small" onClick={() => void cancelGeneration(generation.id)}>Cancel</button>}</article>)}</div> : <EmptyState onCreate={() => navigate("create")} />}
        </section>}
      </div>
    </div>
  </main>;
}

export function EmptyState({ onCreate, favorite = false }: { onCreate: () => void; favorite?: boolean }) {
  return <div className="empty-state"><div className="empty-art"><Icon name={favorite ? "heart" : "music"} size={27} /></div><h3>{favorite ? "No favorites just yet." : "A blank page has potential."}</h3><p>{favorite ? "Tap the heart on any song to keep it close." : "Your first song is one small idea away. Start with a mood, a moment, anything."}</p><button className="button button-primary button-small" onClick={onCreate}>{favorite ? "Back to the music" : "Make your first song"} <Icon name="arrow" size={15} /></button></div>;
}
