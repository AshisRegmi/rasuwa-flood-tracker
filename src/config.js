// Central config — endpoints, constants, feature flags.
// Data source: Government of Nepal OPMCM "Rasuwa Flood Rescue Portal".
// Verified live: JSON, keyless, CORS *, paginated (?page=&limit=).

export const API_BASE = 'https://rescue.opmcm.gov.np/api';

export const ENDPOINTS = {
  personReports: `${API_BASE}/person-reports/`,
  deadBodies: `${API_BASE}/dead-bodies/`,
  donations: `${API_BASE}/donations/`,
  stats: `${API_BASE}/stats/sources`,
  statsOverview: `${API_BASE}/stats`,
  govEfforts: `${API_BASE}/government-efforts/`,
};

// Page size: the GoN API embeds base64 thumbnails per record and streams large
// pages extremely slowly. Found records are small (~650B) → 20/page is fine.
// Lost records carry ~16KB thumbnails → use a smaller page for them.
export const PAGE_LIMIT = 20;
export const LOST_PAGE_LIMIT = 5;

// Per-request timeout so one hung page can never block rendering.
export const REQUEST_TIMEOUT_MS = 30000;

// Background sync caps (the rest remains searchable on the official portal —
// link shown in the Info tab). Lost pages are heavy, so cap lower.
export const MAX_SYNC_LOST = 100;
export const MAX_SYNC_FOUND = 300;

// Foreign-national detection: the person-reports API has no nationality field,
// so we query the API's own full-text search with nationality keywords and
// dedupe by _id. The official country-wise list lives on NDRRMA (linked in-app).
export const FOREIGN_TERMS = [
  'malaysia', 'indian', 'chinese', 'tourist', 'foreign', 'british',
  'american', 'australian', 'kailash',
];

export const EMERGENCY = {
  rescue: '1234', // GoN उद्धार / rescue hotline
  police: '100',
};

export const CACHE_VERSION = 'sahara-v1';
export const SYNC_STALE_MS = 5 * 60 * 1000; // re-sync if cache older than 5 min

// People states derived from type + status.
export const STATE_LOST = 'lost';
export const STATE_FOUND = 'found';
export const STATE_DEAD = 'dead';

// Dead-body identity status.
export const BODY_IDENTIFIED = 'identified';
export const BODY_UNIDENTIFIED = 'unidentified';