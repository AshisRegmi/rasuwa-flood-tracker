// Live GoN API client. Thin fetch wrapper + pagination; no side effects.
// The portal returns `{ success, data: { items, total, page, limit } }`
// and has open CORS (Access-Control-Allow-Origin: *), so a browser can call it directly.

import { ENDPOINTS, PAGE_LIMIT, REQUEST_TIMEOUT_MS } from './config.js';

async function getJSON(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const body = await res.json();
    if (body && body.success === false) throw new Error(body.message || 'API rejected request');
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPage(url, { page = 1, limit = PAGE_LIMIT, ...extra } = {}) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  for (const [k, v] of Object.entries(extra)) params.set(k, String(v));
  const sep = url.includes('?') ? '&' : '?';
  const body = await getJSON(`${url}${sep}${params.toString()}`);
  const data = body.data || {};
  return {
    items: Array.isArray(data.items) ? data.items : [],
    total: data.total != null ? Number(data.total) : null,
    page: data.page != null ? Number(data.page) : page,
    limit: data.limit != null ? Number(data.limit) : limit,
  };
}

// Fetch every page of an endpoint. onProgress({ fetched, total }) is optional.
export async function fetchAll(url, { limit = PAGE_LIMIT, onProgress } = {}) {
  const out = [];
  let page = 1;
  let total = null;
  for (let guard = 0; guard < 1000; guard += 1) {
    const r = await fetchPage(url, { page, limit });
    if (total === null) total = r.total;
    out.push(...r.items);
    if (onProgress) onProgress({ fetched: out.length, total });
    if (r.items.length === 0) break;
    if (total != null && out.length >= total) break;
    page += 1;
  }
  return { items: out, total: total ?? out.length };
}

export const fetchPersonReports = (opts) => fetchAll(ENDPOINTS.personReports, opts);
export const fetchDeadBodies = (opts) => fetchAll(ENDPOINTS.deadBodies, opts);
export const fetchDonations = (opts) => fetchAll(ENDPOINTS.donations, opts);
export const fetchGovEfforts = (opts) => fetchAll(ENDPOINTS.govEfforts, opts);

export async function fetchStats() {
  const body = await getJSON(ENDPOINTS.stats);
  return body.data || {};
}