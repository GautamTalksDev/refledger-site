import { describe, expect, it, vi } from "vitest";

import {
  MAX_REBUILDS_PER_DAY,
  MONTHLY_REBUILD_MATH,
  PAGES_FREE_BUILDS_PER_MONTH,
  REBUILD_CRON,
  decideRebuild,
  memoryStateStore,
  runRebuild,
  type FetchLike,
} from "../src/rebuild";

describe("rebuild schedule constants", () => {
  it("uses an off-minute every 3 hours", () => {
    expect(REBUILD_CRON).toBe("7 */3 * * *");
  });

  it("caps rebuilds at 10 per UTC day", () => {
    expect(MAX_REBUILDS_PER_DAY).toBe(10);
  });

  it("stays under the Pages free monthly build limit", () => {
    expect(PAGES_FREE_BUILDS_PER_MONTH).toBe(500);
    expect(MONTHLY_REBUILD_MATH.cappedMaxPerMonth31).toBe(310);
    expect(MONTHLY_REBUILD_MATH.cappedMaxPerMonth31).toBeLessThan(
      PAGES_FREE_BUILDS_PER_MONTH,
    );
    expect(MONTHLY_REBUILD_MATH.scheduledPerMonth31).toBe(248);
  });
});

describe("decideRebuild", () => {
  const now = new Date("2026-10-03T12:00:00Z");

  it("allows a scheduled rebuild under the daily cap", () => {
    const d = decideRebuild({
      mode: "scheduled",
      state: {
        utcDay: "2026-10-03",
        count: 3,
        lastRebuildAt: "2026-10-03T09:00:00Z",
        lastRebuildHeadAt: "2026-10-02T00:05:00Z",
      },
      now,
      newestHeadAt: "2026-10-02T00:05:00Z",
    });
    expect(d.shouldRebuild).toBe(true);
    expect(d.reason).toBe("scheduled");
  });

  it("skips when the daily cap is reached", () => {
    const d = decideRebuild({
      mode: "scheduled",
      state: {
        utcDay: "2026-10-03",
        count: 10,
        lastRebuildAt: "2026-10-03T11:00:00Z",
        lastRebuildHeadAt: "2026-10-03T00:05:00Z",
      },
      now,
      newestHeadAt: "2026-10-03T00:05:00Z",
    });
    expect(d.shouldRebuild).toBe(false);
    expect(d.skipReason).toMatch(/daily_cap/);
  });

  it("resets the daily count on a new UTC day", () => {
    const d = decideRebuild({
      mode: "scheduled",
      state: {
        utcDay: "2026-10-02",
        count: 10,
        lastRebuildAt: "2026-10-02T23:00:00Z",
        lastRebuildHeadAt: "2026-10-02T00:05:00Z",
      },
      now,
      newestHeadAt: "2026-10-03T00:05:00Z",
    });
    expect(d.shouldRebuild).toBe(true);
    expect(d.nextState.count).toBe(0);
    expect(d.nextState.utcDay).toBe("2026-10-03");
  });

  it("triggers after_seal when newest head is newer than last rebuild", () => {
    const d = decideRebuild({
      mode: "after_seal",
      state: {
        utcDay: "2026-10-03",
        count: 1,
        lastRebuildAt: "2026-10-02T12:00:00Z",
        lastRebuildHeadAt: "2026-10-02T00:05:00Z",
      },
      now,
      newestHeadAt: "2026-10-03T00:05:00Z",
    });
    expect(d.shouldRebuild).toBe(true);
    expect(d.reason).toBe("after_seal");
  });

  it("skips after_seal when the head was already rebuilt", () => {
    const d = decideRebuild({
      mode: "after_seal",
      state: {
        utcDay: "2026-10-03",
        count: 1,
        lastRebuildAt: "2026-10-03T01:00:00Z",
        lastRebuildHeadAt: "2026-10-03T00:05:00Z",
      },
      now,
      newestHeadAt: "2026-10-03T00:05:00Z",
    });
    expect(d.shouldRebuild).toBe(false);
    expect(d.skipReason).toBe("no_new_seal");
  });
});

describe("runRebuild", () => {
  it("POSTs the deploy hook and increments the counter", async () => {
    const store = memoryStateStore({
      utcDay: "2026-10-03",
      count: 2,
      lastRebuildAt: null,
      lastRebuildHeadAt: "2026-10-01T00:00:00Z",
    });
    const logs: string[] = [];
    const fetchImpl = vi.fn<FetchLike>();
    fetchImpl
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        text: async () =>
          JSON.stringify({
            head: { recorded_at: "2026-10-03T00:05:00Z" },
          }),
      })
      .mockResolvedValueOnce({ status: 200, ok: true });

    const decision = await runRebuild({
      mode: "after_seal",
      stateStore: store,
      deployHookUrl: "https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/test",
      fetchImpl,
      headsUrl: "https://example.test/heads.jsonl",
      userAgent: "test",
      now: new Date("2026-10-03T12:00:00Z"),
      log: (m) => logs.push(m),
    });

    expect(decision.shouldRebuild).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1]![1]?.method).toBe("POST");
    const saved = await store.get();
    expect(saved?.count).toBe(3);
    expect(saved?.lastRebuildHeadAt).toBe("2026-10-03T00:05:00Z");
    expect(logs.some((l) => l.includes("rebuild triggered"))).toBe(true);
    expect(logs.join("\n")).not.toContain("deploy_hooks/test");
  });

  it("logs and skips when the daily cap is already hit", async () => {
    const store = memoryStateStore({
      utcDay: "2026-10-03",
      count: 10,
      lastRebuildAt: "2026-10-03T11:00:00Z",
      lastRebuildHeadAt: "2026-10-02T00:00:00Z",
    });
    const logs: string[] = [];
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue({
      status: 200,
      ok: true,
      text: async () =>
        JSON.stringify({ head: { recorded_at: "2026-10-03T00:05:00Z" } }),
    });

    const decision = await runRebuild({
      mode: "scheduled",
      stateStore: store,
      deployHookUrl: "https://example.test/hook",
      fetchImpl,
      headsUrl: "https://example.test/heads.jsonl",
      userAgent: "test",
      now: new Date("2026-10-03T12:00:00Z"),
      log: (m) => logs.push(m),
    });

    expect(decision.shouldRebuild).toBe(false);
    expect(decision.skipReason).toMatch(/daily_cap/);
    // Only heads fetch; no deploy POST.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(logs.some((l) => l.includes("daily_cap"))).toBe(true);
    expect((await store.get())?.count).toBe(10);
  });

  it("skips without a deploy hook URL", async () => {
    const store = memoryStateStore();
    const logs: string[] = [];
    const decision = await runRebuild({
      mode: "scheduled",
      stateStore: store,
      deployHookUrl: undefined,
      fetchImpl: vi.fn(),
      headsUrl: "https://example.test/heads.jsonl",
      userAgent: "test",
      now: new Date("2026-10-03T12:00:00Z"),
      log: (m) => logs.push(m),
    });
    expect(decision.skipReason).toBe("no_hook");
    expect(logs.some((l) => l.includes("rebuild skipped=no_hook"))).toBe(true);
  });
});
