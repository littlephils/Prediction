/**
 * Deterministic per-market color theme. The literal class strings below are
 * what Tailwind scans for — keep them spelled out (no string interpolation).
 */
export interface MarketTheme {
  /** Tailwind gradient classes for the icon bubble. */
  bubble: string;
  /** Tailwind text color for the big odds number. */
  odds: string;
  /** Hex stroke for the sparkline. */
  stroke: string;
}

const THEMES: MarketTheme[] = [
  { bubble: "from-violet-500 to-purple-600", odds: "text-violet-300", stroke: "#c4b5fd" },
  { bubble: "from-sky-500 to-blue-600", odds: "text-sky-300", stroke: "#7dd3fc" },
  { bubble: "from-fuchsia-500 to-pink-600", odds: "text-fuchsia-300", stroke: "#f0abfc" },
  { bubble: "from-pink-500 to-rose-600", odds: "text-pink-300", stroke: "#f9a8d4" },
  { bubble: "from-cyan-500 to-teal-600", odds: "text-cyan-300", stroke: "#67e8f9" },
  { bubble: "from-indigo-500 to-violet-600", odds: "text-indigo-300", stroke: "#a5b4fc" },
  { bubble: "from-emerald-500 to-teal-600", odds: "text-emerald-300", stroke: "#6ee7b7" },
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function themeFor(id: string): MarketTheme {
  return THEMES[hash(id) % THEMES.length];
}
