import { getSiteData } from '../data';

export const prerender = true;

export async function GET() {
  const data = getSiteData();
  const events = data.traceEvents.filter((e) => !e.isCanary);
  const site = 'https://refledger.gautamkhosla.com';

  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const items = events
    .map(
      (ev) => `  <item>
    <title>${escape(`${ev.event}: ${ev.repo} ${ev.tag}`)}</title>
    <link>${site}/e/${ev.seq}</link>
    <guid isPermaLink="true">${site}/e/${ev.seq}</guid>
    <pubDate>${new Date(ev.recorded_at).toUTCString()}</pubDate>
    <description>${escape(`Recorded ${ev.event} of ${ev.repo} tag ${ev.tag} at ${ev.recorded_at} (seq ${ev.seq}).`)}</description>
  </item>`,
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>Refledger moved (ecosystem)</title>
  <link>${site}/moved</link>
  <description>Ecosystem tag movements recorded by Refledger. Canary events excluded.</description>
${items}
</channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  });
}
