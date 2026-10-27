import React, { createContext, useContext } from 'react';
import type { ThemeUI } from './types';
import { t } from './i18n';
export const ThemeUIContext = createContext<ThemeUI>({});
export const uiLabel = (ui: ThemeUI | undefined, text: string) => typeof ui?.labels?.[text] === 'string' ? ui.labels[text] : t(text);
export function useThemeUI() { const ui = useContext(ThemeUIContext); return { ui, text: (value: string) => uiLabel(ui, value) }; }
const icons: Record<string, React.ReactNode> = {
  pin: <><path d="m15 3 6 6-3 1-3 5-1 4-4-4-5-5 4-1 5-3zM10 14l-7 7"/></>,
  copy: <><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></>,
  rename: <><path d="m4 15 11-11 5 5-11 11H4zM13 6l5 5M3 22h18"/></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
  outline: <><path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"/></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13"/><rect x="3" y="5" width="2" height="2"/><rect x="3" y="11" width="2" height="2"/></>,
  code: <path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18"/>,
  table: <><rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M3 14h18M10 4v16"/></>,
  quote: <path d="M10 6H3v7h6c0 4-2 5-5 5m17-12h-7v7h6c0 4-2 5-5 5"/>,
  bullets: <path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"/>,
  tasks: <><rect x="3" y="4" width="7" height="7" rx="1"/><path d="m4 7 2 2 4-5M14 7h7M3 17h7m4 0h7"/></>,
  panel: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></>,
  book: <><path d="M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-3H4z"/><path d="M13 7a3 3 0 0 1 3-3h5v14h-4a4 4 0 0 0-4 3"/></>,
  plus: <path d="M12 5v14M5 12h14"/>, search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  file: <><path d="M14 3H5v18h14V8z"/><path d="M14 3v6h5M8 13h8M8 17h5"/></>,
  folder: <path d="M3 6h7l2 2h9v12H3z"/>, settings: <><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="18" r="2"/></>,
  export: <><path d="M12 15V3m-4 4 4-4 4 4M5 13v7h14v-7"/></>, import: <><path d="M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5"/></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m3 17 6-5 4 4 4-6 4 5"/></>,
  link: <><path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M13 17a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-1 1" transform="translate(1 -1) scale(.9)"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>, check: <path d="m5 12 4 4L19 6"/>, arrow: <path d="m8 5 7 7-7 7"/>, close: <path d="m6 6 12 12M6 18 18 6"/>,
};

icons.brand = <><path d="m12 11 1-8 6 2-5 6zm1 1 8 1-2 6-6-5zm-1 1-1 8-6-2 5-6zm-1-1-8-1 2-6 6 5z"/><circle cx="12" cy="12" r="1.5"/></>;
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const ui = useContext(ThemeUIContext), custom = ui.icons?.[name];
  const glyph = typeof custom === 'string' ? custom : custom?.glyph;
  const color = typeof custom === 'object' ? custom.color : undefined;
  if (glyph) return <span className="custom-icon" aria-hidden="true" style={{ fontSize: size, color }}>{glyph}</span>;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={typeof custom === 'object' ? custom.strokeWidth || 1.6 : 1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color }}>{typeof custom === 'object' && custom.paths ? custom.paths.map((d, i) => <path key={i} d={d}/>) : icons[name] || icons.file}</svg>;
}
