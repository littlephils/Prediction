import type { Market } from "./types";

/** Phrasing that adapts to the market kind, shared by guest + admin UI. */

export function questionText(m: Pick<Market, "kind" | "word">): string {
  return m.kind === "event" ? m.word : `Will the host say “${m.word}”?`;
}

/** Verb for the YES outcome (the side bettors are wagering on). */
export function yesVerb(kind: Market["kind"]): string {
  return kind === "event" ? "yes" : "spoken";
}

export function yesLabel(kind: Market["kind"]): string {
  return kind === "event" ? "Yes" : "Said it";
}

export function noLabel(kind: Market["kind"]): string {
  return kind === "event" ? "No" : "Never said";
}

/** Badge text for a settled market, e.g. "Resolved Spoken" / "Resolved Yes". */
export function settledLabel(m: Pick<Market, "kind" | "status" | "winner">): string {
  if (m.status === "void") return "Void";
  if (m.winner) return m.kind === "event" ? "Resolved Yes" : "Resolved Spoken";
  return m.kind === "event" ? "Resolved No" : "Resolved Never Said";
}
