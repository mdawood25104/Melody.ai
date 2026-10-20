import { Component, useCallback, useEffect, useState } from "react";
import { ApiError, api } from "./api";
import { Icon } from "./components/Visuals";
import { AuthScreen } from "./pages/AuthScreen";
import { Landing } from "./pages/Landing";
import { Studio } from "./pages/Studio";
import type { Screen } from "./types";

export function AppRouter() {
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
    let token: string | null;
    try { token = localStorage.getItem("t"); }
    catch {
      setGlobalError("Browser storage is unavailable. Enable site storage to sign in and save your session.");
      setCheckingSession(false);
      return;
    }
    if (!token) {
      if (route() === "/studio") { window.history.replaceState({}, "", "/signin"); setAuthMode("login"); setScreen("auth"); }
      setCheckingSession(false);
      return;
    }
    void api("/auth/me").then(() => {
      if (route() !== "/studio") window.history.replaceState({}, "", "/studio");
      setScreen("studio");
    }).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 401) {
        try { localStorage.removeItem("t"); } catch { setGlobalError("Your saved session could not be cleared. Enable browser storage and try again."); }
        if (route() === "/studio") { window.history.replaceState({}, "", "/signin"); setAuthMode("login"); setScreen("auth"); }
        else setScreen(route() === "/signin" || route() === "/signup" ? "auth" : "home");
      } else {
        setGlobalError(error instanceof Error ? error.message : "Could not verify your saved session. Please try again.");
        setScreen(route() === "/studio" ? "auth" : route() === "/signin" || route() === "/signup" ? "auth" : "home");
      }
    }).finally(() => setCheckingSession(false));
  }, []);
  useEffect(() => {
    const onPopState = () => {
      const path = route();
      let token: string | null;
      try { token = localStorage.getItem("t"); }
      catch {
        setGlobalError("Browser storage is unavailable. Enable site storage to continue.");
        setScreen("auth");
        return;
      }
      if (path === "/studio" && !token) {
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
      setGlobalError("A background task failed unexpectedly. Please retry; if it continues, check the backend logs.");
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
