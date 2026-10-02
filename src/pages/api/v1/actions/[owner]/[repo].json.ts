import type { APIRoute } from 'astro';
import { getSiteData } from '../../../../../data';
import { buildAction } from '../../../../../lib/api-v1';

export const prerender = true;

export function getStaticPaths() {
  const data = getSiteData();
  return data.repos.map((r) => {
    const [owner, repo] = r.repo.split('/');
    return { params: { owner, repo } };
  });
}

export const GET: APIRoute = ({ params }) => {
  const action = buildAction(params.owner!, params.repo!);
  if (!action) {
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
  }
  return new Response(JSON.stringify(action), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
