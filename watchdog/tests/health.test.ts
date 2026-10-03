import { describe, expect, it, vi } from "vitest";

import {
  checkDataBranchCommit,
  checkNewestHeadAge,
  checkWitnessBacklog,
  type FetchLike,
  type RefledgerHead,
} from "../src/index";

const TOKEN = "ghp_test_token_never_log_me_abc123";

describe("checkDataBranchCommit", () => {
  it("passes when commit is fresh", async () => {
    const now = new Date("2026-10-02T12:00:00Z");
    const commitDate = new Date("2026-10-02T11:50:00Z"); // 10 minutes ago

    const fetchImpl = vi.fn<FetchLike>(async () => ({
      status: 200,
      ok: true,
      json: async () => ({
        commit: {
          committer: {
            date: commitDate.toISOString(),
          },
        },
      }),
    }));

    const result = await checkDataBranchCommit(TOKEN, fetchImpl, now);

    expect(result.passed).toBe(true);
    expect(result.name).toBe("data_branch_commit");
    expect(result.details).toContain("fresh");
  });

  it("fails when commit is stale", async () => {
    const now = new Date("2026-10-02T12:00:00Z");
    const commitDate = new Date("2026-10-02T11:00:00Z"); // 60 minutes ago

    const fetchImpl = vi.fn<FetchLike>(async () => ({
      status: 200,
      ok: true,
      json: async () => ({
        commit: {
          committer: {
            date: commitDate.toISOString(),
          },
        },
      }),
    }));

    const result = await checkDataBranchCommit(TOKEN, fetchImpl, now);

    expect(result.passed).toBe(false);
    expect(result.name).toBe("data_branch_commit");
    expect(result.details).toContain("60 minutes old");
    expect(result.details).toContain("threshold: 30 minutes");
  });

  it("fails when API call fails", async () => {
    const now = new Date("2026-10-02T12:00:00Z");

    const fetchImpl = vi.fn<FetchLike>(async () => ({
      status: 404,
      ok: false,
    }));

    const result = await checkDataBranchCommit(TOKEN, fetchImpl, now);

    expect(result.passed).toBe(false);
    expect(result.details).toContain("status 404");
  });

  it("fails on network error", async () => {
    const now = new Date("2026-10-02T12:00:00Z");

    const fetchImpl = vi.fn<FetchLike>(async () => {
      throw new Error("Network timeout");
    });

    const result = await checkDataBranchCommit(TOKEN, fetchImpl, now);

    expect(result.passed).toBe(false);
    expect(result.details).toContain("Network timeout");
  });
});

describe("checkNewestHeadAge", () => {
  it("passes when newest head is fresh", async () => {
    const now = new Date("2026-10-02T12:00:00Z");
    const recordedAt = new Date("2026-10-02T00:00:00Z"); // 12 hours ago

    const head: RefledgerHead = {
      head: {
        recorded_at: recordedAt.toISOString(),
        seq: 42,
      },
    };

    const fetchImpl = vi.fn<FetchLike>(async () => ({
      status: 200,
      ok: true,
      text: async () => JSON.stringify(head),
    }));

    const result = await checkNewestHeadAge(TOKEN, fetchImpl, now);

    expect(result.passed).toBe(true);
    expect(result.name).toBe("newest_head_age");
    expect(result.details).toContain("fresh");
  });

  it("fails when newest head is stale", async () => {
    const now = new Date("2026-10-02T12:00:00Z");
    const recordedAt = new Date("2026-10-01T00:00:00Z"); // 36 hours ago

    const head: RefledgerHead = {
      head: {
        recorded_at: recordedAt.toISOString(),
        seq: 42,
      },
    };

    const fetchImpl = vi.fn<FetchLike>(async () => ({
      status: 200,
      ok: true,
      text: async () => JSON.stringify(head),
    }));

    const result = await checkNewestHeadAge(TOKEN, fetchImpl, now);

    expect(result.passed).toBe(false);
    expect(result.name).toBe("newest_head_age");
    expect(result.details).toContain("36 hours old");
    expect(result.details).toContain("threshold: 26 hours");
  });

  it("handles multiple heads and checks the newest", async () => {
    const now = new Date("2026-10-02T12:00:00Z");

    const head1: RefledgerHead = {
      head: {
        recorded_at: new Date("2026-10-01T00:00:00Z").toISOString(),
        seq: 1,
      },
    };

    const head2: RefledgerHead = {
      head: {
        recorded_at: new Date("2026-10-02T11:00:00Z").toISOString(),
        seq: 2,
      },
    };

    const fetchImpl = vi.fn<FetchLike>(async () => ({
      status: 200,
      ok: true,
      text: async () =>
        `${JSON.stringify(head1)}\n${JSON.stringify(head2)}`,
    }));

    const result = await checkNewestHeadAge(TOKEN, fetchImpl, now);

    expect(result.passed).toBe(true);
    expect(result.details).toContain("1 hours");
  });

  it("fails when heads.jsonl is empty", async () => {
    const now = new Date("2026-10-02T12:00:00Z");

    const fetchImpl = vi.fn<FetchLike>(async () => ({
      status: 200,
      ok: true,
      text: async () => "",
    }));

    const result = await checkNewestHeadAge(TOKEN, fetchImpl, now);

    expect(result.passed).toBe(false);
    expect(result.details).toContain("empty");
  });

  it("fails when fetch fails", async () => {
    const now = new Date("2026-10-02T12:00:00Z");

    const fetchImpl = vi.fn<FetchLike>(async () => ({
      status: 404,
      ok: false,
    }));

    const result = await checkNewestHeadAge(TOKEN, fetchImpl, now);

    expect(result.passed).toBe(false);
    expect(result.details).toContain("status 404");
  });
});

describe("checkWitnessBacklog", () => {
  it("passes when all heads have log_index", async () => {
    const now = new Date("2026-10-02T12:00:00Z");

    const head1: RefledgerHead = {
      head: {
        recorded_at: new Date("2026-09-01T00:00:00Z").toISOString(),
        seq: 1,
      },
      rekor: {
        log_index: 12345,
        integrated_time: 1234567890,
      },
    };

    const head2: RefledgerHead = {
      head: {
        recorded_at: new Date("2026-10-01T00:00:00Z").toISOString(),
        seq: 2,
      },
      rekor: {
        log_index: 12346,
        integrated_time: 1234567891,
      },
    };

    const fetchImpl = vi.fn<FetchLike>(async () => ({
      status: 200,
      ok: true,
      text: async () =>
        `${JSON.stringify(head1)}\n${JSON.stringify(head2)}`,
    }));

    const result = await checkWitnessBacklog(TOKEN, fetchImpl, now);

    expect(result.passed).toBe(true);
    expect(result.name).toBe("witness_backlog");
    expect(result.details).toContain("No heads waiting");
  });

  it("passes when heads without log_index are recent", async () => {
    const now = new Date("2026-10-02T12:00:00Z");

    const head: RefledgerHead = {
      head: {
        recorded_at: new Date("2026-10-02T10:00:00Z").toISOString(),
        seq: 1,
      },
      rekor: {},
    };

    const fetchImpl = vi.fn<FetchLike>(async () => ({
      status: 200,
      ok: true,
      text: async () => JSON.stringify(head),
    }));

    const result = await checkWitnessBacklog(TOKEN, fetchImpl, now);

    expect(result.passed).toBe(true);
  });

  it("fails when heads without log_index are stale", async () => {
    const now = new Date("2026-10-02T12:00:00Z");
    const recordedAt = new Date("2026-09-29T00:00:00Z"); // More than 48 hours

    const head: RefledgerHead = {
      head: {
        recorded_at: recordedAt.toISOString(),
        seq: 1,
      },
      rekor: {},
    };

    const fetchImpl = vi.fn<FetchLike>(async () => ({
      status: 200,
      ok: true,
      text: async () => JSON.stringify(head),
    }));

    const result = await checkWitnessBacklog(TOKEN, fetchImpl, now);

    expect(result.passed).toBe(false);
    expect(result.details).toContain("waiting on Rekor witness");
    expect(result.details).toContain(recordedAt.toISOString());
  });

  it("fails when multiple heads are waiting", async () => {
    const now = new Date("2026-10-02T12:00:00Z");

    const head1: RefledgerHead = {
      head: {
        recorded_at: new Date("2026-09-29T00:00:00Z").toISOString(),
        seq: 1,
      },
      rekor: {
        log_index: null,
      },
    };

    const head2: RefledgerHead = {
      head: {
        recorded_at: new Date("2026-09-28T00:00:00Z").toISOString(),
        seq: 2,
      },
    };

    const fetchImpl = vi.fn<FetchLike>(async () => ({
      status: 200,
      ok: true,
      text: async () =>
        `${JSON.stringify(head1)}\n${JSON.stringify(head2)}`,
    }));

    const result = await checkWitnessBacklog(TOKEN, fetchImpl, now);

    expect(result.passed).toBe(false);
    expect(result.details).toContain("2 head(s)");
  });

  it("treats missing rekor field as no log_index", async () => {
    const now = new Date("2026-10-02T12:00:00Z");

    const head: RefledgerHead = {
      head: {
        recorded_at: new Date("2026-09-28T00:00:00Z").toISOString(),
        seq: 1,
      },
    };

    const fetchImpl = vi.fn<FetchLike>(async () => ({
      status: 200,
      ok: true,
      text: async () => JSON.stringify(head),
    }));

    const result = await checkWitnessBacklog(TOKEN, fetchImpl, now);

    expect(result.passed).toBe(false);
    expect(result.details).toContain("waiting on Rekor witness");
  });
});
