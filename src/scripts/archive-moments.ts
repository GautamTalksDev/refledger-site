/** Ask-the-archive controls on action pages. */

export function bootArchiveMoments(): void {
  const root = document.querySelector('[data-archive-moments]');
  if (!root) return;
  const repo = root.getAttribute('data-repo') || '';
  const tag = root.getAttribute('data-tag') || '';

  root.querySelectorAll('[data-act="moment"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      root.querySelectorAll('[data-act="moment"]').forEach((x) => {
        x.classList.remove('b-ink');
        x.classList.add('b-line');
        x.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('b-ink');
      btn.classList.remove('b-line');
      btn.setAttribute('aria-pressed', 'true');

      const date = btn.getAttribute('data-date') || '';
      const fallbackSha = btn.getAttribute('data-sha') || '';
      const note = btn.getAttribute('data-note') || '';
      const windowNote = btn.getAttribute('data-window') || '';

      let sha = fallbackSha;
      if (date && repo && tag) {
        try {
          const res = await fetch(`/api/v1/at/${date}.json`);
          if (res.ok) {
            const snap = (await res.json()) as {
              bindings?: {
                repo: string;
                tag: string;
                commit_sha?: string | null;
                target_sha?: string | null;
                source?: string;
              }[];
            };
            const b = snap.bindings?.find((x) => x.repo === repo && x.tag === tag);
            if (b && b.source !== 'absent') {
              const full = b.commit_sha || b.target_sha || '';
              sha = full.length >= 7 ? full.slice(0, 7) : full || fallbackSha;
            } else if (b?.source === 'absent') {
              sha = 'absent';
            }
          }
        } catch {
          /* keep precomputed sha */
        }
      }

      const el = document.getElementById('mo-sha');
      if (el) el.textContent = sha;
      const noteEl = document.getElementById('mo-note');
      if (noteEl) noteEl.textContent = note;
      const winEl = document.getElementById('mo-window');
      if (winEl) winEl.textContent = windowNote;
    });
  });
}

bootArchiveMoments();
