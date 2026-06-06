"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { money, odds } from "@/lib/format";
import { settledLabel, yesLabel, noLabel } from "@/lib/market";
import { themeFor } from "@/components/theme";
import { Sparkline } from "@/components/Sparkline";
import type { AdminBet, AdminUser, AppConfig, Market, MarketKind } from "@/lib/types";

const POLL_MS = 2500;
type Section = "markets" | "bets" | "users" | "settings";

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminConsole />
    </Suspense>
  );
}

function AdminConsole() {
  const params = useSearchParams();
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [section, setSection] = useState<Section>("markets");
  const [markets, setMarkets] = useState<Market[]>([]);
  const [bets, setBets] = useState<AdminBet[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [betFilter, setBetFilter] = useState<{ id: string; word: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const keyRef = useRef("");
  keyRef.current = key;

  useEffect(() => setKey(params.get("key") ?? ""), [params]);

  const adminFetch = useCallback(
    (path: string, init?: RequestInit) =>
      fetch(path, {
        ...init,
        cache: "no-store",
        headers: {
          ...(init?.headers ?? {}),
          "Content-Type": "application/json",
          "x-admin-key": keyRef.current,
        },
      }),
    [],
  );

  const flash = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(null), 2600);
  };

  const refresh = useCallback(async () => {
    if (!keyRef.current) return setAuthed(false);
    const res = await adminFetch("/api/admin/markets");
    if (res.status === 401) return setAuthed(false);
    if (!res.ok) return;
    setAuthed(true);
    setMarkets((await res.json()).markets);

    const [b, u, c] = await Promise.all([
      adminFetch("/api/admin/bets"),
      adminFetch("/api/admin/users"),
      config ? Promise.resolve(null) : adminFetch("/api/admin/config"),
    ]);
    if (b?.ok) setBets((await b.json()).bets);
    if (u?.ok) setUsers((await u.json()).users);
    if (c && c.ok) setConfig(await c.json());
  }, [adminFetch, config]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh, key]);

  const create = useCallback(
    async (input: { kind: MarketKind; word: string; startingOdds: number; icon: string }) => {
      const res = await adminFetch("/api/admin/markets", {
        method: "POST",
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) {
        flash(data.error ?? "Failed to create.");
        return false;
      }
      flash(`Opened “${data.market.word}” at ${odds(data.market.startingOdds)}`);
      refresh();
      return true;
    },
    [adminFetch, refresh],
  );

  const resolve = useCallback(
    async (m: Market, outcome: "spoken" | "never" | "void") => {
      const verb =
        outcome === "void"
          ? `Void & refund all bets on “${m.word}”`
          : outcome === "spoken"
            ? `Mark “${m.word}” as ${yesLabel(m.kind)} and pay winners`
            : `Mark “${m.word}” as ${noLabel(m.kind)} (bettors lose)`;
      if (!confirm(`${verb}? This can't be undone.`)) return;
      const res = await adminFetch("/api/admin/resolve", {
        method: "POST",
        body: JSON.stringify({ marketId: m.id, outcome }),
      });
      const data = await res.json();
      if (!res.ok) return flash(data.error ?? "Failed to resolve.");
      flash(`Settled “${m.word}”.`);
      refresh();
    },
    [adminFetch, refresh],
  );

  const reset = useCallback(async () => {
    if (!confirm("Wipe ALL users, balances, markets, and bets? This is permanent.")) return;
    if (!confirm("Really sure? Everyone gets logged out.")) return;
    const res = await adminFetch("/api/admin/reset", { method: "POST" });
    if (res.ok) {
      flash("Everything reset.");
      refresh();
    }
  }, [adminFetch, refresh]);

  const viewBets = (m: Market) => {
    setBetFilter({ id: m.id, word: m.word });
    setSection("bets");
  };

  if (authed === false) return <KeyGate currentKey={key} onSubmit={setKey} />;
  if (authed === null) return <div className="p-8 text-center text-slate-500">Checking access…</div>;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {msg && (
        <div className="fixed inset-x-3 top-3 z-[60] mx-auto max-w-md animate-slide-up rounded-2xl bg-cyan-500/95 px-4 py-3 text-center text-sm font-semibold text-cyan-950 shadow-xl">
          {msg}
        </div>
      )}

      <Sidebar
        section={section}
        onSection={setSection}
        onCreate={() => setShowCreate(true)}
        config={config}
      />

      <div className="flex-1 px-4 py-5 md:px-8 md:py-6">
        <TopBar adminKey={key} />

        {section === "markets" && (
          <MarketsSection markets={markets} onResolve={resolve} onViewBets={viewBets} />
        )}
        {section === "bets" && (
          <BetsSection bets={bets} filter={betFilter} onClearFilter={() => setBetFilter(null)} />
        )}
        {section === "users" && <UsersSection users={users} />}
        {section === "settings" && <SettingsSection config={config} adminKey={key} onReset={reset} />}
      </div>

      {showCreate && <CreateMarketModal onClose={() => setShowCreate(false)} onCreate={create} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Sidebar({
  section,
  onSection,
  onCreate,
  config,
}: {
  section: Section;
  onSection: (s: Section) => void;
  onCreate: () => void;
  config: AppConfig | null;
}) {
  const items: { id: Section; label: string; icon: React.ReactNode }[] = [
    { id: "markets", label: "Markets", icon: <IconBars /> },
    { id: "bets", label: "All Bets", icon: <IconTicket /> },
    { id: "users", label: "Users", icon: <IconUsers /> },
    { id: "settings", label: "Settings", icon: <IconGear /> },
  ];
  return (
    <aside className="border-b border-white/10 bg-[#0a0520] p-4 md:w-64 md:shrink-0 md:border-b-0 md:border-r">
      <div className="mb-5 flex items-center gap-2">
        <span className="text-xl">✨</span>
        <span className="text-lg font-black">Admin Panel</span>
      </div>

      <button
        onClick={onCreate}
        className="mb-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2.5 font-bold text-white shadow-lg transition active:scale-[0.98]"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
        Create Market
      </button>

      <nav className="flex gap-1 md:flex-col">
        {items.map((it) => {
          const active = section === it.id;
          return (
            <button
              key={it.id}
              onClick={() => onSection(it.id)}
              className={`flex flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition md:flex-none ${
                active ? "bg-white/10 text-violet-200" : "text-slate-400 hover:bg-white/5"
              }`}
            >
              <span className="h-4 w-4">{it.icon}</span>
              <span>{it.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-6 hidden rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-xs md:block">
        <div className="mb-2 font-semibold text-slate-300">System Info</div>
        <SysRow label="Polling" value="Every 2s" />
        <SysRow label="Storage" value={config?.storage ?? "…"} />
      </div>
    </aside>
  );
}

function SysRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-slate-400">
      <span>{label}:</span>
      <span className="flex items-center gap-1.5 text-slate-200">
        {value}
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      </span>
    </div>
  );
}

function TopBar({ adminKey }: { adminKey: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-end gap-2 text-xs">
      <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 font-semibold text-emerald-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
        LIVE MODE
      </span>
      <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-slate-400">
        Secret URL Access
        <code className="text-slate-200">/admin?key={adminKey}</code>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Markets table
// ---------------------------------------------------------------------------

function StatusBadge({ market }: { market: Market }) {
  if (market.status === "open") {
    return (
      <span className="rounded-md bg-emerald-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
        Open
      </span>
    );
  }
  if (market.status === "void") {
    return (
      <span className="rounded-md bg-slate-500/20 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-300">
        Void
      </span>
    );
  }
  const win = market.winner === true;
  return (
    <span
      className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase leading-tight tracking-wide ${
        win ? "bg-sky-500/15 text-sky-300" : "bg-rose-500/15 text-rose-300"
      }`}
    >
      {settledLabel(market).replace("Resolved ", "Resolved ")}
    </span>
  );
}

function MarketsSection({
  markets,
  onResolve,
  onViewBets,
}: {
  markets: Market[];
  onResolve: (m: Market, outcome: "spoken" | "never" | "void") => void;
  onViewBets: (m: Market) => void;
}) {
  return (
    <section>
      <h1 className="text-2xl font-black tracking-tight">Markets</h1>
      <p className="mb-5 text-sm text-slate-400">Create, monitor, and resolve markets in real-time.</p>

      {markets.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-500">
          No markets yet — hit “Create Market”.
        </p>
      ) : (
        <div className="thin-scroll overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03]">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3 font-semibold">Market</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Start</th>
                <th className="px-3 py-3 font-semibold">Current</th>
                <th className="px-3 py-3 font-semibold">Total Pool</th>
                <th className="px-3 py-3 font-semibold">Bets</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {markets.map((m) => {
                const theme = themeFor(m.id);
                return (
                  <tr key={m.id} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm ${theme.bubble}`}>
                          {m.icon}
                        </span>
                        <div className="min-w-0">
                          <div className="max-w-[220px] truncate font-semibold">{m.word}</div>
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">
                            {m.kind === "event" ? "Prediction" : "Word"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge market={m} />
                    </td>
                    <td className="px-3 py-3 tabular-nums text-slate-400">{odds(m.startingOdds)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`font-bold tabular-nums ${m.status === "open" ? theme.odds : "text-slate-400"}`}>
                          {odds(m.currentOdds)}
                        </span>
                        <Sparkline points={m.history} color={theme.stroke} className="h-6 w-14" />
                      </div>
                      {m.status !== "open" && <span className="text-[10px] text-slate-500">Final</span>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-semibold tabular-nums">{money(m.totalPool)}</div>
                      <div className="text-[10px] text-slate-500">({m.betCount} bets)</div>
                    </td>
                    <td className="px-3 py-3 tabular-nums text-slate-300">{m.betCount}</td>
                    <td className="px-4 py-3">
                      {m.status === "open" ? (
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <button
                            onClick={() => onResolve(m, "spoken")}
                            className="rounded-lg bg-emerald-500/90 px-2.5 py-1.5 text-xs font-bold text-emerald-950 transition active:scale-95"
                          >
                            Mark {yesLabel(m.kind)}
                          </button>
                          <button
                            onClick={() => onResolve(m, "never")}
                            className="rounded-lg border border-violet-400/50 bg-violet-500/10 px-2.5 py-1.5 text-xs font-semibold text-violet-200 transition hover:bg-violet-500/20"
                          >
                            Mark {noLabel(m.kind)}
                          </button>
                          <button
                            onClick={() => onResolve(m, "void")}
                            title="Void & refund"
                            className="rounded-lg border border-white/10 px-2 py-1.5 text-xs text-slate-400 transition hover:bg-white/5"
                          >
                            Void
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end">
                          <button
                            onClick={() => onViewBets(m)}
                            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/5"
                          >
                            View Bets
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// All Bets
// ---------------------------------------------------------------------------

function BetsSection({
  bets,
  filter,
  onClearFilter,
}: {
  bets: AdminBet[];
  filter: { id: string; word: string } | null;
  onClearFilter: () => void;
}) {
  const shown = filter ? bets.filter((b) => b.marketId === filter.id) : bets;
  const tone: Record<AdminBet["outcome"], string> = {
    pending: "text-amber-300",
    won: "text-emerald-300",
    lost: "text-rose-300",
    refunded: "text-slate-400",
  };
  return (
    <section>
      <h1 className="text-2xl font-black tracking-tight">All Bets</h1>
      <p className="mb-5 text-sm text-slate-400">Every wager across the party, newest first.</p>

      {filter && (
        <button
          onClick={onClearFilter}
          className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-400/40 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-200"
        >
          Filtered: “{filter.word}” ✕
        </button>
      )}

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-500">
          No bets yet.
        </p>
      ) : (
        <div className="thin-scroll overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03]">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3 font-semibold">When</th>
                <th className="px-3 py-3 font-semibold">Bettor</th>
                <th className="px-3 py-3 font-semibold">Market</th>
                <th className="px-3 py-3 font-semibold">Amount</th>
                <th className="px-3 py-3 font-semibold">Odds</th>
                <th className="px-4 py-3 text-right font-semibold">Result</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((b, i) => (
                <tr key={i} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3 text-slate-400">{timeAgo(b.placedAt)}</td>
                  <td className="px-3 py-3 font-semibold">{b.name}</td>
                  <td className="max-w-[200px] truncate px-3 py-3 text-slate-300">{b.word}</td>
                  <td className="px-3 py-3 tabular-nums">{money(b.amount)}</td>
                  <td className="px-3 py-3 tabular-nums text-slate-400">{odds(b.lockedOdds)}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${tone[b.outcome]}`}>
                    {b.outcome === "pending"
                      ? "Open"
                      : b.outcome === "won"
                        ? `Won ${money(b.payout)}`
                        : b.outcome === "lost"
                          ? `Lost ${money(b.amount)}`
                          : `Refunded ${money(b.payout)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

function UsersSection({ users }: { users: AdminUser[] }) {
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <section>
      <h1 className="text-2xl font-black tracking-tight">Users</h1>
      <p className="mb-5 text-sm text-slate-400">{users.length} players, ranked by balance.</p>

      {users.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-500">
          No players have joined yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3 font-semibold">Rank</th>
                <th className="px-3 py-3 font-semibold">User</th>
                <th className="px-3 py-3 font-semibold">Balance</th>
                <th className="px-4 py-3 text-right font-semibold">Bets</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.name + i} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3 text-center text-lg">{medals[i] ?? <span className="text-sm text-slate-500">{i + 1}</span>}</td>
                  <td className="px-3 py-3 font-semibold">{u.name}</td>
                  <td className="px-3 py-3 font-bold tabular-nums text-emerald-300">{money(u.balance)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-300">{u.betCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function SettingsSection({
  config,
  adminKey,
  onReset,
}: {
  config: AppConfig | null;
  adminKey: string;
  onReset: () => void;
}) {
  const rows: [string, string][] = config
    ? [
        ["Storage backend", config.storage],
        ["Starting balance", money(config.startingBalance)],
        ["Odds compression (k)", String(config.oddsK)],
        ["Odds floor", `${config.oddsFloor.toFixed(2)}×`],
        ["Polling interval", `${(config.pollMs / 1000).toFixed(1)}s`],
        ["Admin key", adminKey],
      ]
    : [];

  return (
    <section className="max-w-xl">
      <h1 className="text-2xl font-black tracking-tight">Settings</h1>
      <p className="mb-5 text-sm text-slate-400">Current configuration (set via environment variables).</p>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        {rows.map(([k, v], i) => (
          <div
            key={k}
            className={`flex items-center justify-between px-4 py-3 text-sm ${i > 0 ? "border-t border-white/5" : ""}`}
          >
            <span className="text-slate-400">{k}</span>
            <span className="font-semibold">{v}</span>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Tune odds with <code>ODDS_K</code> and the admin key with <code>ADMIN_KEY</code> in your env.
      </p>

      <div className="mt-10 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4">
        <div className="text-sm font-bold text-rose-300">Danger zone</div>
        <p className="mt-1 text-xs text-slate-400">
          Reset the entire party — clears all balances, markets, and bets.
        </p>
        <button
          onClick={onReset}
          className="mt-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20"
        >
          Reset everything
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Create-market modal
// ---------------------------------------------------------------------------

const WORD_EMOJI = ["💬", "🗯️", "🎤", "📣", "🔥", "✨"];
const EVENT_EMOJI = ["🎯", "🎲", "🔮", "🏆", "🎉", "⚡"];

function CreateMarketModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: { kind: MarketKind; word: string; startingOdds: number; icon: string }) => Promise<boolean>;
}) {
  const [kind, setKind] = useState<MarketKind>("word");
  const [word, setWord] = useState("");
  const [oddsStr, setOddsStr] = useState("3.0");
  const [icon, setIcon] = useState("💬");
  const [busy, setBusy] = useState(false);

  const palette = kind === "event" ? EVENT_EMOJI : WORD_EMOJI;
  const valid = word.trim().length > 0 && Number(oddsStr) > 1;

  const switchKind = (k: MarketKind) => {
    setKind(k);
    setIcon((k === "event" ? EVENT_EMOJI : WORD_EMOJI)[0]);
  };

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const ok = await onCreate({ kind, word: word.trim(), startingOdds: Number(oddsStr), icon });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md animate-pop-in rounded-3xl border border-white/10 bg-[#0e0826] p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Create Market</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10" aria-label="Close">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <TypeOption
            active={kind === "word"}
            onClick={() => switchKind("word")}
            emoji="🗣️"
            title="Word spoken"
            sub="The host says a word/phrase"
          />
          <TypeOption
            active={kind === "event"}
            onClick={() => switchKind("event")}
            emoji="🎯"
            title="Prediction"
            sub="Any yes/no outcome"
          />
        </div>

        <label className="mt-4 block text-sm font-medium text-slate-300">
          {kind === "event" ? "Question / prediction" : "Word or phrase"}
        </label>
        <input
          autoFocus
          value={word}
          onChange={(e) => setWord(e.target.value)}
          maxLength={kind === "event" ? 120 : 60}
          placeholder={kind === "event" ? "Will the cake be chocolate?" : "literally"}
          className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 outline-none focus:border-cyan-400/60"
        />

        <label className="mt-4 block text-sm font-medium text-slate-300">Icon</label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {palette.map((e) => (
            <button
              key={e}
              onClick={() => setIcon(e)}
              className={`flex h-10 w-10 items-center justify-center rounded-xl border text-lg transition ${
                icon === e ? "border-cyan-400 bg-cyan-500/15" : "border-white/10 bg-white/5 hover:bg-white/10"
              }`}
            >
              {e}
            </button>
          ))}
        </div>

        <label className="mt-4 block text-sm font-medium text-slate-300">Starting odds</label>
        <div className="relative mt-1.5 w-32">
          <input
            type="number"
            step="0.1"
            min="1.1"
            value={oddsStr}
            onChange={(e) => setOddsStr(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-3 pr-7 text-right font-semibold tabular-nums outline-none focus:border-cyan-400/60"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">×</span>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          The first bet locks in this multiplier; it falls toward 1.1× as money piles in.
        </p>

        <button
          onClick={submit}
          disabled={!valid || busy}
          className="mt-5 w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-3 font-bold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-40"
        >
          {busy ? "Creating…" : "Open Market"}
        </button>
      </div>
    </div>
  );
}

function TypeOption({
  active,
  onClick,
  emoji,
  title,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  emoji: string;
  title: string;
  sub: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border p-3 text-left transition ${
        active ? "border-violet-400 bg-violet-500/15" : "border-white/10 bg-white/5 hover:bg-white/10"
      }`}
    >
      <div className="text-xl">{emoji}</div>
      <div className="mt-1 text-sm font-bold">{title}</div>
      <div className="text-[11px] text-slate-400">{sub}</div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Key gate + misc
// ---------------------------------------------------------------------------

function KeyGate({ currentKey, onSubmit }: { currentKey: string; onSubmit: (k: string) => void }) {
  const [val, setVal] = useState(currentKey);
  return (
    <main className="starfield flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="mb-2 text-5xl">🔒</div>
      <h1 className="text-xl font-bold">Host access</h1>
      <p className="mt-1 text-sm text-slate-400">Enter the secret admin key.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(val.trim());
        }}
        className="mt-6 w-full max-w-xs"
      >
        <input
          autoFocus
          type="password"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="admin key"
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center outline-none focus:border-cyan-400/60"
        />
        <button className="mt-3 w-full rounded-2xl bg-cyan-500 px-4 py-3 font-bold text-cyan-950">Unlock</button>
      </form>
    </main>
  );
}

function timeAgo(ts: number): string {
  if (!ts) return "—";
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function IconBars() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="12" width="4" height="8" rx="1" />
      <rect x="10" y="6" width="4" height="14" rx="1" />
      <rect x="16" y="9" width="4" height="11" rx="1" />
    </svg>
  );
}
function IconTicket() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M9 6v12" strokeDasharray="2 2" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20v-1a5 5 0 0 1 10 0v1" strokeLinecap="round" />
      <path d="M16 6a3 3 0 0 1 0 6M21 20v-1a4 4 0 0 0-3-3.8" strokeLinecap="round" />
    </svg>
  );
}
function IconGear() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7 7 0 0 0-1.7-1l-.4-2.5h-4l-.4 2.5a7 7 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a7 7 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7 7 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5a7 7 0 0 0 .1-1z" strokeLinejoin="round" />
    </svg>
  );
}
