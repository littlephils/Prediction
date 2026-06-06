import { kv } from "@vercel/kv";

/**
 * Minimal Redis-like surface used by the data store. Two backends implement it:
 *
 *  - @vercel/kv (Upstash Redis) in production — selected when KV_REST_API_URL
 *    is present (Vercel injects this via the Upstash marketplace integration).
 *  - An in-memory store for local development — `next dev` keeps a single Node
 *    process alive, so the data survives between requests (but not restarts).
 *
 * List values are stored/returned as objects: each backend handles its own
 * (de)serialization so callers always work with plain objects.
 */
export interface KVLike {
  hgetall(key: string): Promise<Record<string, unknown> | null>;
  hset(key: string, obj: Record<string, string | number>): Promise<number>;
  hincrbyfloat(key: string, field: string, increment: number): Promise<number>;
  sadd(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  rpush(key: string, ...values: unknown[]): Promise<number>;
  lrange<T = unknown>(key: string, start: number, stop: number): Promise<T[]>;
  keys(pattern: string): Promise<string[]>;
  del(...keys: string[]): Promise<number>;
}

class MemoryKV implements KVLike {
  private hashes = new Map<string, Map<string, string>>();
  private sets = new Map<string, Set<string>>();
  private lists = new Map<string, string[]>();

  async hgetall(key: string): Promise<Record<string, unknown> | null> {
    const h = this.hashes.get(key);
    if (!h || h.size === 0) return null;
    return Object.fromEntries(h);
  }

  async hset(key: string, obj: Record<string, string | number>): Promise<number> {
    let h = this.hashes.get(key);
    if (!h) this.hashes.set(key, (h = new Map()));
    let added = 0;
    for (const [field, value] of Object.entries(obj)) {
      if (!h.has(field)) added++;
      h.set(field, String(value));
    }
    return added;
  }

  async hincrbyfloat(key: string, field: string, increment: number): Promise<number> {
    let h = this.hashes.get(key);
    if (!h) this.hashes.set(key, (h = new Map()));
    const next = (parseFloat(h.get(field) ?? "0") || 0) + increment;
    h.set(field, String(next));
    return next;
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    let s = this.sets.get(key);
    if (!s) this.sets.set(key, (s = new Set()));
    let added = 0;
    for (const m of members) if (!s.has(m)) (s.add(m), added++);
    return added;
  }

  async smembers(key: string): Promise<string[]> {
    return Array.from(this.sets.get(key) ?? []);
  }

  async rpush(key: string, ...values: unknown[]): Promise<number> {
    let l = this.lists.get(key);
    if (!l) this.lists.set(key, (l = []));
    for (const v of values) l.push(JSON.stringify(v));
    return l.length;
  }

  async lrange<T = unknown>(key: string, start: number, stop: number): Promise<T[]> {
    const l = this.lists.get(key) ?? [];
    const end = stop < 0 ? l.length + stop + 1 : stop + 1;
    return l.slice(start < 0 ? Math.max(0, l.length + start) : start, end).map((s) => JSON.parse(s) as T);
  }

  async keys(pattern: string): Promise<string[]> {
    const all = [...this.hashes.keys(), ...this.sets.keys(), ...this.lists.keys()];
    if (pattern === "*") return all;
    const re = new RegExp(
      "^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$",
    );
    return all.filter((k) => re.test(k));
  }

  async del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) {
      if (this.hashes.delete(k)) n++;
      if (this.sets.delete(k)) n++;
      if (this.lists.delete(k)) n++;
    }
    return n;
  }
}

// Persist the memory backend across Next.js dev hot-reloads.
const globalForKv = globalThis as unknown as { __memoryKv?: MemoryKV };

function memoryBackend(): KVLike {
  return (globalForKv.__memoryKv ??= new MemoryKV());
}

export const usingVercelKv = Boolean(process.env.KV_REST_API_URL);

export const db: KVLike = usingVercelKv ? (kv as unknown as KVLike) : memoryBackend();
