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
  /** Permanent (4xx) errors from the last drain — caller should surface + let user resolve. */
  deadLetters?: { table: string; op: string; error: string; at: string }[];
  pending: number;
};

type Listener = (s: NetState) => void;
const listeners = new Set<Listener>();
let state: NetState = { online: true, syncing: false, pending: 0, deadLetters: [] };

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
  // Periodic retry while we have pending writes — back off to 60s to avoid traffic pile-up
  setInterval(() => { if (state.online && state.pending > 0) drainQueue(); }, 60_000);
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
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body != null ? { "content-type": "application/json" } : undefined,
      body: body != null ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (e: any) {
    console.warn(`[ledger] NET ${method} ${url} — ${e?.message ?? e}`);
    throw Object.assign(new Error(e?.message || "network_error"), { status: 0 });
  }

  let json: ApiResp<T>;
  try { json = (await res.json()) as ApiResp<T>; }
  catch {
    console.warn(`[ledger] ${res.status} ${method} ${url} — non-JSON response`);
    throw Object.assign(new Error(`http_${res.status}`), { status: res.status });
  }

  if (!json.ok) {
    const dt = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0);
    // Structured log — copy-paste friendly
    console.warn(
      `[ledger] ${res.status} ${method} ${url} (${dt}ms)\n` +
      `  error:   ${json.error}\n` +
      (body != null ? `  payload: ${JSON.stringify(body).slice(0, 400)}\n` : "") +
      ((json as any).details ? `  details: ${JSON.stringify((json as any).details).slice(0, 600)}\n` : "")
    );
    throw Object.assign(new Error(json.error || `http_${res.status}`), {
      status: res.status,
      details: (json as any).details,
    });
  }
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

/* ---- Budgets: PUT-upsert envelope ---- */
export async function upsertBudgets(
  entries: { category_id: string; amount: number }[]
): Promise<AnyRow[]> {
  // Optimistic local mirror
  for (const b of entries) {
    const existing = await db.budgets
      .filter((x: any) => x.category_id === b.category_id && !x.deleted_at)
      .first();
    const optimistic = stampLocal({
      id: existing?.id ?? nanoUuid(),
      category_id: b.category_id,
      amount: b.amount,
    });
    await (db.budgets as any).put(optimistic);
  }
  try {
    const rows = await call<AnyRow[]>("PUT", "/api/budgets", { budgets: entries });
    for (const r of rows) await (db.budgets as any).put({ ...r, _dirty: 0 });
    return rows;
  } catch {
    await enqueue({ op: "upsert", table: "budgets", row_id: "_bulk_" + Date.now(), payload: { budgets: entries } });
    return db.budgets.filter((b: any) => !b.deleted_at).toArray();
  }
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
  const deadLetters: NonNullable<NetState["deadLetters"]> = [...(state.deadLetters ?? [])];
  try {
    while (true) {
      const [op] = await db.pending.orderBy("created_at").limit(1).toArray();
      if (!op) break;

      // Dead-letter: give up after 5 tries. Drop from queue so we stop hammering.
      if (op.attempts >= 5) {
        deadLetters.push({
          table: op.table, op: op.op,
          error: op.last_error || "max_attempts_exceeded",
          at: new Date().toISOString(),
        });
        await db.pending.delete(op.id!);
        continue;
      }

      try {
        await executeOp(op);
        await db.pending.delete(op.id!);
      } catch (e: any) {
        const status: number | undefined = e?.status;
        const msg = String(e?.message || e);

        // 409 on a create is idempotent-success: the row is already on the
        // server (previous attempt partially succeeded). Drop the op silently.
        if (status === 409 && op.op === "create") {
          console.info(
            `[ledger] sync DEDUP ${op.op} ${op.table}/${op.row_id} — already on server, dropping`
          );
          await db.pending.delete(op.id!);
          continue;
        }

        // 4xx = permanent client error (bad payload, not-found, auth). Never retry.
        if (typeof status === "number" && status >= 400 && status < 500) {
          console.warn(
            `[ledger] sync DROP ${op.op} ${op.table}/${op.row_id} — ${status} ${msg}`
          );
          deadLetters.push({ table: op.table, op: op.op, error: msg, at: new Date().toISOString() });
          await db.pending.delete(op.id!);
          continue;
        }

        // 5xx / network / parse error: bump attempts and stop this cycle.
        // The next online/focus/interval tick will retry — no busy loop.
        console.warn(
          `[ledger] sync RETRY ${op.op} ${op.table}/${op.row_id} — attempt ${op.attempts + 1}/5 (${msg})`
        );
        await db.pending.update(op.id!, {
          attempts: op.attempts + 1,
          last_error: msg,
        });
        break;
      }
    }
  } finally {
    draining = false;
    const n = await db.pending.count();
    set({ syncing: false, pending: n, deadLetters });
  }
}

/** Drop all dead-letters (user acknowledged them). */
export function clearDeadLetters() {
  set({ deadLetters: [] });
}

/* ============================================================================
 * Emergency local reset.
 *
 * Does NOT touch the server. Clears:
 *   - every local Dexie table (transactions, categories, budgets, goals, rules)
 *   - the pending-writes queue (stale ops that keep 500'ing)
 *   - the dead-letter list
 *
 * Use when the sync queue is wedged and you want the app to stop hammering
 * the API right now. Call wipeUserData("all") afterward if you also want the
 * server rows gone — or a fresh page load will pull them back down from the
 * server, which is usually what you want.
 * ==========================================================================*/
export async function emergencyLocalReset() {
  console.warn("[ledger] emergency local reset — clearing all local data + pending queue");
  await Promise.all([
    db.transactions.clear(),
    db.categories.clear(),
    db.budgets.clear(),
    db.goals.clear(),
    db.rules.clear(),
    db.pending.clear(),
  ]);
  set({ pending: 0, syncing: false, deadLetters: [] });
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
  } else if (kind === "upsert") {
    // bulk upsert (budgets) — PUT the whole envelope
    await call("PUT", base, payload);
  }
}

/* ============================================================================
 * Destructive: wipe user data.
 *
 * Blows away BOTH the server (via /api/wipe) and the local IndexedDB mirror
 * + the pending-writes queue so there's nothing left to re-sync.
 *
 * Scopes:
 *   "all"                       — everything (nuclear)
 *   "transactions"              — just the ledger
 *   "categories_and_budgets"    — categories + budgets, unlinks txns first
 *   "goals" | "rules"           — one table
 * ==========================================================================*/

export type WipeScope = "all" | "transactions" | "categories_and_budgets" | "goals" | "rules";

export async function wipeUserData(scope: WipeScope): Promise<{
  deleted: { transactions: number; categories: number; budgets: number; rules: number; goals: number };
}> {
  console.warn(`[ledger] wipe: scope=${scope} — destructive op starting`);
  // 1) Server first — if this fails we haven't wrecked the local cache yet.
  const resp = await call<{ scope: string; deleted: any }>(
    "POST", "/api/wipe", { scope, confirm: "WIPE" }
  );

  // 2) Local mirror: drop matching tables.
  const clearLocal = async () => {
    if (scope === "all") {
      await Promise.all([
        db.transactions.clear(), db.categories.clear(), db.budgets.clear(),
        db.rules.clear(), db.goals.clear(), db.pending.clear(),
      ]);
    } else if (scope === "transactions") {
      await db.transactions.clear();
    } else if (scope === "categories_and_budgets") {
      await db.budgets.clear();
      await db.categories.clear();
      // unlink local txns to match server
      const txns = await db.transactions.toArray();
      await db.transactions.bulkPut(txns.map(t => ({ ...t, category_id: null })));
    } else if (scope === "goals") {
      await db.goals.clear();
    } else if (scope === "rules") {
      await db.rules.clear();
    }

    // Drop any queued writes targeting the wiped tables — they're stale now.
    const allPending = await db.pending.toArray();
    const stillRelevant = allPending.filter(p => {
      if (scope === "all") return false;
      if (scope === "transactions") return p.table !== "transactions";
      if (scope === "categories_and_budgets") return p.table !== "categories" && p.table !== "budgets";
      if (scope === "goals") return p.table !== "goals";
      if (scope === "rules") return p.table !== "rules";
      return true;
    });
    const toDrop = allPending.length - stillRelevant.length;
    if (toDrop > 0) {
      await db.pending.clear();
      if (stillRelevant.length) await db.pending.bulkAdd(stillRelevant.map(({ id, ...rest }) => rest as any));
    }
  };
  await clearLocal();

  // 3) Reset dead-letter surface + pending count.
  const n = await db.pending.count();
  set({ pending: n, deadLetters: [] });

  console.info(`[ledger] wipe: done`, resp.deleted);
  return resp as any;
}
