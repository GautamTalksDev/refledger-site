import type { APIRoute } from 'astro';
import { getSiteData, tagFromRef } from '../../../../../../data';
import { buildTag } from '../../../../../../lib/api-v1';

export const prerender = true;

export function getStaticPaths() {
  const data = getSiteData();
  const paths: { params: { owner: string; repo: string; tag: string } }[] = [];
  for (const r of data.repos) {
    const [owner, repo] = r.repo.split('/');
    if (!owner || !repo) continue;
    for (const t of r.tags) {
      paths.push({
        params: { owner, repo, tag: tagFromRef(t.ref) },
      });
    }
  }
  return paths;
}

export const GET: APIRoute = ({ params }) => {
  const tag = buildTag(params.owner!, params.repo!, params.tag!);
  if (!tag) {
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
  }
  return new Response(JSON.stringify(tag), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
