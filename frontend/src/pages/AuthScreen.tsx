/** Sign-up and sign-in form screen. */

import * as React from "react";
import { useEffect, useState } from "react";
import { ApiError, api } from "../api";
import { Brand, Icon, Waveform } from "../components/Visuals";

export function AuthScreen({ initialMode, onHome, onAuth }: { initialMode: "register" | "login"; onHome: () => void; onAuth: () => void }) {
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
