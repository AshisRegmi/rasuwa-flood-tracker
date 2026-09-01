// Central config — endpoints, constants, feature flags.
// Data source: Government of Nepal OPMCM "Rasuwa Flood Rescue Portal".
// Verified live: JSON, keyless, CORS *, paginated (?page=&limit=).

export const API_BASE = 'https://rescue.opmcm.gov.np/api';

export const ENDPOINTS = {
  personReports: `${API_BASE}/person-reports/`,
  deadBodies: `${API_BASE}/dead-bodies/`,
  donations: `${API_BASE}/donations/`,
  stats: `${API_BASE}/stats/sources`,
  govEfforts: `${API_BASE}/government-efforts/`,
};

// 500 is the largest page size the portal's own UI requests; API default is 100.
export const PAGE_LIMIT = 500;

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