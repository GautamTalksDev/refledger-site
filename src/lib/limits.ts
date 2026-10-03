/** Hard limits for hostile GitHub / paste input. */

export const MAX_WORKFLOW_FILE_BYTES = 512 * 1024; // 512 KiB per file
export const MAX_WORKFLOW_FILES = 100;
export const MAX_WORKFLOW_LINES = 20_000;
export const MAX_UNIQUE_REFS = 200;
export const FETCH_TIMEOUT_MS = 12_000;
export const PARSE_TIME_BUDGET_MS = 50;

export type LimitCode =
  | 'file_too_large'
  | 'too_many_files'
  | 'too_many_lines'
  | 'too_many_refs'
  | 'fetch_timeout'
  | 'paste_too_large';

export class LimitError extends Error {
  code: LimitCode;
  constructor(code: LimitCode, message: string) {
    super(message);
    this.code = code;
  }
}

export const LIMIT_MESSAGES: Record<LimitCode, string> = {
  file_too_large:
    'One workflow file is larger than 512 KiB. Split it, or paste only the steps that use actions.',
  too_many_files:
    'This repository has more than 100 workflow files. That is past what we will fetch in the browser. Paste the files you care about instead.',
  too_many_lines:
    'A workflow file has more than 20,000 lines. Paste a shorter excerpt that covers the uses: steps.',
  too_many_refs:
    'More than 200 distinct action refs need resolving. Paste a smaller set of workflows, or pin locally first.',
  fetch_timeout:
    'A GitHub request took too long and was cancelled. Try again, or paste the workflow file instead.',
  paste_too_large:
    'That paste is larger than 512 KiB. Paste a shorter workflow, or only the jobs that use actions.',
};
