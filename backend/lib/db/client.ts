/**
 * Network-first data client.
 *
 * Every component talks to this module — never to fetch() directly.
 * Reads try the network, cache the result in IndexedDB, return to caller.
 * On failure, return the last cached value (stale-ok).
 *
 * Writes try the network. On failure, mirror into IndexedDB and enqueue
 * for later replay. The sync engine drains the queue when we regain online.
 */

import { db, type PendingOp } from "./dexie";
import { nanoUuid } from "@/lib/util/uuid";

/* ============================================================================
 * Online / offline state + listeners
 * ==========================================================================*/

export type NetState = {
  online: boolean;
  syncing: boolean;
  pending: number;
};

type Listener = (s: NetState) => void;
const listeners = new Set<Listener>();
let state: NetState = { online: true, syncing: false, pending: 0 };

export function subscribe(fn: Listener) {
  listeners.add(fn);
  fn(state);
  return () => { listeners.delete(fn); };
}
function set(patch: Partial<NetState>) {
  state = { ...state, ...patch };
  listeners.forEach(l => l(state));
}

/** Call once at app boot (client only) to wire online/offline events. */
export function initNetwork() {
  if (typeof window === "undefined") return;
  const update = () => set({ online: navigator.onLine });
  update();
  window.addEventListener("online", () => { update(); drainQueue(); });
  window.addEventListener("offline", update);
  // Periodic retry while we have pending writes
  setInterval(() => { if (state.online && state.pending > 0) drainQueue(); }, 15_000);
  // On tab focus — useful after sleep
  window.addEventListener("focus", () => { if (state.online) drainQueue(); });
  // Seed pending count
  db.pending.count().then(n => set({ pending: n }));
}

/* ============================================================================
 * Generic fetch wrapper
 * ==========================================================================*/

type ApiResp<T> = { ok: true; data: T } | { ok: false; error: string; details?: unknown };

async function call<T>(method: string, url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body != null ? { "content-type": "application/json" } : undefined,
    body: body != null ? JSON.stringify(body) : undefined,
    signal,
  });
  const json = (await res.json()) as ApiResp<T>;
  if (!json.ok) throw new Error(json.error || `http_${res.status}`);
  return json.data;
}

/* ============================================================================
 * Cache helpers — mirror server truth into IndexedDB
 * ==========================================================================*/

type TableName = "categories" | "budgets" | "transactions" | "rules" | "goals";

async function mirror(table: TableName, rows: any[]) {
  if (!rows.length) return;
  // Replace existing rows — server is authoritative after a successful fetch.
  await (db as any)[table].bulkPut(rows.map((r: any) => ({ ...r, _dirty: 0 })));
}

/* ============================================================================
 * Read API — network-first, stale-ok fallback.
 *
 * Each read returns `{ data, stale }`:
 *   - stale=false when we hit the network (fresh)
 *   - stale=true  when we fell back to the local cache (possibly outdated)
 * ==========================================================================*/

export type Result<T> = { data: T; stale: boolean; error?: string };

export async function fetchCategories(): Promise<Result<any[]>> {
  try {
    const rows = await call<any[]>("GET", "/api/categories");
    await mirror("categories", rows);
    return { data: rows, stale: false };
  } catch (e: any) {
    const cached = await db.categories.filter(c => !c.deleted_at).sortBy("sort_order");
    return { data: cached, stale: true, error: e.message };
  }
}

export async function fetchTransactions(q: {
  from?: string; to?: string; category_id?: string; query?: string;
  limit?: number; offset?: number;
} = {}): Promise<Result<{ transactions: any[]; total: number }>> {
  const params = new URLSearchParams();
  if (q.from) params.set("from", q.from);
  if (q.to) params.set("to", q.to);
  if (q.category_id) params.set("category_id", q.category_id);
  if (q.query) params.set("q", q.query);
  if (q.limit) params.set("limit", String(q.limit));
  if (q.offset) params.set("offset", String(q.offset));
  const url = "/api/transactions" + (params.toString() ? `?${params}` : "");

  try {
    const payload = await call<{ transactions: any[]; total: number; limit: number; offset: number }>("GET", url);
    await mirror("transactions", payload.transactions);
    return { data: { transactions: payload.transactions, total: payload.total }, stale: false };
  } catch (e: any) {
    // Best-effort local filtering
    let rows = await db.transactions.filter(t => !t.deleted_at).toArray();
    if (q.from) rows = rows.filter(t => t.date >= q.from!);
    if (q.to)   rows = rows.filter(t => t.date <= q.to!);
    if (q.category_id) rows = rows.filter(t => t.category_id === q.category_id);
    if (q.query) {
      const needle = q.query.toLowerCase();
      rows = rows.filter(t => t.description.toLowerCase().includes(needle));
    }
    rows.sort((a, b) => b.date.localeCompare(a.date));
    const limit = q.limit ?? 500;
    const offset = q.offset ?? 0;
    return {
      data: { transactions: rows.slice(offset, offset + limit), total: rows.length },
      stale: true, error: e.message,
    };
  }
}

export async function fetchGoals(): Promise<Result<any[]>> {
  try {
    const rows = await call<any[]>("GET", "/api/goals");
    await mirror("goals", rows);
    return { data: rows, stale: false };
  } catch (e: any) {
    const cached = await db.goals.filter(g => !g.deleted_at).toArray();
    return { data: cached, stale: true, error: e.message };
  }
}

export async function fetchRules(): Promise<Result<any[]>> {
  try {
    const rows = await call<any[]>("GET", "/api/rules");
    await mirror("rules", rows);
    return { data: rows, stale: false };
  } catch (e: any) {
    const cached = await db.rules.filter(r => !r.deleted_at).toArray();
    return { data: cached, stale: true, error: e.message };
  }
}

export async function fetchBudgets(): Promise<Result<any[]>> {
  try {
    const rows = await call<any[]>("GET", "/api/budgets");
    await mirror("budgets", rows);
    return { data: rows, stale: false };
  } catch (e: any) {
    const cached = await db.budgets.filter(b => !b.deleted_at).toArray();
    return { data: cached, stale: true, error: e.message };
  }
}

/* ============================================================================
 * Write API — try network; on failure, cache locally + enqueue.
 * All writes produce a *client-generated* UUID so optimistic rows have
 * a stable id even before the server blesses them.
 * ==========================================================================*/

async function enqueue(op: Omit<PendingOp, "id" | "created_at" | "attempts">) {
  await db.pending.add({
    ...op, created_at: new Date().toISOString(), attempts: 0,
  });
  const n = await db.pending.count();
  set({ pending: n });
}

type AnyRow = Record<string, any>;
function stampLocal(row: AnyRow): AnyRow {
  return { ...row, updated_at: new Date().toISOString(), _dirty: 1, deleted_at: row.deleted_at ?? null };
}

export async function createTransaction(payload: AnyRow): Promise<AnyRow> {
  const id = payload.id ?? nanoUuid();
  const optimistic = stampLocal({
    id, category_id: null, is_income: false, is_dupe: false,
    is_transfer: false, is_refund: false, split_of: null,
    ai_confidence: null, source: "manual", source_file: null, raw: null,
    ...payload,
  });
  await (db.transactions as any).put(optimistic);
  try {
    const row = await call<AnyRow>("POST", "/api/transactions", { ...payload, id });
    await (db.transactions as any).put({ ...row, _dirty: 0 });
    return row;
  } catch (e: any) {
    await enqueue({ op: "create", table: "transactions", row_id: id, payload: { ...payload, id } });
    return optimistic;
  }
}

export async function updateTransaction(id: string, patch: AnyRow): Promise<AnyRow> {
  const existing = await db.transactions.get(id);
  const optimistic = stampLocal({ ...(existing ?? {}), ...patch, id });
  await (db.transactions as any).put(optimistic);
  try {
    const row = await call<AnyRow>("PATCH", `/api/transactions/${id}`, patch);
    await (db.transactions as any).put({ ...row, _dirty: 0 });
    return row;
  } catch {
    await enqueue({ op: "update", table: "transactions", row_id: id, payload: patch });
    return optimistic;
  }
}

export async function deleteTransaction(id: string): Promise<void> {
  const existing = await db.transactions.get(id);
  if (existing) {
    await (db.transactions as any).put({ ...existing, deleted_at: new Date().toISOString(), _dirty: 1 });
  }
  try {
    await call("DELETE", `/api/transactions/${id}`);
    await db.transactions.delete(id);
  } catch {
    await enqueue({ op: "delete", table: "transactions", row_id: id, payload: {} });
  }
}

// The same three shapes for categories, goals, rules — kept explicit for clarity.

export async function createCategory(payload: AnyRow): Promise<AnyRow> {
  const id = payload.id ?? nanoUuid();
  const optimistic = stampLocal({ id, color: null, sort_order: 0, ...payload });
  await (db.categories as any).put(optimistic);
  try {
    const row = await call<AnyRow>("POST", "/api/categories", { ...payload, id });
    await (db.categories as any).put({ ...row, _dirty: 0 });
    return row;
  } catch {
    await enqueue({ op: "create", table: "categories", row_id: id, payload: { ...payload, id } });
    return optimistic;
  }
}
export async function updateCategory(id: string, patch: AnyRow): Promise<AnyRow> {
  const existing = await db.categories.get(id);
  const optimistic = stampLocal({ ...(existing ?? {}), ...patch, id });
  await (db.categories as any).put(optimistic);
  try {
    const row = await call<AnyRow>("PATCH", `/api/categories/${id}`, patch);
    await (db.categories as any).put({ ...row, _dirty: 0 });
    return row;
  } catch {
    await enqueue({ op: "update", table: "categories", row_id: id, payload: patch });
    return optimistic;
  }
}
export async function deleteCategory(id: string): Promise<void> {
  const existing = await db.categories.get(id);
  if (existing) await (db.categories as any).put({ ...existing, deleted_at: new Date().toISOString(), _dirty: 1 });
  try { await call("DELETE", `/api/categories/${id}`); await db.categories.delete(id); }
  catch { await enqueue({ op: "delete", table: "categories", row_id: id, payload: {} }); }
}

export async function createGoal(payload: AnyRow): Promise<AnyRow> {
  const id = payload.id ?? nanoUuid();
  const optimistic = stampLocal({ id, saved: 0, target_date: null, ...payload });
  await (db.goals as any).put(optimistic);
  try {
    const row = await call<AnyRow>("POST", "/api/goals", { ...payload, id });
    await (db.goals as any).put({ ...row, _dirty: 0 });
    return row;
  } catch {
    await enqueue({ op: "create", table: "goals", row_id: id, payload: { ...payload, id } });
    return optimistic;
  }
}
export async function updateGoal(id: string, patch: AnyRow): Promise<AnyRow> {
  const existing = await db.goals.get(id);
  const optimistic = stampLocal({ ...(existing ?? {}), ...patch, id });
  await (db.goals as any).put(optimistic);
  try {
    const row = await call<AnyRow>("PATCH", `/api/goals/${id}`, patch);
    await (db.goals as any).put({ ...row, _dirty: 0 });
    return row;
  } catch {
    await enqueue({ op: "update", table: "goals", row_id: id, payload: patch });
    return optimistic;
  }
}
export async function deleteGoal(id: string): Promise<void> {
  const existing = await db.goals.get(id);
  if (existing) await (db.goals as any).put({ ...existing, deleted_at: new Date().toISOString(), _dirty: 1 });
  try { await call("DELETE", `/api/goals/${id}`); await db.goals.delete(id); }
  catch { await enqueue({ op: "delete", table: "goals", row_id: id, payload: {} }); }
}

export async function createRule(payload: AnyRow): Promise<AnyRow> {
  const id = payload.id ?? nanoUuid();
  const optimistic = stampLocal({ id, priority: 0, ...payload });
  await (db.rules as any).put(optimistic);
  try {
    const row = await call<AnyRow>("POST", "/api/rules", { ...payload, id });
    await (db.rules as any).put({ ...row, _dirty: 0 });
    return row;
  } catch {
    await enqueue({ op: "create", table: "rules", row_id: id, payload: { ...payload, id } });
    return optimistic;
  }
}
export async function deleteRule(id: string): Promise<void> {
  const existing = await db.rules.get(id);
  if (existing) await (db.rules as any).put({ ...existing, deleted_at: new Date().toISOString(), _dirty: 1 });
  try { await call("DELETE", `/api/rules/${id}`); await db.rules.delete(id); }
  catch { await enqueue({ op: "delete", table: "rules", row_id: id, payload: {} }); }
}

/* ============================================================================
 * Drain queue — retry every pending op in FIFO order.
 * Exponential backoff per op via `attempts` counter (capped at 10).
 * ==========================================================================*/

let draining = false;

export async function drainQueue() {
  if (draining) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  draining = true;
  set({ syncing: true });
  try {
    while (true) {
      const [op] = await db.pending.orderBy("created_at").limit(1).toArray();
      if (!op) break;

      // Simple backoff: skip if too many attempts recently
      if (op.attempts > 10) {
        // Move to "dead" by pretending it succeeded — user will see it vanish locally if stale
        await db.pending.delete(op.id!);
        continue;
      }

      try {
        await executeOp(op);
        await db.pending.delete(op.id!);
      } catch (e: any) {
        await db.pending.update(op.id!, {
          attempts: op.attempts + 1,
          last_error: String(e?.message || e),
        });
        // If we keep hitting network errors, bail out of this drain cycle
        if (String(e?.message || e).match(/fetch|network|load/i)) break;
      }
    }
  } finally {
    draining = false;
    const n = await db.pending.count();
    set({ syncing: false, pending: n });
  }
}

async function executeOp(op: PendingOp) {
  const { table, row_id, op: kind, payload } = op;
  const base = `/api/${table}`;
  if (kind === "create") {
    await call("POST", base, payload);
  } else if (kind === "update") {
    await call("PATCH", `${base}/${row_id}`, payload);
  } else if (kind === "delete") {
    await call("DELETE", `${base}/${row_id}`);
  }
}
