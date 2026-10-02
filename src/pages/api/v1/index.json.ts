import type { APIRoute } from 'astro';
import { buildIndex } from '../../../lib/api-v1';

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(JSON.stringify(buildIndex()), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
