import type { APIRoute } from 'astro';
import { getSiteData } from '../../../data';
import {
  buildLedgerLookup,
  toPublicLedgerPayload,
} from '../../../lib/ledger-lookup';
import { agoFrom } from '../../../lib/format';

export const prerender = true;

export const GET: APIRoute = () => {
  const data = getSiteData();
  const nowMs = new Date(data.buildTime).getTime();
  const lookup = buildLedgerLookup(data, nowMs);
  const eco = data.traceEvents.filter((e) => !e.isCanary);
  const latest = eco[0]
    ? {
        repo: eco[0].repo,
        tag: eco[0].tag,
        what: eco[0].whatChanged ?? eco[0].event,
        at: new Date(eco[0].recorded_at).getTime(),
        ago: agoFrom(new Date(eco[0].recorded_at).getTime(), nowMs),
      }
    : null;
  const payload = toPublicLedgerPayload(lookup, latest);
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
