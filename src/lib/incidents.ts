/**
 * Human incident summaries authored in the refledger repo
 * (docs/incident-summaries.md). Technical notes are a small markdown
 * subset: paragraphs and inline code. HTML in the source is escaped.
 */

export type IncidentSummary = {
  id: string;
  when: string;
  title: string;
  happened: string;
  effect: string;
  changed: string;
  technical: string;
};

function section(body: string, name: string): string {
  const re = new RegExp(`### ${name}\\n+([\\s\\S]*?)(?=\\n### |$)`);
  const m = body.match(re);
  return (m?.[1] ?? '').trim();
}

export function parseIncidentSummaries(md: string): IncidentSummary[] {
  const parts = md.replace(/\r\n/g, '\n').split(/^## /m).slice(1);
  const out: IncidentSummary[] = [];
  for (const part of parts) {
    const nl = part.indexOf('\n');
    const id = (nl === -1 ? part : part.slice(0, nl)).trim();
    const body = nl === -1 ? '' : part.slice(nl + 1);
    const row: IncidentSummary = {
      id,
      when: section(body, 'When'),
      title: section(body, 'Title'),
      happened: section(body, 'What happened'),
      effect: section(body, 'Effect'),
      changed: section(body, 'What changed'),
      technical: section(body, 'Technical details'),
    };
    if (row.id && row.title) out.push(row);
  }
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Paragraphs and `code` spans only. Everything else is text. */
export function renderPlainMarkdown(src: string): string {
  const escaped = escapeHtml(src.trim());
  const withCode = escaped.replace(
    /`([^`]+)`/g,
    '<code class="mono">$1</code>',
  );
  const blocks = withCode.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((b) => `<p>${b.replace(/\n/g, ' ')}</p>`).join('');
}
