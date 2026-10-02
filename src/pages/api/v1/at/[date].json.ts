import type { APIRoute } from 'astro';
import { buildAt, listAtDates } from '../../../../lib/api-v1';

export const prerender = true;

export function getStaticPaths() {
  return listAtDates().map((date) => ({ params: { date } }));
}

export const GET: APIRoute = ({ params }) => {
  const snap = buildAt(params.date!);
  return new Response(JSON.stringify(snap), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
