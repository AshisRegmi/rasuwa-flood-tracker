// Pure normalization: raw GoN API records → clean domain model.
// DOM-free and side-effect-free so it runs under node --test.

function clean(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

function normalizeGender(v, { simple = false } = {}) {
  const s = clean(v).toUpperCase();
  if (s === 'MALE' || s === 'M' || s === 'पुरुष') return 'male';
  if (s === 'FEMALE' || s === 'F' || s === 'महिला') return 'female';
  // dead-bodies use 'other' — treat as unknown
  if (simple) return 'unknown';
  return 'unknown';
}

export function normalizePerson(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: clean(raw._id || raw.id),
    name: clean(raw.fullName),
    gender: normalizeGender(raw.gender),
    age: clean(raw.approximateAge),
    location: clean(raw.locationText),
    description: clean(raw.description),
    source: clean(raw.source),
    type: raw.type === 'lost' ? 'lost' : 'found',
    status: raw.status === 'open' ? 'open' : 'resolved',
    images: Array.isArray(raw.images) ? raw.images : [],
    importRef: clean(raw.importRef),
    ndrrmaId: raw.ndrrmaId != null ? Number(raw.ndrrmaId) : null,
    createdAt: raw.createdAt ? new Date(raw.createdAt).getTime() : null,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt).getTime() : null,
  };
}

export function normalizeDeadBody(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: raw.id != null ? Number(raw.id) : null,
    refNo: clean(raw.ref_no),
    gender: normalizeGender(raw.gender, { simple: true }),
    age: raw.approx_age != null ? clean(raw.approx_age) : '',
    status: raw.status === 'identified' ? 'identified' : 'unidentified',
    identifiedName: clean(raw.identified_name),
    location: clean(raw.found_location),
    district: clean(raw.district),
    foundDate: raw.found_date ? new Date(raw.found_date).getTime() : null,
    description: clean(raw.description),
    hasPhoto: Boolean(raw.has_photo),
    keptAt: clean(raw.kept_at),
    station: clean(raw.station),
    sourceUrl: clean(raw.source_url),
  };
}

export function normalizeDonation(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: clean(raw._id || raw.id),
    title: clean(raw.title),
    organization: clean(raw.organization),
    description: clean(raw.description),
    bankName: clean(raw.bankName),
    accountName: clean(raw.accountName),
    accountNumber: clean(raw.accountNumber),
    branch: clean(raw.branch),
    swiftCode: clean(raw.swiftCode),
    walletName: clean(raw.walletName),
    walletId: clean(raw.walletId),
    contactPhone: clean(raw.contactPhone),
    qrImage: clean(raw.qrImage),
    priority: raw.priority != null ? Number(raw.priority) : null,
    isActive: raw.isActive !== false,
  };
}

export function normalizeList(list, fn) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    const n = fn(item);
    if (n) out.push(n);
  }
  return out;
}

export const normalizePersons = (list) => normalizeList(list, normalizePerson);
export const normalizeDeadBodies = (list) => normalizeList(list, normalizeDeadBody);
export const normalizeDonations = (list) => normalizeList(list, normalizeDonation);