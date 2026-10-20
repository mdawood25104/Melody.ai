/** Small reusable brand and icon primitives shared by application screens. */

import * as React from "react";
import type { IconName } from "../types";

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
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

export function Brand({ onClick }: { onClick?: () => void }) {
  return <button className="brand" onClick={onClick} aria-label="MelodyAI home"><span className="brand-mark"><Icon name="wave" size={20} /></span><span>melody<span className="brand-ai">.ai</span></span></button>;
}

export function Waveform({ bars = 36 }: { bars?: number }) {
  return <div className="waveform" aria-hidden="true">{Array.from({ length: bars }, (_, index) => <i key={index} style={{ "--bar": `${14 + ((index * 17 + index * index * 3) % 85)}%`, "--delay": `${(index % 9) * -0.11}s` } as React.CSSProperties} />)}</div>;
}
