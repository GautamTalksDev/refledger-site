import { describe, expect, it, vi } from "vitest";

import {
  OPERATIONS_CONTACT,
  REBUILD_CRON,
  USER_AGENT,
  WATCHDOG_CRON,
  handleScheduled,
  type Env,
  type FetchLike,
} from "../src/index";

const TOKEN = "ghp_test_token_never_log_me_abc123";

describe("constants", () => {
  it("defines WATCHDOG_CRON as every 15 minutes", () => {
    expect(WATCHDOG_CRON).toBe("*/15 * * * *");
  });

  it("includes OPERATIONS_CONTACT in USER_AGENT", () => {
    expect(USER_AGENT).toContain(OPERATIONS_CONTACT);
    expect(USER_AGENT).toContain("refledger-watchdog");
  });
});

describe("scheduled handler", () => {
  it("runs health checks and logs results", async () => {
    const now = new Date("2026-10-02T12:00:00Z");

    const fetchImpl = vi.fn<FetchLike>();
    fetchImpl
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({
          commit: {
            committer: {
              date: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        text: async () =>
          JSON.stringify({
            head: {
              recorded_at: new Date(
                now.getTime() - 10 * 60 * 60 * 1000,
              ).toISOString(),
            },
          }),
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        text: async () =>
          JSON.stringify({
            head: {
              recorded_at: new Date(
                now.getTime() - 10 * 60 * 60 * 1000,
              ).toISOString(),
            },
            rekor: { log_index: 12345 },
          }),
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => [],
      });

    const original = globalThis.fetch;
    (globalThis as { fetch: FetchLike }).fetch = fetchImpl;

    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((m: string) => {
      logs.push(String(m));
    });

    const originalDate = globalThis.Date;
    (globalThis as { Date: typeof Date }).Date = class extends originalDate {
      constructor() {
        super();
        return now;
      }
    } as typeof Date;

    try {
      const mod = await import("../src/index");
      await mod.default.scheduled(
        {
          cron: WATCHDOG_CRON,
          scheduledTime: now.getTime(),
          noRetry() {},
        } as ScheduledController,
        { GITHUB_TOKEN: TOKEN },
        {} as ExecutionContext,
      );

      expect(logs.some((l) => l.includes("health_check"))).toBe(true);
      // No STATE binding: rebuild refused; health still ran.
      expect(logs.some((l) => l.includes("rebuild skipped=no_state"))).toBe(
        true,
      );
    } finally {
      globalThis.fetch = original;
      globalThis.Date = originalDate;
      logSpy.mockRestore();
    }
  });

  it("skips rebuild with no_hook when STATE is bound but DEPLOY_HOOK_URL is absent", async () => {
    const logs: string[] = [];
    const kv = new Map<string, string>();
    const env: Env = {
      GITHUB_TOKEN: TOKEN,
      STATE: {
        get: async (key) => kv.get(key) ?? null,
        put: async (key, value) => {
          kv.set(key, value);
        },
      },
    };
    await handleScheduled(
      { cron: REBUILD_CRON },
      env,
      vi.fn(),
      (m) => logs.push(m),
      new Date("2026-10-03T12:00:00Z"),
    );
    expect(logs.some((l) => l.includes("rebuild skipped=no_hook"))).toBe(true);
    expect(logs.some((l) => l.includes("no_state"))).toBe(false);
  });

  it("never logs the GitHub token", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue({
      status: 500,
      ok: false,
    });

    const original = globalThis.fetch;
    (globalThis as { fetch: FetchLike }).fetch = fetchImpl;

    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((m: string) => {
      logs.push(String(m));
    });

    try {
      const mod = await import("../src/index");
      await mod.default.scheduled(
        {
          cron: WATCHDOG_CRON,
          scheduledTime: Date.now(),
          noRetry() {},
        } as ScheduledController,
        { GITHUB_TOKEN: TOKEN },
        {} as ExecutionContext,
      );
    } finally {
      globalThis.fetch = original;
      logSpy.mockRestore();
    }

    const joined = logs.join("\n");
    expect(joined).not.toContain(TOKEN);
    expect(joined.toLowerCase()).not.toContain("authorization");
    expect(joined.toLowerCase()).not.toContain("bearer");
  });
});

describe("fetch handler", () => {
  it("always returns 404", async () => {
    const mod = await import("../src/index");
    const res = await mod.default.fetch();
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not Found");
  });
});
