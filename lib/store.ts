import { db, usingVercelKv } from "./kv";
import { computeOdds, round2 } from "./odds";
import type {
  AdminBet,
  AdminUser,
  Bet,
  BetOutcome,
  LeaderboardEntry,
  Market,
  MarketKind,
  MarketStatus,
  SettledBet,
  User,
} from "./types";

export const STARTING_BALANCE = 100;
const HISTORY_CAP = 24;

// ---- Key helpers -----------------------------------------------------------

const USERS_SET = "users";
const MARKETS_SET = "markets";
const userKey = (id: string) => `user:${id}`;
const userBetsKey = (id: string) => `user:${id}:bets`;
const marketKey = (id: string) => `market:${id}`;
const marketBetsKey = (id: string) => `market:${id}:bets`;

/** A wager recorded against a market, used for payouts + the admin bet feed. */
interface MarketBet {
  userId: string;
  name: string;
  amount: number;
  lockedOdds: number;
  placedAt: number;
}

// ---- Coercion (Upstash may return numbers/booleans; memory returns strings) -

const asNum = (v: unknown): number =>
  typeof v === "number" ? v : parseFloat(String(v ?? 0)) || 0;
const asStr = (v: unknown): string => (v == null ? "" : String(v));

function parseHistory(v: unknown, fallback: number): number[] {
  let arr: unknown = v;
  if (typeof v === "string") {
    try {
      arr = JSON.parse(v);
    } catch {
      arr = null;
    }
  }
  if (Array.isArray(arr)) {
    const nums = arr.map(Number).filter((n) => Number.isFinite(n));
    if (nums.length) return nums;
  }
  return [fallback];
}

// ---- Icons -----------------------------------------------------------------

const WORD_ICONS = ["💬", "🗯️", "💭", "🎤", "📣", "🔊", "✨", "💫", "⭐", "🔥", "💥", "🫧"];
const EVENT_ICONS = ["🎯", "🎲", "🎰", "🔮", "⚡", "🎉", "🏆", "🍾", "🥂", "🎂", "🪩", "🎈"];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function pickIcon(kind: MarketKind, seed: string): string {
  const list = kind === "event" ? EVENT_ICONS : WORD_ICONS;
  return list[hash(seed) % list.length];
}

function sanitizeIcon(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  // Keep it to a single emoji (allow ZWJ/variation-selector sequences).
  return Array.from(trimmed).length <= 4 ? trimmed : null;
}

// ---- Names -----------------------------------------------------------------

export interface NormalizedName {
  id: string;
  display: string;
}

export function normalizeName(raw: unknown): NormalizedName | null {
  if (typeof raw !== "string") return null;
  const display = raw.replace(/\s+/g, " ").trim().slice(0, 24);
  if (display.length < 1) return null;
  if (!/^[\p{L}\p{N} _.!?'-]+$/u.test(display)) return null;
  return { id: display.toLowerCase(), display };
}

// ---- Mappers ---------------------------------------------------------------

function toMarket(id: string, raw: Record<string, unknown> | null): Market | null {
  if (!raw || raw.word == null) return null;
  const startingOdds = asNum(raw.startingOdds);
  const totalPool = asNum(raw.totalPool);
  const status = (asStr(raw.status) as MarketStatus) || "open";
  const hasWinner = raw.winner != null && raw.winner !== "";
  const kind = (asStr(raw.kind) as MarketKind) || "word";
  return {
    id,
    kind,
    word: asStr(raw.word),
    icon: raw.icon != null && raw.icon !== "" ? asStr(raw.icon) : pickIcon(kind, id),
    startingOdds,
    totalPool,
    currentOdds: computeOdds(startingOdds, totalPool),
    betCount: asNum(raw.betCount),
    history: parseHistory(raw.history, startingOdds),
    status,
    winner: hasWinner ? asStr(raw.winner) === "true" : null,
    createdAt: asNum(raw.createdAt),
  };
}

// ---- Users -----------------------------------------------------------------

export async function ensureUser(rawName: string): Promise<User | null> {
  const name = normalizeName(rawName);
  if (!name) return null;
  const existing = await db.hgetall(userKey(name.id));
  if (!existing || existing.name == null) {
    await db.hset(userKey(name.id), {
      name: name.display,
      balance: STARTING_BALANCE,
      createdAt: Date.now(),
    });
    await db.sadd(USERS_SET, name.id);
  }
  return getUser(name.id);
}

export async function getUser(id: string): Promise<User | null> {
  const raw = await db.hgetall(userKey(id));
  if (!raw || raw.name == null) return null;
  const bets = await db.lrange<Bet>(userBetsKey(id), 0, -1);
  return { name: asStr(raw.name), balance: round2(asNum(raw.balance)), bets };
}

// ---- Markets ---------------------------------------------------------------

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export interface CreateMarketInput {
  kind?: unknown;
  word?: unknown;
  startingOdds?: unknown;
  icon?: unknown;
}

export async function createMarket(
  input: CreateMarketInput,
): Promise<Market | { error: string }> {
  const kind: MarketKind = input.kind === "event" ? "event" : "word";
  const maxLen = kind === "event" ? 120 : 60;
  const word =
    typeof input.word === "string" ? input.word.replace(/\s+/g, " ").trim().slice(0, maxLen) : "";
  if (!word) {
    return { error: kind === "event" ? "A question is required." : "A word or phrase is required." };
  }
  const startingOdds = Number(input.startingOdds);
  if (!Number.isFinite(startingOdds) || startingOdds <= 1) {
    return { error: "Starting odds must be a number greater than 1." };
  }
  const id = genId();
  const icon = sanitizeIcon(input.icon) ?? pickIcon(kind, id);
  await db.hset(marketKey(id), {
    kind,
    word,
    icon,
    startingOdds: round2(startingOdds),
    totalPool: 0,
    betCount: 0,
    history: JSON.stringify([round2(startingOdds)]),
    status: "open",
    createdAt: Date.now(),
  });
  await db.sadd(MARKETS_SET, id);
  return (await getMarket(id))!;
}

export async function getMarket(id: string): Promise<Market | null> {
  return toMarket(id, await db.hgetall(marketKey(id)));
}

export async function getMarkets(): Promise<Market[]> {
  const ids = await db.smembers(MARKETS_SET);
  const markets = (await Promise.all(ids.map(getMarket))).filter(
    (m): m is Market => m !== null,
  );
  return markets.sort((a, b) => {
    if (a.status === "open" && b.status !== "open") return -1;
    if (a.status !== "open" && b.status === "open") return 1;
    return b.createdAt - a.createdAt;
  });
}

// ---- Betting ---------------------------------------------------------------

export type BetResult =
  | { ok: true; balance: number; market: Market; lockedOdds: number; amount: number }
  | { ok: false; error: string };

export async function placeBet(
  rawName: string,
  marketId: unknown,
  rawAmount: unknown,
): Promise<BetResult> {
  const name = normalizeName(rawName);
  if (!name) return { ok: false, error: "Unknown user — join the party first." };
  if (typeof marketId !== "string") return { ok: false, error: "Invalid market." };

  const amount = round2(Number(rawAmount));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter a bet amount greater than $0." };
  }

  const user = await getUser(name.id);
  if (!user) return { ok: false, error: "Unknown user — join the party first." };

  const market = await getMarket(marketId);
  if (!market) return { ok: false, error: "That market no longer exists." };
  if (market.status !== "open") return { ok: false, error: "Betting is closed on this market." };

  if (amount > user.balance) {
    return { ok: false, error: `Not enough balance (you have $${user.balance.toFixed(2)}).` };
  }

  // Lock in the odds at this moment, before the pool grows from this bet.
  const lockedOdds = computeOdds(market.startingOdds, market.totalPool);

  // Atomically reserve the stake; roll back if a race put us over budget.
  const newBalance = round2(await db.hincrbyfloat(userKey(name.id), "balance", -amount));
  if (newBalance < -1e-6) {
    await db.hincrbyfloat(userKey(name.id), "balance", amount);
    return { ok: false, error: "Not enough balance — another bet beat you to it." };
  }

  const placedAt = Date.now();
  const bet: Bet = { marketId, word: market.word, amount, lockedOdds, placedAt };
  const marketBet: MarketBet = { userId: name.id, name: user.name, amount, lockedOdds, placedAt };

  await db.rpush(userBetsKey(name.id), bet);
  await db.rpush(marketBetsKey(marketId), marketBet);
  const newPool = round2(await db.hincrbyfloat(marketKey(marketId), "totalPool", amount));
  const newBetCount = await db.hincrbyfloat(marketKey(marketId), "betCount", 1);
  const newOdds = computeOdds(market.startingOdds, newPool);
  const history = [...market.history, newOdds].slice(-HISTORY_CAP);
  await db.hset(marketKey(marketId), { history: JSON.stringify(history) });

  return {
    ok: true,
    balance: newBalance,
    lockedOdds,
    amount,
    market: { ...market, totalPool: newPool, currentOdds: newOdds, betCount: newBetCount, history },
  };
}

// ---- Resolution ------------------------------------------------------------

export type ResolveOutcome = "spoken" | "never" | "void";

export async function resolveMarket(
  marketId: unknown,
  outcome: ResolveOutcome,
): Promise<{ ok: true; market: Market } | { ok: false; error: string }> {
  if (typeof marketId !== "string") return { ok: false, error: "Invalid market." };
  const market = await getMarket(marketId);
  if (!market) return { ok: false, error: "That market no longer exists." };
  if (market.status !== "open") return { ok: false, error: "This market is already settled." };

  const bets = await db.lrange<MarketBet>(marketBetsKey(marketId), 0, -1);

  if (outcome === "void") {
    await db.hset(marketKey(marketId), { status: "void" });
    for (const b of bets) {
      await db.hincrbyfloat(userKey(b.userId), "balance", b.amount);
    }
  } else {
    const spoken = outcome === "spoken";
    await db.hset(marketKey(marketId), { status: "resolved", winner: String(spoken) });
    if (spoken) {
      for (const b of bets) {
        await db.hincrbyfloat(userKey(b.userId), "balance", round2(b.amount * b.lockedOdds));
      }
    }
  }

  return { ok: true, market: (await getMarket(marketId))! };
}

// ---- Derived views ---------------------------------------------------------

function outcomeFor(
  market: Pick<Market, "status" | "winner">,
  amount: number,
  lockedOdds: number,
): { outcome: BetOutcome; payout: number } {
  if (market.status === "void") return { outcome: "refunded", payout: amount };
  if (market.status === "resolved") {
    return market.winner
      ? { outcome: "won", payout: round2(amount * lockedOdds) }
      : { outcome: "lost", payout: 0 };
  }
  return { outcome: "pending", payout: 0 };
}

export function settleBets(bets: Bet[], markets: Market[]): SettledBet[] {
  const byId = new Map(markets.map((m) => [m.id, m]));
  return bets
    .map((bet) => {
      const m = byId.get(bet.marketId);
      const { outcome, payout } = m
        ? outcomeFor(m, bet.amount, bet.lockedOdds)
        : { outcome: "pending" as BetOutcome, payout: 0 };
      return { ...bet, outcome, payout };
    })
    .sort((a, b) => b.placedAt - a.placedAt);
}

export async function getLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
  const ids = await db.smembers(USERS_SET);
  const users = await Promise.all(
    ids.map(async (id) => {
      const raw = await db.hgetall(userKey(id));
      return raw && raw.name != null
        ? { name: asStr(raw.name), balance: round2(asNum(raw.balance)) }
        : null;
    }),
  );
  return users
    .filter((u): u is LeaderboardEntry => u !== null)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, limit);
}

// ---- Admin views -----------------------------------------------------------

export async function getAllBets(): Promise<AdminBet[]> {
  const markets = await getMarkets();
  const rows: AdminBet[] = [];
  for (const m of markets) {
    const bets = await db.lrange<MarketBet>(marketBetsKey(m.id), 0, -1);
    for (const b of bets) {
      const { outcome, payout } = outcomeFor(m, b.amount, b.lockedOdds);
      rows.push({
        marketId: m.id,
        word: m.word,
        kind: m.kind,
        name: b.name ?? b.userId,
        amount: b.amount,
        lockedOdds: b.lockedOdds,
        placedAt: b.placedAt ?? 0,
        status: m.status,
        outcome,
        payout,
      });
    }
  }
  return rows.sort((a, b) => b.placedAt - a.placedAt);
}

export async function getUsersDetailed(): Promise<AdminUser[]> {
  const ids = await db.smembers(USERS_SET);
  const users = await Promise.all(
    ids.map(async (id) => {
      const raw = await db.hgetall(userKey(id));
      if (!raw || raw.name == null) return null;
      const bets = await db.lrange(userBetsKey(id), 0, -1);
      return { name: asStr(raw.name), balance: round2(asNum(raw.balance)), betCount: bets.length };
    }),
  );
  return users
    .filter((u): u is AdminUser => u !== null)
    .sort((a, b) => b.balance - a.balance);
}

export function storageLabel(): string {
  return usingVercelKv ? "Vercel KV" : "In-memory (dev)";
}

export async function resetAll(): Promise<void> {
  const keys = await db.keys("*");
  if (keys.length) await db.del(...keys);
}
