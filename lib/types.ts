/** "word" = a word/phrase the host might say; "event" = any custom prediction. */
export type MarketKind = "word" | "event";

export type MarketStatus = "open" | "resolved" | "void";

export interface Market {
  id: string;
  kind: MarketKind;
  /** For word markets, the word/phrase. For event markets, the question. */
  word: string;
  /** Emoji shown in the market's icon bubble. */
  icon: string;
  /** Admin-chosen starting multiplier (best odds, before any money is in). */
  startingOdds: number;
  /** Total fake money wagered on this market. */
  totalPool: number;
  /** Live multiplier a new bet would lock in right now (derived from the pool). */
  currentOdds: number;
  /** Number of bets placed. */
  betCount: number;
  /** Odds trajectory over time, oldest → newest, for the sparkline. */
  history: number[];
  status: MarketStatus;
  /** true = resolved YES (said it / happened), false = NO, null while open. */
  winner: boolean | null;
  createdAt: number;
}

export interface Bet {
  marketId: string;
  word: string;
  amount: number;
  /** Multiplier captured at the moment the bet was placed. */
  lockedOdds: number;
  placedAt: number;
}

export type BetOutcome = "pending" | "won" | "lost" | "refunded";

/** A bet enriched with the outcome of its (possibly resolved) market. */
export interface SettledBet extends Bet {
  outcome: BetOutcome;
  payout: number;
}

export interface User {
  name: string;
  balance: number;
  bets: Bet[];
}

export interface LeaderboardEntry {
  name: string;
  balance: number;
}

/** A bet row for the admin "All Bets" table. */
export interface AdminBet {
  marketId: string;
  word: string;
  kind: MarketKind;
  name: string;
  amount: number;
  lockedOdds: number;
  placedAt: number;
  status: MarketStatus;
  outcome: BetOutcome;
  payout: number;
}

/** A user row for the admin "Users" table. */
export interface AdminUser {
  name: string;
  balance: number;
  betCount: number;
}

export interface AppConfig {
  storage: string;
  oddsK: number;
  oddsFloor: number;
  startingBalance: number;
  pollMs: number;
}
