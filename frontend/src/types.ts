
/** Shared domain and UI types used across the client. */

export type IconName = "arrow" | "spark" | "play" | "music" | "home" | "library" | "activity" | "plus" | "search" | "logout" | "download" | "edit" | "trash" | "close" | "check" | "clock" | "wave" | "headphones" | "wand" | "menu" | "chevron" | "refresh" | "heart";

export type Generation = { id: string; title: string; prompt: string; status: string; error_code?: string | null; error_message?: string | null; created_at: string; provider: string };

export type Track = { id: string; title: string; duration_seconds: number; created_at: string; generation_id: string; content_type: string; prompt?: string; lyrics?: string; provider?: string; settings?: Record<string, unknown> };

export type Form = { title: string; prompt: string; lyrics: string; genre: string; mood: string; language: string; instrumental: boolean; duration: number };

export type Screen = "home" | "auth" | "studio";

export type StudioTab = "create" | "library" | "activity";

export const initialForm: Form = { title: "", prompt: "", lyrics: "", genre: "Pop", mood: "Cinematic", language: "English", instrumental: false, duration: 60 };

export const samples = ["A late-night drive through a neon-lit city", "A hopeful sunrise after the hardest year", "A warm, dusty soul record from another era"];
