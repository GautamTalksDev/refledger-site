/**
 * Pages rebuild scheduling: every 3 hours, after a new seal, max 10/day.
 */

export const REBUILD_CRON = "7 */3 * * *";
export const MAX_REBUILDS_PER_DAY = 10;

/** Cloudflare Pages Free plan: 500 builds per month (account-wide). */
export const PAGES_FREE_BUILDS_PER_MONTH = 500;

/**
 * Monthly arithmetic for the README.
 * Scheduled: 8 times/day × 31 days = 248.
 * Seal extras: about 1/day × 31 = 31.
 * Hard cap: 10/day × 31 = 310 (still under 500).
 */
export const MONTHLY_REBUILD_MATH = {
  scheduledPerDay: 8,
  scheduledPerMonth31: 8 * 31,
  sealExtrasPerMonth31: 31,
  cappedMaxPerMonth31: MAX_REBUILDS_PER_DAY * 31,
  pagesFreeLimit: PAGES_FREE_BUILDS_PER_MONTH,
} as const;

export interface RebuildState {
  /** UTC calendar day YYYY-MM-DD */
  utcDay: string;
  count: number;
  lastRebuildAt: string | null;
  /** Newest head.recorded_at observed at last successful rebuild trigger. */
  lastRebuildHeadAt: string | null;
}

export interface StateStore {
  get(): Promise<RebuildState | null>;
  put(state: RebuildState): Promise<void>;
}

export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{ status: number; ok: boolean; text?: () => Promise<string> }>;

export type LogFn = (message: string) => void;

export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function emptyState(now: Date): RebuildState {
  return {
    utcDay: utcDay(now),
    count: 0,
    lastRebuildAt: null,
    lastRebuildHeadAt: null,
  };
}

/** Roll the day counter when the UTC day changes. */
export function normalizeState(state: RebuildState | null, now: Date): RebuildState {
  const day = utcDay(now);
  if (!state || state.utcDay !== day) {
    return {
      utcDay: day,
      count: 0,
      lastRebuildAt: state?.lastRebuildAt ?? null,
      lastRebuildHeadAt: state?.lastRebuildHeadAt ?? null,
    };
  }
  return state;
}

export type RebuildReason = "scheduled" | "after_seal";

export interface RebuildDecision {
  shouldRebuild: boolean;
  reason?: RebuildReason;
  skipReason?: string;
  nextState: RebuildState;
  newestHeadAt?: string;
}

/**
 * Decide whether to fire a deploy hook.
 * - scheduled: always try (subject to daily cap)
 * - after_seal: only if newest head.recorded_at is newer than lastRebuildHeadAt
 */
export function decideRebuild(opts: {
  mode: RebuildReason;
  state: RebuildState | null;
  now: Date;
  newestHeadAt: string | null;
}): RebuildDecision {
  const next = normalizeState(opts.state, opts.now);

  if (next.count >= MAX_REBUILDS_PER_DAY) {
    return {
      shouldRebuild: false,
      skipReason: `daily_cap count=${next.count} max=${MAX_REBUILDS_PER_DAY}`,
      nextState: next,
      newestHeadAt: opts.newestHeadAt ?? undefined,
    };
  }

  if (opts.mode === "after_seal") {
    if (!opts.newestHeadAt) {
      return {
        shouldRebuild: false,
        skipReason: "no_newest_head",
        nextState: next,
      };
    }
    const last = next.lastRebuildHeadAt;
    if (last && opts.newestHeadAt <= last) {
      return {
        shouldRebuild: false,
        skipReason: "no_new_seal",
        nextState: next,
        newestHeadAt: opts.newestHeadAt,
      };
    }
    return {
      shouldRebuild: true,
      reason: "after_seal",
      nextState: next,
      newestHeadAt: opts.newestHeadAt,
    };
  }

  // scheduled
  return {
    shouldRebuild: true,
    reason: "scheduled",
    nextState: next,
    newestHeadAt: opts.newestHeadAt ?? undefined,
  };
}

export async function fetchNewestHeadAt(
  fetchImpl: FetchLike,
  headsUrl: string,
  userAgent: string,
): Promise<string | null> {
  const res = await fetchImpl(headsUrl, {
    headers: { "User-Agent": userAgent },
  });
  if (!res.ok || !res.text) return null;
  const text = await res.text();
  const lines = text.trim().split("\n").filter(Boolean);
  if (!lines.length) return null;
  try {
    const head = JSON.parse(lines[lines.length - 1]!) as {
      head?: { recorded_at?: string };
    };
    return head.head?.recorded_at ?? null;
  } catch {
    return null;
  }
}

/** POST the Pages deploy hook. Never log the URL. */
export async function triggerDeployHook(
  deployHookUrl: string,
  fetchImpl: FetchLike,
  log: LogFn,
): Promise<boolean> {
  try {
    const res = await fetchImpl(deployHookUrl, { method: "POST" });
    log(`deploy_hook status=${res.status} ok=${res.ok}`);
    return res.ok || res.status === 200 || res.status === 201 || res.status === 204;
  } catch (err) {
    log(
      `deploy_hook network_error message=${err instanceof Error ? err.message : "unknown"}`,
    );
    return false;
  }
}

/**
 * Run rebuild decision + optional hook. Updates state only on successful trigger.
 */
export async function runRebuild(opts: {
  mode: RebuildReason;
  stateStore: StateStore;
  deployHookUrl: string | undefined;
  fetchImpl: FetchLike;
  headsUrl: string;
  userAgent: string;
  now: Date;
  log: LogFn;
}): Promise<RebuildDecision> {
  if (!opts.deployHookUrl) {
    const next = normalizeState(await opts.stateStore.get(), opts.now);
    opts.log("rebuild skipped=no_deploy_hook");
    return {
      shouldRebuild: false,
      skipReason: "no_deploy_hook",
      nextState: next,
    };
  }

  const newestHeadAt = await fetchNewestHeadAt(
    opts.fetchImpl,
    opts.headsUrl,
    opts.userAgent,
  );
  const current = await opts.stateStore.get();
  const decision = decideRebuild({
    mode: opts.mode,
    state: current,
    now: opts.now,
    newestHeadAt,
  });

  if (!decision.shouldRebuild) {
    opts.log(
      `rebuild skipped=${decision.skipReason ?? "unknown"} mode=${opts.mode}`,
    );
    return decision;
  }

  const ok = await triggerDeployHook(
    opts.deployHookUrl,
    opts.fetchImpl,
    opts.log,
  );
  if (!ok) {
    opts.log(`rebuild failed mode=${decision.reason}`);
    return { ...decision, shouldRebuild: false, skipReason: "hook_failed" };
  }

  const updated: RebuildState = {
    ...decision.nextState,
    count: decision.nextState.count + 1,
    lastRebuildAt: opts.now.toISOString(),
    lastRebuildHeadAt:
      decision.newestHeadAt ?? decision.nextState.lastRebuildHeadAt,
  };
  await opts.stateStore.put(updated);
  opts.log(
    `rebuild triggered mode=${decision.reason} count=${updated.count}/${MAX_REBUILDS_PER_DAY}`,
  );
  return { ...decision, nextState: updated };
}

export function kvStateStore(kv: {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string) => Promise<void>;
}): StateStore {
  const KEY = "rebuild_state_v1";
  return {
    async get() {
      const raw = await kv.get(KEY);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as RebuildState;
      } catch {
        return null;
      }
    },
    async put(state) {
      await kv.put(KEY, JSON.stringify(state));
    },
  };
}

export function memoryStateStore(initial: RebuildState | null = null): StateStore {
  let state = initial;
  return {
    async get() {
      return state;
    },
    async put(next) {
      state = next;
    },
  };
}
