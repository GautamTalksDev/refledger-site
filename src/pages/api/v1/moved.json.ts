import type { APIRoute } from 'astro';
import { buildMoved } from '../../../lib/api-v1';

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(JSON.stringify(buildMoved()), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
