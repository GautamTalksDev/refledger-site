/**
 * Client-side check flow. Mounted on /check and /paste.
 */
import {
  EXAMPLE_FILES,
  EXAMPLE_SHAS,
  assess,
  assertUniqueRefBudget,
  fixedFiles,
  loadRepo,
  normalizeRepo,
  parseFiles,
  resolveSha,
  type AssessResult,
  type LedgerLookup,
  type WorkflowFile,
  GithubApiError,
} from '../lib/check-workflow';
import { fromPublicLedgerPayload, type PublicLedgerPayload } from '../lib/ledger-lookup';
import { setHTML } from '../lib/trusted-html';
import { LimitError, MAX_WORKFLOW_FILE_BYTES } from '../lib/limits';

type CheckState =
  | { phase: 'scanning'; repo: string; lines: string[] }
  | { phase: 'error'; title: string; body: string }
  | {
      phase: 'done';
      repo: string;
      files: WorkflowFile[];
      results: AssessResult[];
      example: boolean;
      exampleNote: string;
      unresolved: string;
    };

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

function toast(msg: string) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

async function copyText(text: string, okMsg: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMsg);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast(okMsg);
    } catch {
      toast('Select the text and copy it');
    }
    ta.remove();
  }
}

function renderState(root: HTMLElement, st: CheckState) {
  if (st.phase === 'scanning') {
    setHTML(
      root,
      `<div class="wrap narrow u-0b79e164" aria-live="polite">
      <h1 class="h2" tabindex="-1">Checking <span class="mono u-96d56823">${esc(st.repo)}</span></h1>
      <ol class="scan ins">${st.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ol>
    </div>`,
    );
    root.querySelector('h1')?.focus({ preventScroll: true });
    return;
  }
  if (st.phase === 'error') {
    setHTML(
      root,
      `<div class="wrap narrow u-8692f6fe">
      <h1 class="h2" tabindex="-1">${esc(st.title)}</h1>
      <p class="lede u-86de7ac6">${esc(st.body)}</p>
      <div class="row u-583f758b">
        <a href="/" class="btn b-blue">Try another repository</a>
        <a href="/paste" class="btn b-line">Paste a workflow instead</a>
      </div>
    </div>`,
    );
    root.querySelector('h1')?.focus({ preventScroll: true });
    return;
  }

  const res = st.results.filter((r) => r.item.kind !== 'local');
  const risky = res.filter((r) =>
    ['tag', 'branch', 'short'].includes(r.item.kind),
  ).length;
  const fixable = st.results.filter((r) => r.fix).length;
  let head: string;
  if (res.length === 0) head = "We didn't find any actions to check.";
  else if (risky === 0 && fixable === 0)
    head = `All ${res.length} of your actions are pinned. Nothing can change under you.`;
  else if (risky === 0)
    head =
      'Your actions are pinned, but ' +
      fixable +
      (fixable === 1 ? ' comment is' : ' comments are') +
      ' wrong.';
  else
    head = `${risky} of your ${res.length} actions can change without you knowing.`;
  const sub = fixable
    ? 'One copy fixes what we can: each action pinned to the exact code it runs today, with a comment saying which version that is.' +
      (st.results.some((r) => r.item.kind === 'branch' && !r.fix)
        ? ' Branches are your call.'
        : '')
    : 'Nothing for us to fix here.';

  let html = `<div class="wrap narrow u-ed929bb2">
    <div class="row u-a562f4fd"><span class="mono u-b02037ec">${esc(st.repo)}</span><span class="row">${st.example ? `<span class="pill">${esc(st.exampleNote || 'Example')}</span>` : ''}<a href="/" class="btn b-line small">Check another</a></span></div>
    <h1 class="h2 rise u-583f758b" tabindex="-1">${esc(head)}</h1>
    <p class="lede u-89aac90e">${esc(sub)}</p>`;
  if (fixable)
    html += `<div class="row u-583f758b"><button type="button" class="btn b-blue u-14ea7ed7" data-act="copyfixed">Copy the fixed workflows</button><span class="ins muted u-433de30b">${fixable}${fixable === 1 ? ' line changes' : ' lines change'}. Nothing else is touched.</span></div>`;
  if (st.unresolved)
    html += `<p class="ins u-81c4b3d7">${esc(st.unresolved)}</p>`;
  html += `<ol class="u-1f6a69df">`;
  for (const r of st.results) {
    html += `<li class="paper result${r.attn ? ' attn' : ''}">
      <div class="row u-e590e28c"><span class="mono u-910cb782">${esc(r.item.spec)}${r.item.comment ? ` <span class="u-3bcc9f3f"># ${esc(r.item.comment)}</span>` : ''}</span><span class="lbl">${esc(r.item.file)}, line ${r.item.line}</span></div>
      <div class="status-line${r.attn ? ' attn' : ''}">${esc(r.status)}</div>
      <p class="u-f396cd67">${esc(r.detail)}</p>
      ${r.fix ? `<div class="code u-d6f2af6e">uses: ${esc(r.fix)}</div>` : ''}
      ${r.link ? `<a class="u-8e937ccd" href="${r.link.href}">${esc(r.link.text)}</a>` : ''}
    </li>`;
  }
  html += `</ol>
    <div class="night u-91fbfd74"><div class="row u-8083fa74"><div class="u-765d57b5"><h2 class="h3 u-aa546bcc">Want to know if one of these moves?</h2><p class="u-83403a04">We check every watched action every five minutes, and publish every move.</p></div><a href="/moved" class="btn b-light">Follow what moves</a></div></div>
    <p class="lbl u-a26bda7d">We describe what moved and when. Whether to trust an action is your call.</p></div>`;
  setHTML(root, html);
  root.querySelector('h1')?.focus({ preventScroll: true });

  root.querySelector('[data-act="copyfixed"]')?.addEventListener('click', () => {
    const files = fixedFiles(st.files, st.results).filter((f) => f.changed);
    void copyText(
      files.map((f) => `# ${f.name}\n${f.text}`).join('\n\n'),
      'Copied. Paste over your workflow files.',
    );
  });
}

export async function runCheck(
  root: HTMLElement,
  source: {
    repo?: string;
    files?: WorkflowFile[];
    example?: boolean;
    exampleNote?: string;
  },
  ledger: LedgerLookup,
) {
  let state: CheckState = {
    phase: 'scanning',
    repo: source.repo || 'Pasted workflow',
    lines: [],
  };
  const say = (l: string) => {
    if (state.phase !== 'scanning') return;
    state.lines.push(l);
    renderState(root, state);
  };

  const finish = (
    files: WorkflowFile[],
    items: ReturnType<typeof parseFiles>,
    shaOf: (it: (typeof items)[0]) => string | null,
    isExample: boolean,
    note: string,
    repoName: string,
  ) => {
    say(
      `Found ${items.filter((i) => i.kind !== 'local').length} actions in ${files.length}${files.length === 1 ? ' file' : ' files'}`,
    );
    say('Checking each one against the ledger');
    const results = items.map((it) => assess(it, shaOf(it), ledger));
    const unresolved = items.filter(
      (it) =>
        ['tag', 'branch', 'short'].includes(it.kind) && !shaOf(it),
    ).length;
    state = {
      phase: 'done',
      repo: repoName,
      files,
      results,
      example: isExample,
      exampleNote: note,
      unresolved: unresolved
        ? `${unresolved}${unresolved === 1 ? ' action' : ' actions'} could not be resolved to a commit right now, so ${unresolved === 1 ? 'it has' : 'they have'} no fix line yet.`
        : '',
    };
    renderState(root, state);
  };

  if (source.example) {
    say('Reading the example workflows');
    const files = EXAMPLE_FILES;
    const items = parseFiles(files);
    await new Promise((r) => setTimeout(r, 400));
    finish(
      files,
      items,
      (it) => EXAMPLE_SHAS[`${it.key}@${it.ref}`] || null,
      true,
      source.exampleNote || 'Example',
      'acme/web-app',
    );
    return;
  }

  const failLimit = (err: LimitError) => {
    state = {
      phase: 'error',
      title: 'That input is too large for a browser check.',
      body: err.message,
    };
    renderState(root, state);
  };

  if (source.files) {
    try {
      for (const f of source.files) {
        if (f.text.length > MAX_WORKFLOW_FILE_BYTES) {
          throw new LimitError(
            'paste_too_large',
            'That paste is larger than 512 KiB. Paste a shorter workflow, or only the jobs that use actions.',
          );
        }
      }
      say('Reading your workflow');
      const items = parseFiles(source.files);
      assertUniqueRefBudget(items);
      const need = items.filter((i) =>
        ['tag', 'branch', 'short'].includes(i.kind),
      );
      const uniq: Record<string, (typeof items)[0]> = {};
      for (const i of need) uniq[`${i.key}@${i.ref}`] = i;
      const keys = Object.keys(uniq);
      say(`Resolving ${keys.length} tags to their commits`);
      const shas: Record<string, string> = {};
      await Promise.all(
        keys.map((k) =>
          resolveSha(uniq[k])
            .then((s) => {
              shas[k] = s;
            })
            .catch(() => {}),
        ),
      );
      finish(
        source.files,
        items,
        (it) => shas[`${it.key}@${it.ref}`] || null,
        false,
        '',
        'Pasted workflow',
      );
    } catch (err) {
      if (err instanceof LimitError) {
        failLimit(err);
        return;
      }
      throw err;
    }
    return;
  }

  const repo = normalizeRepo(source.repo || '');
  if (!repo) {
    state = {
      phase: 'error',
      title: "That doesn't look like a repository.",
      body: 'Use the owner and name, like actions/checkout or your-org/your-repo.',
    };
    renderState(root, state);
    return;
  }
  state.repo = repo;
  renderState(root, state);
  say('Reading .github/workflows');
  try {
    const files = await loadRepo(repo);
    if (!files.length) {
      state = {
        phase: 'error',
        title: 'No workflows found.',
        body: `${repo} has no files in .github/workflows, so there is nothing to check.`,
      };
      renderState(root, state);
      return;
    }
    say(`Found ${files.map((f) => f.name).join(', ')}`);
    const items = parseFiles(files);
    assertUniqueRefBudget(items);
    const need = items.filter((i) =>
      ['tag', 'branch', 'short'].includes(i.kind),
    );
    const uniq: Record<string, (typeof items)[0]> = {};
    for (const i of need) uniq[`${i.key}@${i.ref}`] = i;
    const keys = Object.keys(uniq);
    say(`Resolving ${keys.length}${keys.length === 1 ? ' tag' : ' tags'} to their commits`);
    const shas: Record<string, string> = {};
    await Promise.all(
      keys.map((k) =>
        resolveSha(uniq[k])
          .then((s) => {
            shas[k] = s;
          })
          .catch(() => {}),
      ),
    );
    finish(files, items, (it) => shas[`${it.key}@${it.ref}`] || null, false, '', repo);
  } catch (err) {
    if (err instanceof LimitError) {
      failLimit(err);
      return;
    }
    if (err instanceof GithubApiError && err.code === 404) {
      state = {
        phase: 'error',
        title: "We couldn't find that repository.",
        body: 'It needs to be public. For a private repository, paste a workflow file instead.',
      };
      renderState(root, state);
      return;
    }
    if (err instanceof GithubApiError && err.code === 403) {
      state = {
        phase: 'error',
        title: 'GitHub asked us to slow down.',
        body: 'Your browser has used its hourly allowance of GitHub lookups. Try again in a little while, or paste a workflow file instead.',
      };
      renderState(root, state);
      return;
    }
    // Network / CORS failures: fall back to example with note
    await runCheck(
      root,
      {
        example: true,
        exampleNote: 'Example: live lookups are blocked here',
      },
      ledger,
    );
  }
}

export function bootCheckPage(payload: PublicLedgerPayload) {
  const root = document.getElementById('check-root');
  if (!root) return;
  const ledger = fromPublicLedgerPayload(payload);
  const params = new URLSearchParams(location.search);
  if (params.get('example') === '1') {
    void runCheck(root, { example: true }, ledger);
    return;
  }
  const repo = params.get('repo');
  if (repo) {
    void runCheck(root, { repo }, ledger);
    return;
  }
  setHTML(
    root,
    `<div class="wrap narrow u-5edb7037">
    <h1 class="h2" tabindex="-1">Check a repository</h1>
    <p class="lede u-86de7ac6">Enter a public GitHub repository on the home page, or <a href="/paste">paste a workflow</a>.</p>
    <div class="row u-583f758b"><a href="/" class="btn b-blue">Go home</a></div>
  </div>`,
  );
}

export function bootPastePage(payload: PublicLedgerPayload) {
  const form = document.querySelector<HTMLFormElement>('[data-form="paste"]');
  const root = document.getElementById('check-root');
  if (!form || !root) return;
  const ledger = fromPublicLedgerPayload(payload);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const ta = form.querySelector('textarea');
    if (!ta) return;
    form.hidden = true;
    void runCheck(
      root,
      { files: [{ name: 'pasted.yml', text: ta.value }] },
      ledger,
    );
  });
}

export function bootHomePage(payload: PublicLedgerPayload) {
  const form = document.querySelector<HTMLFormElement>('[data-form="check"]');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = form.querySelector('input');
    const v = input?.value.trim();
    if (!v) return;
    location.href = `/check?repo=${encodeURIComponent(v)}`;
  });
  document.querySelector('[data-act="example"]')?.addEventListener('click', () => {
    location.href = '/check?example=1';
  });
  // latest eco move is SSR; payload available if needed later
  void payload;
}
