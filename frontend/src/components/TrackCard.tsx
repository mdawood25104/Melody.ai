/** Track playback, download, rename, favorite, and delete controls. */

import { useEffect, useState } from "react";
import { api, call, formatDate, sourceLabel } from "../api";
import { Icon } from "./Visuals";
import type { Track } from "../types";

export function TrackCard({ track, onRefresh, favorite, onFavorite }: { track: Track; onRefresh: () => void; favorite: boolean; onFavorite: () => void }) {
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
