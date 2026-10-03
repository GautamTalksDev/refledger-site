import { describe, expect, it, vi } from "vitest";

import {
  closeIssue,
  commentOnIssue,
  createIssue,
  findWatchdogIssue,
  handleHealthResults,
  ISSUE_TITLE,
  type FetchLike,
  type HealthCheck,
  type Issue,
} from "../src/index";

const TOKEN = "ghp_test_token_never_log_me_abc123";

describe("findWatchdogIssue", () => {
  it("finds an open issue with the watchdog title", async () => {
    const issues: Issue[] = [
      { number: 1, title: "Some other issue", state: "open" },
      { number: 2, title: ISSUE_TITLE, state: "open" },
      { number: 3, title: "Another issue", state: "closed" },
    ];

    const fetchImpl = vi.fn<FetchLike>(async () => ({
      status: 200,
      ok: true,
      json: async () => issues,
    }));

    const result = await findWatchdogIssue(TOKEN, fetchImpl);

    expect(result).toEqual({ number: 2, title: ISSUE_TITLE, state: "open" });
  });

  it("finds a closed watchdog issue", async () => {
    const issues: Issue[] = [
      { number: 1, title: "Some other issue", state: "open" },
      { number: 2, title: ISSUE_TITLE, state: "closed" },
    ];

    const fetchImpl = vi.fn<FetchLike>(async () => ({
      status: 200,
      ok: true,
      json: async () => issues,
    }));

    const result = await findWatchdogIssue(TOKEN, fetchImpl);

    expect(result).toEqual({ number: 2, title: ISSUE_TITLE, state: "closed" });
  });

  it("returns null when no watchdog issue exists", async () => {
    const issues: Issue[] = [
      { number: 1, title: "Some other issue", state: "open" },
    ];

    const fetchImpl = vi.fn<FetchLike>(async () => ({
      status: 200,
      ok: true,
      json: async () => issues,
    }));

    const result = await findWatchdogIssue(TOKEN, fetchImpl);

    expect(result).toBeNull();
  });

  it("returns null on API error", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => ({
      status: 500,
      ok: false,
    }));

    const result = await findWatchdogIssue(TOKEN, fetchImpl);

    expect(result).toBeNull();
  });
});

describe("createIssue", () => {
  it("creates an issue with failed check details", async () => {
    const checks: HealthCheck[] = [
      { name: "data_branch_commit", passed: false, details: "Commit is stale" },
      { name: "newest_head_age", passed: true, details: "Head is fresh" },
    ];

    const fetchImpl = vi.fn<FetchLike>(async () => ({
      status: 201,
      ok: true,
    }));

    const logs: string[] = [];
    await createIssue(TOKEN, fetchImpl, checks, (msg) => logs.push(msg));

    expect(fetchImpl).toHaveBeenCalledOnce();
    const call = fetchImpl.mock.calls[0]!;
    expect(call[0]).toContain("/issues");
    expect(call[1]!.method).toBe("POST");

    const body = JSON.parse(call[1]!.body!);
    expect(body.title).toBe(ISSUE_TITLE);
    expect(body.body).toContain("data_branch_commit");
    expect(body.body).toContain("Commit is stale");
    expect(body.body).not.toContain("Head is fresh");

    expect(logs[0]).toContain("create_issue");
    expect(logs[0]).toContain("status=201");
    expect(logs[0]).toContain("failed_checks=1");
  });

  it("never logs the token", async () => {
    const checks: HealthCheck[] = [
      { name: "test", passed: false, details: "Test failure" },
    ];

    const fetchImpl = vi.fn<FetchLike>(async () => ({
      status: 201,
      ok: true,
    }));

    const logs: string[] = [];
    await createIssue(TOKEN, fetchImpl, checks, (msg) => logs.push(msg));

    const joined = logs.join("\n");
    expect(joined).not.toContain(TOKEN);
    expect(joined.toLowerCase()).not.toContain("authorization");
  });
});

describe("commentOnIssue", () => {
  it("adds a comment with current failures", async () => {
    const checks: HealthCheck[] = [
      { name: "data_branch_commit", passed: false, details: "Still stale" },
      { name: "newest_head_age", passed: true, details: "Fresh" },
    ];

    const fetchImpl = vi.fn<FetchLike>(async () => ({
      status: 201,
      ok: true,
    }));

    const logs: string[] = [];
    await commentOnIssue(TOKEN, fetchImpl, 42, checks, (msg) =>
      logs.push(msg),
    );

    expect(fetchImpl).toHaveBeenCalledOnce();
    const call = fetchImpl.mock.calls[0]!;
    expect(call[0]).toContain("/issues/42/comments");
    expect(call[1]!.method).toBe("POST");

    const body = JSON.parse(call[1]!.body!);
    expect(body.body).toContain("data_branch_commit");
    expect(body.body).toContain("Still stale");
    expect(body.body).not.toContain("Fresh");

    expect(logs[0]).toContain("comment_on_issue");
    expect(logs[0]).toContain("issue=42");
  });
});

describe("closeIssue", () => {
  it("adds a recovery comment and closes the issue", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => ({
      status: 200,
      ok: true,
    }));

    const logs: string[] = [];
    await closeIssue(TOKEN, fetchImpl, 42, (msg) => logs.push(msg));

    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const commentCall = fetchImpl.mock.calls[0]!;
    expect(commentCall[0]).toContain("/issues/42/comments");
    expect(commentCall[1]!.method).toBe("POST");
    const commentBody = JSON.parse(commentCall[1]!.body!);
    expect(commentBody.body).toContain("recovered");

    const closeCall = fetchImpl.mock.calls[1]!;
    expect(closeCall[0]).toContain("/issues/42");
    expect(closeCall[1]!.method).toBe("PATCH");
    const closeBody = JSON.parse(closeCall[1]!.body!);
    expect(closeBody.state).toBe("closed");

    expect(logs[0]).toContain("recovery_comment");
    expect(logs[1]).toContain("close_issue");
  });
});

describe("handleHealthResults", () => {
  it("creates a new issue when checks fail and no issue exists", async () => {
    const checks: HealthCheck[] = [
      { name: "test", passed: false, details: "Failed" },
    ];

    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => [],
      })
      .mockResolvedValueOnce({
        status: 201,
        ok: true,
      });

    const logs: string[] = [];
    await handleHealthResults(TOKEN, fetchImpl, checks, (msg) =>
      logs.push(msg),
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(logs.some((l) => l.includes("status=unhealthy"))).toBe(true);
    expect(logs.some((l) => l.includes("create_issue"))).toBe(true);
  });

  it("comments on existing open issue when checks fail", async () => {
    const checks: HealthCheck[] = [
      { name: "test", passed: false, details: "Failed" },
    ];

    const existingIssue: Issue = {
      number: 42,
      title: ISSUE_TITLE,
      state: "open",
    };

    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => [existingIssue],
      })
      .mockResolvedValueOnce({
        status: 201,
        ok: true,
      });

    const logs: string[] = [];
    await handleHealthResults(TOKEN, fetchImpl, checks, (msg) =>
      logs.push(msg),
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const commentCall = fetchImpl.mock.calls[1]!;
    expect(commentCall[0]).toContain("/issues/42/comments");
    expect(logs.some((l) => l.includes("comment_on_issue"))).toBe(true);
  });

  it("creates a new issue when checks fail and existing issue is closed", async () => {
    const checks: HealthCheck[] = [
      { name: "test", passed: false, details: "Failed" },
    ];

    const existingIssue: Issue = {
      number: 42,
      title: ISSUE_TITLE,
      state: "closed",
    };

    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => [existingIssue],
      })
      .mockResolvedValueOnce({
        status: 201,
        ok: true,
      });

    const logs: string[] = [];
    await handleHealthResults(TOKEN, fetchImpl, checks, (msg) =>
      logs.push(msg),
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const createCall = fetchImpl.mock.calls[1]!;
    expect(createCall[0]).toContain("/issues");
    expect(createCall[0]).not.toContain("/42/");
    expect(logs.some((l) => l.includes("create_issue"))).toBe(true);
  });

  it("closes open issue when all checks pass", async () => {
    const checks: HealthCheck[] = [
      { name: "test1", passed: true, details: "OK" },
      { name: "test2", passed: true, details: "OK" },
    ];

    const existingIssue: Issue = {
      number: 42,
      title: ISSUE_TITLE,
      state: "open",
    };

    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => [existingIssue],
      })
      .mockResolvedValueOnce({
        status: 201,
        ok: true,
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
      });

    const logs: string[] = [];
    await handleHealthResults(TOKEN, fetchImpl, checks, (msg) =>
      logs.push(msg),
    );

    expect(logs.some((l) => l.includes("status=healthy"))).toBe(true);
    expect(logs.some((l) => l.includes("close_issue"))).toBe(true);
  });

  it("does nothing when all checks pass and no issue exists", async () => {
    const checks: HealthCheck[] = [
      { name: "test", passed: true, details: "OK" },
    ];

    const fetchImpl = vi.fn<FetchLike>().mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => [],
    });

    const logs: string[] = [];
    await handleHealthResults(TOKEN, fetchImpl, checks, (msg) =>
      logs.push(msg),
    );

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(logs.some((l) => l.includes("status=healthy"))).toBe(true);
    expect(logs.some((l) => l.includes("create_issue"))).toBe(false);
  });
});
