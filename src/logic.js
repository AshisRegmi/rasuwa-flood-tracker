// Pure query/derive helpers over the normalized domain model.
// DOM-free; unit-tested under node --test.

// Devanagari → Latin transliteration (lossy, search-oriented). Lets a Latin
// query like "tamang" match a Devanagari record "तामाङ" and vice-versa.
// Devanagari → Latin transliteration (search-oriented). Lets a Latin query
// like "tamang" match a Devanagari record "तामाङ" and vice-versa.
// Consonants carry the implicit schwa 'a'; matras replace it; virama deletes it.
const CONS = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng',
  'च': 'c', 'छ': 'ch', 'ज': 'j', 'झ': 'jh', 'ञ': 'ny',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v',
  'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
};
const VOW = { 'अ': 'a', 'आ': 'a', 'इ': 'i', 'ई': 'i', 'उ': 'u', 'ऊ': 'u', 'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au' };
const MATRA = { 'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au' };
const EXTRA = { 'ं': 'n', 'ँ': 'n', 'ः': 'h' };
const DIGIT = { '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9' };
const VIRAMA = '्';

export function transliterate(s) {
  let out = '';
  let implicit = false; // out currently ends with a consonant's implicit schwa
  for (const ch of String(s || '')) {
    if (CONS[ch] !== undefined) {
      out += CONS[ch] + 'a';
      implicit = true;
    } else if (MATRA[ch] !== undefined) {
      if (implicit) out = out.slice(0, -1);
      out += MATRA[ch];
      implicit = false;
    } else if (VOW[ch] !== undefined) {
      out += VOW[ch];
      implicit = false;
    } else if (EXTRA[ch] !== undefined) {
      out += EXTRA[ch];
      implicit = false;
    } else if (DIGIT[ch] !== undefined) {
      out += DIGIT[ch];
      implicit = false;
    } else if (ch === VIRAMA) {
      if (implicit) out = out.slice(0, -1);
      implicit = false;
    } else {
      out += ch;
      implicit = false;
    }
  }
  if (implicit) out = out.slice(0, -1); // drop trailing schwa
  return out.replace(/jny/g, 'gy'); // ज्ञ → gy
}

function fold(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Script-aware fold: transliterate Devanagari to Latin, strip diacritics, lowercase.
function foldSearch(s) {
  return transliterate(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// ---- counts ---------------------------------------------------------------

export function countByState(persons) {
  let lost = 0;
  let found = 0;
  for (const p of persons) {
    if (p.type === 'lost') lost += 1;
    else found += 1;
  }
  return { lost, found };
}

export function countBodiesByStatus(bodies) {
  let identified = 0;
  let unidentified = 0;
  for (const b of bodies) {
    if (b.status === 'identified') identified += 1;
    else unidentified += 1;
  }
  return { identified, unidentified };
}

// ---- filtering ------------------------------------------------------------

export function filterPersons(persons, { type, gender, source } = {}) {
  return persons.filter((p) => {
    if (type && p.type !== type) return false;
    if (gender && gender !== 'all' && p.gender !== gender) return false;
    if (source && source !== 'all' && p.source !== source) return false;
    return true;
  });
}

export function filterBodies(bodies, { gender, status } = {}) {
  return bodies.filter((b) => {
    if (gender && gender !== 'all' && b.gender !== gender) return false;
    if (status && status !== 'all' && b.status !== status) return false;
    return true;
  });
}

// ---- search ---------------------------------------------------------------
// Token-wise: every token in the query must match somewhere in the record.

export function searchPersons(persons, query) {
  const q = foldSearch(query);
  if (!q) return persons;
  const tokens = q.split(' ');
  return persons.filter((p) => {
    const hay = foldSearch(
      [p.name, p.location, p.description, p.source, p.age, p.importRef].join(' ')
    );
    return tokens.every((tok) => hay.includes(tok));
  });
}

export function searchBodies(bodies, query) {
  const q = foldSearch(query);
  if (!q) return bodies;
  const tokens = q.split(' ');
  return bodies.filter((b) => {
    const hay = foldSearch(
      [b.identifiedName, b.refNo, b.location, b.district, b.description, b.station].join(' ')
    );
    return tokens.every((tok) => hay.includes(tok));
  });
}

// ---- matching (missing ↔ found suggestions) -------------------------------
// Score a candidate "found/person" against a "lost" report for potential reunion.
// Token overlap on name + shared location boost. Returns 0..1.

export function matchScore(a, b) {
  const aTokens = foldSearch(a.name).split(' ').filter(Boolean);
  const bTokens = foldSearch(b.name).split(' ').filter(Boolean);
  if (!aTokens.length || !bTokens.length) return 0;

  const aSet = new Set(aTokens);
  const hits = bTokens.filter((t) => aSet.has(t)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  let score = union ? hits / union : 0;

  if (fold(a.location) && fold(a.location) === fold(b.location)) score = Math.min(1, score + 0.25);
  return Math.round(score * 1000) / 1000;
}

export function suggestMatches(target, candidates, { minScore = 0.5, limit = 5 } = {}) {
  const scored = candidates
    .filter((c) => c !== target)
    .map((c) => ({ item: c, score: matchScore(target, c) }))
    .filter((r) => r.score >= minScore)
    .sort((x, y) => y.score - x.score);
  return scored.slice(0, limit);
}

// ---- formatting ------------------------------------------------------------

export function formatDate(ms, lang = 'en') {
  if (!ms) return '';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(lang === 'ne' ? 'ne-NP' : 'en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

export function formatCount(n) {
  if (n == null) return '0';
  try {
    return Number(n).toLocaleString('en-US');
  } catch {
    return String(n);
  }
}

// Derive the single display state bucket for a person (lost/found).
export function personState(p) {
  return p.type === 'lost' ? 'lost' : 'found';
}