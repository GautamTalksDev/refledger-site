/**
 * Refledger watchdog: cron-triggered health monitoring.
 * Opens/closes ONE GitHub issue when checks fail/recover.
 * No public HTTP surface.
 */

/** Contact URL promised by OPERATIONS.md §2. */
export const OPERATIONS_CONTACT =
  "https://raw.githubusercontent.com/GautamTalksDev/refledger/main/OPERATIONS.md";

export const USER_AGENT = `refledger-watchdog (+${OPERATIONS_CONTACT})`;

/** Watchdog cadence: every 15 minutes. */
export const WATCHDOG_CRON = "*/15 * * * *";

export {
  REBUILD_CRON,
  MAX_REBUILDS_PER_DAY,
  PAGES_FREE_BUILDS_PER_MONTH,
  MONTHLY_REBUILD_MATH,
  decideRebuild,
  runRebuild,
  memoryStateStore,
  kvStateStore,
  type RebuildState,
  type StateStore,
  type RebuildReason,
} from "./rebuild";

import { REBUILD_CRON, runRebuild, kvStateStore } from "./rebuild";

export const ISSUE_TITLE = "Watchdog: observatory unhealthy";

export const REFLEDGER_REPO_OWNER = "GautamTalksDev";
export const REFLEDGER_REPO_NAME = "refledger";

export const DATA_BRANCH = "data";
export const MAIN_BRANCH = "main";
export const HEADS_PATH = "data/log/heads.jsonl";

export const HEADS_RAW_URL = `https://raw.githubusercontent.com/${REFLEDGER_REPO_OWNER}/${REFLEDGER_REPO_NAME}/${MAIN_BRANCH}/${HEADS_PATH}`;

/** Thresholds */
export const DATA_COMMIT_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
export const HEAD_MAX_AGE_MS = 26 * 60 * 60 * 1000; // 26 hours
export const WITNESS_BACKLOG_MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours

export interface Env {
  GITHUB_TOKEN: string;
  /** Cloudflare Pages deploy hook URL (secret). Absent until the Pages project exists. */
  DEPLOY_HOOK_URL?: string;
  /**
   * Required KV for rebuild counters and after-seal state.
   * Rebuild logic refuses to run without it; health checks still run.
   */
  STATE?: {
    get: (key: string) => Promise<string | null>;
    put: (key: string, value: string) => Promise<void>;
  };
}

export interface RefledgerHead {
  head: {
    recorded_at: string;
    [key: string]: unknown;
  };
  rekor?: {
    log_index?: number | null;
    integrated_time?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface HealthCheck {
  name: string;
  passed: boolean;
  details: string;
}

export interface Issue {
  number: number;
  title: string;
  state: "open" | "closed";
}

export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  status: number;
  ok: boolean;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}>;

export type LogFn = (message: string) => void;

/**
 * Check 1: Data branch commit age
 */
export async function checkDataBranchCommit(
  token: string,
  fetchImpl: FetchLike,
  now: Date,
): Promise<HealthCheck> {
  try {
    const url = `https://api.github.com/repos/${REFLEDGER_REPO_OWNER}/${REFLEDGER_REPO_NAME}/commits/${DATA_BRANCH}`;
    const res = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": USER_AGENT,
      },
    });

    if (!res.ok) {
      return {
        name: "data_branch_commit",
        passed: false,
        details: `Failed to fetch data branch commit (status ${res.status})`,
      };
    }

    const data = (await res.json!()) as {
      commit: { committer: { date: string } };
    };
    const commitDate = new Date(data.commit.committer.date);
    const ageMs = now.getTime() - commitDate.getTime();

    if (ageMs > DATA_COMMIT_MAX_AGE_MS) {
      const ageMinutes = Math.floor(ageMs / 60000);
      return {
        name: "data_branch_commit",
        passed: false,
        details: `Data branch commit is ${ageMinutes} minutes old (threshold: 30 minutes). Last commit: ${commitDate.toISOString()}`,
      };
    }

    return {
      name: "data_branch_commit",
      passed: true,
      details: `Data branch commit is fresh (age: ${Math.floor(ageMs / 60000)} minutes)`,
    };
  } catch (error) {
    return {
      name: "data_branch_commit",
      passed: false,
      details: `Error checking data branch: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Check 2: Newest signed head age
 */
export async function checkNewestHeadAge(
  _token: string,
  fetchImpl: FetchLike,
  now: Date,
): Promise<HealthCheck> {
  try {
    const url = `https://raw.githubusercontent.com/${REFLEDGER_REPO_OWNER}/${REFLEDGER_REPO_NAME}/${MAIN_BRANCH}/${HEADS_PATH}`;
    const res = await fetchImpl(url, {
      headers: {
        "User-Agent": USER_AGENT,
      },
    });

    if (!res.ok) {
      return {
        name: "newest_head_age",
        passed: false,
        details: `Failed to fetch heads.jsonl (status ${res.status})`,
      };
    }

    const text = await res.text!();
    const lines = text.trim().split("\n").filter(Boolean);

    if (lines.length === 0) {
      return {
        name: "newest_head_age",
        passed: false,
        details: "heads.jsonl is empty",
      };
    }

    const lastLine = lines[lines.length - 1];
    const head = JSON.parse(lastLine) as RefledgerHead;
    const recordedAt = new Date(head.head.recorded_at);
    const ageMs = now.getTime() - recordedAt.getTime();

    if (ageMs > HEAD_MAX_AGE_MS) {
      const ageHours = Math.floor(ageMs / 3600000);
      return {
        name: "newest_head_age",
        passed: false,
        details: `Newest head is ${ageHours} hours old (threshold: 26 hours). Recorded at: ${recordedAt.toISOString()}`,
      };
    }

    return {
      name: "newest_head_age",
      passed: true,
      details: `Newest head is fresh (age: ${Math.floor(ageMs / 3600000)} hours)`,
    };
  } catch (error) {
    return {
      name: "newest_head_age",
      passed: false,
      details: `Error checking newest head: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Check 3: Witness backlog
 */
export async function checkWitnessBacklog(
  _token: string,
  fetchImpl: FetchLike,
  now: Date,
): Promise<HealthCheck> {
  try {
    const url = `https://raw.githubusercontent.com/${REFLEDGER_REPO_OWNER}/${REFLEDGER_REPO_NAME}/${MAIN_BRANCH}/${HEADS_PATH}`;
    const res = await fetchImpl(url, {
      headers: {
        "User-Agent": USER_AGENT,
      },
    });

    if (!res.ok) {
      return {
        name: "witness_backlog",
        passed: false,
        details: `Failed to fetch heads.jsonl (status ${res.status})`,
      };
    }

    const text = await res.text!();
    const lines = text.trim().split("\n").filter(Boolean);

    const stalledHeads: Array<{ recorded_at: string; age_hours: number }> = [];

    for (const line of lines) {
      const head = JSON.parse(line) as RefledgerHead;
      const hasLogIndex =
        head.rekor?.log_index !== undefined &&
        head.rekor.log_index !== null;

      if (!hasLogIndex) {
        const recordedAt = new Date(head.head.recorded_at);
        const ageMs = now.getTime() - recordedAt.getTime();

        if (ageMs > WITNESS_BACKLOG_MAX_AGE_MS) {
          stalledHeads.push({
            recorded_at: head.head.recorded_at,
            age_hours: Math.floor(ageMs / 3600000),
          });
        }
      }
    }

    if (stalledHeads.length > 0) {
      const details = stalledHeads
        .map((h) => `${h.recorded_at} (${h.age_hours}h old)`)
        .join(", ");
      return {
        name: "witness_backlog",
        passed: false,
        details: `${stalledHeads.length} head(s) waiting on Rekor witness for more than 48 hours: ${details}`,
      };
    }

    return {
      name: "witness_backlog",
      passed: true,
      details: "No heads waiting on Rekor witness for more than 48 hours",
    };
  } catch (error) {
    return {
      name: "witness_backlog",
      passed: false,
      details: `Error checking witness backlog: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Run all health checks
 */
export async function runHealthChecks(
  token: string,
  fetchImpl: FetchLike,
  now: Date,
): Promise<HealthCheck[]> {
  return Promise.all([
    checkDataBranchCommit(token, fetchImpl, now),
    checkNewestHeadAge(token, fetchImpl, now),
    checkWitnessBacklog(token, fetchImpl, now),
  ]);
}

/**
 * Find the watchdog issue (if it exists)
 */
export async function findWatchdogIssue(
  token: string,
  fetchImpl: FetchLike,
): Promise<Issue | null> {
  try {
    const url = `https://api.github.com/repos/${REFLEDGER_REPO_OWNER}/${REFLEDGER_REPO_NAME}/issues?state=all&per_page=100`;
    const res = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": USER_AGENT,
      },
    });

    if (!res.ok) {
      return null;
    }

    const issues = (await res.json!()) as Issue[];
    return issues.find((issue) => issue.title === ISSUE_TITLE) ?? null;
  } catch {
    return null;
  }
}

/**
 * Create a new issue
 */
export async function createIssue(
  token: string,
  fetchImpl: FetchLike,
  checks: HealthCheck[],
  log: LogFn,
): Promise<void> {
  const failedChecks = checks.filter((c) => !c.passed);
  const body = `The Refledger observatory health checks have failed.

**Failed checks:**
${failedChecks.map((c) => `- **${c.name}**: ${c.details}`).join("\n")}

This issue was automatically opened by the watchdog.`;

  const url = `https://api.github.com/repos/${REFLEDGER_REPO_OWNER}/${REFLEDGER_REPO_NAME}/issues`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": USER_AGENT,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: ISSUE_TITLE,
      body,
    }),
  });

  log(
    `create_issue status=${res.status} failed_checks=${failedChecks.length}`,
  );
}

/**
 * Comment on an existing issue
 */
export async function commentOnIssue(
  token: string,
  fetchImpl: FetchLike,
  issueNumber: number,
  checks: HealthCheck[],
  log: LogFn,
): Promise<void> {
  const failedChecks = checks.filter((c) => !c.passed);
  const body = `Health checks continue to fail:

${failedChecks.map((c) => `- **${c.name}**: ${c.details}`).join("\n")}`;

  const url = `https://api.github.com/repos/${REFLEDGER_REPO_OWNER}/${REFLEDGER_REPO_NAME}/issues/${issueNumber}/comments`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": USER_AGENT,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body }),
  });

  log(`comment_on_issue issue=${issueNumber} status=${res.status}`);
}

/**
 * Close an issue with a recovery comment
 */
export async function closeIssue(
  token: string,
  fetchImpl: FetchLike,
  issueNumber: number,
  log: LogFn,
): Promise<void> {
  const body = "All health checks have recovered. Closing this issue.";

  const commentUrl = `https://api.github.com/repos/${REFLEDGER_REPO_OWNER}/${REFLEDGER_REPO_NAME}/issues/${issueNumber}/comments`;
  const commentRes = await fetchImpl(commentUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": USER_AGENT,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body }),
  });

  log(`recovery_comment issue=${issueNumber} status=${commentRes.status}`);

  const closeUrl = `https://api.github.com/repos/${REFLEDGER_REPO_OWNER}/${REFLEDGER_REPO_NAME}/issues/${issueNumber}`;
  const closeRes = await fetchImpl(closeUrl, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": USER_AGENT,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ state: "closed" }),
  });

  log(`close_issue issue=${issueNumber} status=${closeRes.status}`);
}

/**
 * Handle health check results and manage issues
 */
export async function handleHealthResults(
  token: string,
  fetchImpl: FetchLike,
  checks: HealthCheck[],
  log: LogFn,
): Promise<void> {
  const allPassed = checks.every((c) => c.passed);
  const existingIssue = await findWatchdogIssue(token, fetchImpl);

  if (allPassed) {
    log("health_check status=healthy");
    if (existingIssue && existingIssue.state === "open") {
      await closeIssue(token, fetchImpl, existingIssue.number, log);
    }
  } else {
    const failedChecks = checks.filter((c) => !c.passed);
    log(
      `health_check status=unhealthy failed_checks=${failedChecks.map((c) => c.name).join(",")}`,
    );

    if (!existingIssue) {
      await createIssue(token, fetchImpl, checks, log);
    } else if (existingIssue.state === "open") {
      await commentOnIssue(token, fetchImpl, existingIssue.number, checks, log);
    } else {
      await createIssue(token, fetchImpl, checks, log);
    }
  }
}

/**
 * Rebuilds need persistent STATE. Without KV, skip and leave health alone.
 */
export async function runRebuildIfConfigured(
  mode: "scheduled" | "after_seal",
  env: Env,
  fetchImpl: FetchLike,
  log: LogFn,
  now: Date,
): Promise<void> {
  if (!env.STATE) {
    log(
      "rebuild skipped=no_state reason=STATE_KV_required_for_daily_cap_and_after_seal",
    );
    return;
  }
  await runRebuild({
    mode,
    stateStore: kvStateStore(env.STATE),
    deployHookUrl: env.DEPLOY_HOOK_URL,
    fetchImpl,
    headsUrl: HEADS_RAW_URL,
    userAgent: USER_AGENT,
    now,
    log,
  });
}

export async function handleScheduled(
  controller: { cron: string },
  env: Env,
  fetchImpl: FetchLike,
  log: LogFn,
  now: Date = new Date(),
): Promise<void> {
  if (controller.cron === WATCHDOG_CRON) {
    const checks = await runHealthChecks(env.GITHUB_TOKEN, fetchImpl, now);
    await handleHealthResults(env.GITHUB_TOKEN, fetchImpl, checks, log);
    // After a new daily seal, rebuild the site once (subject to the daily cap).
    await runRebuildIfConfigured("after_seal", env, fetchImpl, log, now);
    return;
  }

  if (controller.cron === REBUILD_CRON) {
    await runRebuildIfConfigured("scheduled", env, fetchImpl, log, now);
    return;
  }

  log(`dispatch unknown_cron=${controller.cron}`);
}

const worker = {
  async scheduled(
    controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    await handleScheduled(
      controller,
      env,
      globalThis.fetch as FetchLike,
      (msg) => console.log(msg),
    );
  },

  async fetch(): Promise<Response> {
    return new Response("Not Found", { status: 404 });
  },
};

export default worker;
