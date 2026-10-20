
/** Shared API client, request errors, and small UI formatting helpers. */

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly requestId?: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function call(path: string, opts: RequestInit = {}) {
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
    const payload: unknown = await response.json().catch(() => undefined);
    const error = payload && typeof payload === "object"
      ? payload as { detail?: unknown; request_id?: unknown; error?: { message?: unknown } }
      : {};
    const detail = typeof error.detail === "string"
      ? error.detail
      : Array.isArray(error.detail)
        ? error.detail.map((item: unknown) => {
          if (!item || typeof item !== "object") return "Invalid value";
          const validation = item as { field?: unknown; message?: unknown; msg?: unknown };
          const field = typeof validation.field === "string" ? `${validation.field}: ` : "";
          const message = typeof validation.message === "string" ? validation.message :
            typeof validation.msg === "string" ? validation.msg : "Invalid value";
          return `${field}${message}`;
        }).join("; ")
        : typeof error.error?.message === "string" ? error.error.message : "";
    const requestId = typeof error.request_id === "string" ? error.request_id : response.headers.get("X-Request-ID") || undefined;
    const message = detail || response.statusText || `Request failed (${response.status}).`;
    throw new ApiError(
      response.status >= 500 && requestId ? `${message} (Reference: ${requestId})` : message,
      response.status,
      requestId,
    );
  }
  return response;
}

export const api = async <T,>(path: string, opts?: RequestInit): Promise<T> => {
  const response = await call(path, opts);
  if (response.status === 204) return null as T;
  try { return await response.json() as T; }
  catch { throw new ApiError("The server returned an invalid response. Please try again.", response.status); }
};

export const wordCount = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;

export const formatDate = (date: string) => new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export const sourceLabel = (provider?: string) => provider === "mock" ? "Demo audio" : "AI-generated song";

export function favoriteKeyForCurrentSession() {
  try { return `melody-favorites:${localStorage.getItem("t") || "guest"}`; }
  catch { return "melody-favorites:guest"; }
}
