import { getSiteData } from '../data';

export const prerender = true;

export async function GET() {
  const data = getSiteData();
  const site = 'https://refledger.gautamkhosla.com';

  const urls = new Set([
    '/',
    '/check',
    '/paste',
    '/moved',
    '/how',
    '/verify',
    '/privacy',
    '/security',
    '/incidents',
  ]);

  for (const r of data.repos) {
    urls.add(`/a/${r.repo}`);
    for (const t of r.tags) {
      const tag = t.ref.startsWith('refs/tags/') ? t.ref.slice(10) : t.ref;
      urls.add(`/a/${r.repo}/${encodeURIComponent(tag)}`);
    }
  }
  for (const e of data.entries) {
    urls.add(`/e/${e.seq}`);
  }

  const body = [...urls]
    .sort()
    .map(
      (u) => `  <url>
    <loc>${site}${u === '/' ? '' : u}</loc>
  </url>`,
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
