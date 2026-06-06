"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { money, odds } from "@/lib/format";
import { questionText, yesVerb, settledLabel } from "@/lib/market";
import { themeFor } from "@/components/theme";
import { Sparkline } from "@/components/Sparkline";
import type { LeaderboardEntry, Market, SettledBet } from "@/lib/types";

const STORAGE_KEY = "pm_username";
const POLL_MS = 2500;

type Tab = "markets" | "bets" | "leaderboard";
type Toast = { text: string; kind: "ok" | "err" } | null;

export default function GuestPage() {
  const [username, setUsername] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [bets, setBets] = useState<SettledBet[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("markets");
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  const usernameRef = useRef<string | null>(null);
  usernameRef.current = username;
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const flash = useCallback((text: string, kind: "ok" | "err") => {
    setToast({ text, kind });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [mRes, lRes] = await Promise.all([
        fetch("/api/markets", { cache: "no-store" }),
        fetch("/api/leaderboard", { cache: "no-store" }),
      ]);
      if (mRes.ok) setMarkets((await mRes.json()).markets);
      if (lRes.ok) setLeaderboard((await lRes.json()).leaderboard);

      const name = usernameRef.current;
      if (name) {
        const meRes = await fetch(`/api/me?username=${encodeURIComponent(name)}`, {
          cache: "no-store",
        });
        if (meRes.ok) {
          const me = await meRes.json();
          setBalance(me.balance);
          setBets(me.bets);
        }
      }
    } catch {
      /* transient blip — the next poll recovers */
    }
  }, []);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (saved) setUsername(saved);
    setReady(true);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh, username]);

  useEffect(() => {
    if (!selectedMarket) return;
    const refreshed = markets.find((m) => m.id === selectedMarket.id);
    if (refreshed) setSelectedMarket(refreshed);
  }, [markets, selectedMarket]);

  const join = useCallback(
    async (name: string) => {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: name }),
      });
      const data = await res.json();
      if (!res.ok) return flash(data.error ?? "Could not join.", "err");
      localStorage.setItem(STORAGE_KEY, data.name);
      setUsername(data.name);
      setBalance(data.balance);
      flash(`Welcome, ${data.name}! You've got ${money(data.balance)} to play with.`, "ok");
    },
    [flash],
  );

  const placeBet = useCallback(
    async (market: Market, amount: number) => {
      const name = usernameRef.current;
      if (!name) return false;
      const res = await fetch("/api/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: name, marketId: market.id, amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        flash(data.error ?? "Bet failed.", "err");
        return false;
      }
      setBalance(data.balance);
      flash(
        `Locked ${money(data.amount)} on “${market.word}” at ${odds(data.lockedOdds)} → ${money(
          data.amount * data.lockedOdds,
        )} if it hits!`,
        "ok",
      );
      refresh();
      return true;
    },
    [flash, refresh],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUsername(null);
    setBets([]);
    setBalance(0);
    setSelectedMarket(null);
    setMenuOpen(false);
    setTab("markets");
  }, []);

  if (!ready) return null;

  return (
    <>
      {toast && (
        <div
          className={`fixed inset-x-3 top-3 z-[60] mx-auto max-w-md animate-slide-up rounded-2xl px-4 py-3 text-sm font-semibold shadow-xl ${
            toast.kind === "ok" ? "bg-emerald-500/95 text-emerald-950" : "bg-rose-500/95 text-rose-950"
          }`}
        >
          {toast.text}
        </div>
      )}

      {!username ? (
        <Landing onJoin={join} />
      ) : (
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col">
          <Header
            tab={tab}
            balance={balance}
            menuOpen={menuOpen}
            onMenu={() => setMenuOpen((o) => !o)}
            name={username}
            onLogout={logout}
          />

          <main className="flex-1 px-4 pb-28 pt-4">
            {tab === "markets" && (
              <MarketsTab
                name={username}
                balance={balance}
                markets={markets}
                onBet={setSelectedMarket}
              />
            )}
            {tab === "bets" && <BetsTab bets={bets} />}
            {tab === "leaderboard" && <LeaderboardTab entries={leaderboard} me={username} />}
          </main>

          <BottomNav tab={tab} onTab={setTab} />

          {selectedMarket && (
            <BetSheet
              market={selectedMarket}
              balance={balance}
              onClose={() => setSelectedMarket(null)}
              onBet={placeBet}
            />
          )}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Landing
// ---------------------------------------------------------------------------

function Landing({ onJoin }: { onJoin: (name: string) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    await onJoin(name.trim());
    setBusy(false);
  };

  return (
    <div className="starfield flex min-h-screen flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-8">
        <h1 className="text-4xl font-black leading-none tracking-tight">
          <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-violet-300 bg-clip-text text-transparent">
            PARTY
          </span>
        </h1>
        <h2 className="mt-1 text-xl font-bold tracking-[0.2em] text-violet-200/90">
          PREDICTION MARKET
        </h2>
        <p className="mt-5 text-slate-300">Bet on what the host will say!</p>
      </div>

      <form
        onSubmit={submit}
        className="w-full max-w-xs rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur-md"
      >
        <h3 className="text-lg font-bold">Enter your username</h3>
        <p className="mt-1 text-xs text-slate-400">You&apos;ll get $100 to start betting</p>
        <div className="relative mt-5">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Username"
            maxLength={24}
            className="w-full rounded-xl border border-white/10 bg-black/30 py-3 pl-9 pr-3 text-base font-medium outline-none transition focus:border-violet-400/60"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="mt-4 w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-3 text-base font-bold tracking-wide text-white shadow-lg transition active:scale-[0.98] disabled:opacity-40"
        >
          {busy ? "JOINING…" : "GET STARTED"}
        </button>
      </form>

      <p className="mt-6 text-xs text-slate-400">No real money. Just for fun. ✨</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

const TAB_TITLE: Record<Tab, string> = {
  markets: "Markets",
  bets: "My Bets",
  leaderboard: "Leaderboard",
};

function Header({
  tab,
  balance,
  menuOpen,
  onMenu,
  name,
  onLogout,
}: {
  tab: Tab;
  balance: number;
  menuOpen: boolean;
  onMenu: () => void;
  name: string;
  onLogout: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b0620]/85 backdrop-blur">
      <div className="relative flex items-center justify-between px-4 py-3">
        <button onClick={onMenu} className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10" aria-label="Menu">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
        </button>

        <div className="text-center">
          <div className="font-bold leading-tight">{TAB_TITLE[tab]}</div>
          <div className="flex items-center justify-center gap-1 text-[11px] text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            Live
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-bold tabular-nums text-emerald-300">
          {money(balance)}
        </div>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={onMenu} />
            <div className="absolute left-3 top-14 z-50 w-52 animate-pop-in rounded-2xl border border-white/10 bg-[#140b2e] p-2 shadow-2xl">
              <div className="px-3 py-2 text-xs text-slate-400">
                Signed in as <span className="font-semibold text-slate-200">{name}</span>
              </div>
              <button
                onClick={onLogout}
                className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-200 hover:bg-white/10"
              >
                Switch user
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

function BottomNav({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const items: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: "markets",
      label: "Markets",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 3v18h18" strokeLinecap="round" />
          <path d="M7 14l3-3 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      id: "bets",
      label: "My Bets",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 10h18" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id: "leaderboard",
      label: "Leaderboard",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="4" y="12" width="4" height="8" rx="1" />
          <rect x="10" y="7" width="4" height="13" rx="1" />
          <rect x="16" y="14" width="4" height="6" rx="1" />
        </svg>
      ),
    },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-white/10 bg-[#0b0620]/95 backdrop-blur">
      <div className="grid grid-cols-3">
        {items.map((it) => {
          const active = tab === it.id;
          return (
            <button
              key={it.id}
              onClick={() => onTab(it.id)}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                active ? "text-violet-300" : "text-slate-500"
              }`}
            >
              <span className="h-5 w-5">{it.icon}</span>
              {it.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Markets tab
// ---------------------------------------------------------------------------

function MarketsTab({
  name,
  balance,
  markets,
  onBet,
}: {
  name: string;
  balance: number;
  markets: Market[];
  onBet: (m: Market) => void;
}) {
  const open = markets.filter((m) => m.status === "open");
  const settled = markets.filter((m) => m.status !== "open");

  return (
    <>
      <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold">Welcome, {name}!</div>
            <div className="text-xs text-slate-400">Balance</div>
          </div>
          <div className="text-2xl font-black tabular-nums text-violet-300">{money(balance)}</div>
        </div>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-200">Open Markets</h2>
        <span className="flex items-center gap-1 text-[11px] text-slate-500">
          <svg className="h-3.5 w-3.5 animate-spin [animation-duration:3s]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" strokeLinecap="round" />
            <path d="M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Updates in 2s
        </span>
      </div>

      {open.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 px-4 py-12 text-center text-sm text-slate-500">
          No open markets yet. The host is cooking something up. 🍳
        </div>
      ) : (
        <div className="space-y-3">
          {open.map((m) => (
            <MarketCard key={m.id} market={m} onBet={() => onBet(m)} disabled={balance <= 0} />
          ))}
        </div>
      )}

      {settled.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 text-sm font-bold text-slate-400">Settled</h2>
          <div className="space-y-2">
            {settled.map((m) => (
              <SettledRow key={m.id} market={m} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function MarketCard({
  market,
  onBet,
  disabled,
}: {
  market: Market;
  onBet: () => void;
  disabled: boolean;
}) {
  const theme = themeFor(market.id);
  return (
    <div className="animate-pop-in rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-lg shadow-inner ${theme.bubble}`}
        >
          {market.icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="break-words text-lg font-extrabold leading-tight">{market.word}</div>
          <div className="mt-0.5 text-xs text-slate-400">Total Pool</div>
          <div className="text-sm font-semibold tabular-nums text-slate-200">
            {money(market.totalPool)}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className={`text-2xl font-black tabular-nums ${theme.odds}`}>
            {odds(market.currentOdds)}
          </div>
          <Sparkline points={market.history} color={theme.stroke} className="h-8 w-20" />
        </div>
      </div>

      <button
        onClick={onBet}
        disabled={disabled}
        className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 py-2 text-sm font-bold text-slate-100 transition hover:bg-white/10 active:scale-[0.99] disabled:opacity-40"
      >
        {disabled ? "Out of balance" : "Bet"}
      </button>
    </div>
  );
}

function SettledRow({ market }: { market: Market }) {
  const voided = market.status === "void";
  const win = market.winner === true;
  const tone = voided ? "text-slate-400" : win ? "text-emerald-300" : "text-rose-300";
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5 opacity-90">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/5 text-sm">
        {market.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{market.word}</div>
        <div className="text-[11px] text-slate-500">pool {money(market.totalPool)}</div>
      </div>
      <div className={`shrink-0 text-xs font-bold ${tone}`}>{settledLabel(market)}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bet bottom-sheet
// ---------------------------------------------------------------------------

const CHIPS = [10, 25, 50, 100];

function BetSheet({
  market,
  balance,
  onClose,
  onBet,
}: {
  market: Market;
  balance: number;
  onClose: () => void;
  onBet: (m: Market, amount: number) => Promise<boolean>;
}) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const theme = themeFor(market.id);
  const value = Number(amount);
  const valid = Number.isFinite(value) && value > 0 && value <= balance;
  const potential = valid ? value * market.currentOdds : 0;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const ok = await onBet(market, value);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 max-h-[92vh] w-full max-w-md animate-sheet-up overflow-y-auto rounded-t-3xl border border-white/10 bg-[#0e0826] p-5 pb-8 shadow-2xl">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br text-lg ${theme.bubble}`}>
              {market.icon}
            </div>
            <div className="text-xl font-extrabold">{market.word}</div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10" aria-label="Close">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="mt-4 space-y-1.5">
          <Row label="Current Odds" value={<span className={`font-bold ${theme.odds}`}>{odds(market.currentOdds)}</span>} />
          <Row label="Total Pool" value={money(market.totalPool)} />
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-center text-sm text-slate-300">
          {questionText(market)} You can bet any amount up to your balance — early bettors lock in better odds!
        </div>

        <div className="mt-4">
          <Row label="Your Balance" value={<span className="font-bold text-emerald-300">{money(balance)}</span>} />
        </div>

        <label className="mt-4 block text-sm font-medium text-slate-300">Bet Amount</label>
        <div className="relative mt-1.5">
          <input
            type="number"
            inputMode="decimal"
            autoFocus
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="0"
            className="w-full rounded-xl border border-white/10 bg-black/30 py-3 pl-4 pr-9 text-lg font-bold tabular-nums outline-none focus:border-violet-400/60"
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500">$</span>
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          {CHIPS.map((c) => {
            const active = amount === String(c);
            return (
              <button
                key={c}
                disabled={c > balance}
                onClick={() => setAmount(String(c))}
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition disabled:opacity-30 ${
                  active
                    ? "border-violet-400 bg-violet-500/20 text-violet-200"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                {c}
              </button>
            );
          })}
          <button
            disabled={balance <= 0}
            onClick={() => setAmount(String(Math.floor(balance * 100) / 100))}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition disabled:opacity-30 ${
              amount === String(Math.floor(balance * 100) / 100) && balance > 0
                ? "border-violet-400 bg-violet-500/20 text-violet-200"
                : "border-white/10 bg-white/5 hover:bg-white/10"
            }`}
          >
            All
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <div>
            <div className="font-bold text-emerald-300">You&apos;ll Win</div>
            <div className="text-[11px] text-slate-400">
              If resolved as {yesVerb(market.kind)} ({value > 0 ? value : 0} × {odds(market.currentOdds)})
            </div>
          </div>
          <div className="text-xl font-black tabular-nums text-emerald-300">{money(potential)}</div>
        </div>

        <button
          onClick={submit}
          disabled={!valid || busy}
          className="mt-4 w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-3.5 text-base font-bold tracking-wide text-white shadow-lg transition active:scale-[0.98] disabled:opacity-40"
        >
          {busy ? "PLACING…" : "PLACE BET"}
        </button>
        <p className="mt-3 text-center text-xs text-slate-500">
          Your bet will lock in the current odds.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// My Bets tab
// ---------------------------------------------------------------------------

function BetsTab({ bets }: { bets: SettledBet[] }) {
  if (bets.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 px-4 py-12 text-center text-sm text-slate-500">
        You haven&apos;t placed any bets yet. Head to Markets to get in! 🎲
      </div>
    );
  }
  const tone: Record<SettledBet["outcome"], string> = {
    pending: "text-amber-300",
    won: "text-emerald-300",
    lost: "text-rose-300",
    refunded: "text-slate-400",
  };
  const label = (b: SettledBet) =>
    b.outcome === "pending"
      ? "Open"
      : b.outcome === "won"
        ? `Won ${money(b.payout)}`
        : b.outcome === "lost"
          ? `Lost ${money(b.amount)}`
          : `Refunded ${money(b.payout)}`;

  return (
    <div className="space-y-2">
      {bets.map((b, i) => (
        <div
          key={i}
          className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3"
        >
          <div className="min-w-0">
            <div className="truncate font-semibold">{b.word}</div>
            <div className="text-xs text-slate-400">
              {money(b.amount)} @ {odds(b.lockedOdds)}
            </div>
          </div>
          <div className={`shrink-0 text-sm font-bold ${tone[b.outcome]}`}>{label(b)}</div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leaderboard tab
// ---------------------------------------------------------------------------

function LeaderboardTab({ entries, me }: { entries: LeaderboardEntry[]; me: string }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 px-4 py-12 text-center text-sm text-slate-500">
        No players yet.
      </div>
    );
  }
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div className="space-y-2">
      {entries.map((e, i) => {
        const mine = e.name.toLowerCase() === me.toLowerCase();
        return (
          <div
            key={e.name + i}
            className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
              mine ? "border-violet-400/40 bg-violet-500/10" : "border-white/10 bg-white/[0.04]"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="w-6 text-center text-lg">{medals[i] ?? <span className="text-sm text-slate-500">{i + 1}</span>}</span>
              <span className={`font-semibold ${mine ? "text-violet-200" : ""}`}>
                {e.name}
                {mine && <span className="ml-1 text-xs text-violet-300/70">(you)</span>}
              </span>
            </div>
            <span className="font-bold tabular-nums text-emerald-300">{money(e.balance)}</span>
          </div>
        );
      })}
    </div>
  );
}
