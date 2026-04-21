"use client";

import { useEffect, useState, useCallback } from "react";
import {
  fetchCategories, fetchTransactions, fetchGoals, fetchRules, fetchBudgets,
  subscribe, initNetwork, drainQueue, clearDeadLetters, type NetState,
} from "@/lib/db/client";

/**
 * Network status hook — subscribe once per component tree.
 * Exposes online/offline state, sync in-progress flag, and pending-queue count.
 */
export function useNetStatus(): NetState {
  const [s, setS] = useState<NetState>({ online: true, syncing: false, pending: 0 });
  useEffect(() => {
    initNetwork();
    return subscribe(setS);
  }, []);
  return s;
}

/** Force-drain the pending-writes queue (e.g. when user taps "retry"). */
export function useDrainQueue() {
  return useCallback(() => drainQueue(), []);
}

/** Dismiss dead-letter errors after surfacing them to the user. */
export function useClearDeadLetters() {
  return useCallback(() => clearDeadLetters(), []);
}

/* ============================================================================
 * Data hooks — all stale-while-revalidate. First render shows cached data
 * (if any), then swaps to fresh when the network call resolves.
 * ==========================================================================*/

type Fetcher<T> = () => Promise<{ data: T; stale: boolean; error?: string }>;

function useResource<T>(fetcher: Fetcher<T>, deps: any[]): {
  data: T | null; loading: boolean; stale: boolean; error: string | null;
  refresh: () => Promise<void>;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetcher();
      setData(r.data);
      setStale(r.stale);
      setError(r.error ?? null);
    } catch (e: any) {
      setError(e?.message || "load_failed");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { load(); }, [load]);

  return { data, loading, stale, error, refresh: load };
}

export function useCategories()   { return useResource(fetchCategories, []); }
export function useGoals()        { return useResource(fetchGoals, []); }
export function useRules()        { return useResource(fetchRules, []); }
export function useBudgets()      { return useResource(fetchBudgets, []); }

export function useTransactions(q: Parameters<typeof fetchTransactions>[0] = {}) {
  const key = JSON.stringify(q);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useResource(() => fetchTransactions(q), [key]);
}
