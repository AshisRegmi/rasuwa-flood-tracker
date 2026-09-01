import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  countByState,
  countBodiesByStatus,
  filterPersons,
  filterBodies,
  searchPersons,
  searchBodies,
  matchScore,
  suggestMatches,
  formatCount,
  transliterate,
} from '../src/logic.js';

const P = [
  { id: '1', name: 'Dharma Raj Rimal', type: 'lost', status: 'open', gender: 'male', location: 'Nuwakot · Timure', description: '39', source: 'form', age: '39', importRef: '' },
  { id: '2', name: 'Pokchi Maya Tamang', type: 'lost', status: 'open', gender: 'female', location: 'Rasuwa · Timure', description: '', source: 'form', age: '45-50', importRef: '' },
  { id: '3', name: 'मणि तामाङ', type: 'found', status: 'resolved', gender: 'male', location: 'कोलोनी · Rasuwa', description: 'NDRRMA rescued', source: 'ndrrma-rescued', age: '70', importRef: '' },
  { id: '4', name: 'Sudeep Gautam', type: 'lost', status: 'open', gender: 'male', location: 'Kathmandu · Ramche', description: 'bandage on hand', source: 'form', age: 'Around 50', importRef: '' },
];

test('countByState splits lost vs found', () => {
  assert.deepEqual(countByState(P), { lost: 3, found: 1 });
});

test('filterPersons by type / gender / source', () => {
  assert.equal(filterPersons(P, { type: 'lost' }).length, 3);
  assert.equal(filterPersons(P, { gender: 'female' }).length, 1);
  assert.equal(filterPersons(P, { source: 'ndrrma-rescued' }).length, 1);
  assert.equal(filterPersons(P, {}).length, 4);
});

test('filterBodies by status', () => {
  const B = [
    { id: 1, status: 'identified', gender: 'male' },
    { id: 2, status: 'unidentified', gender: 'unknown' },
    { id: 3, status: 'unidentified', gender: 'female' },
  ];
  assert.equal(filterBodies(B, { status: 'identified' }).length, 1);
  assert.equal(filterBodies(B, { status: 'unidentified' }).length, 2);
  assert.equal(filterBodies(B, { gender: 'female' }).length, 1);
  assert.deepEqual(countBodiesByStatus(B), { identified: 1, unidentified: 2 });
});

test('searchPersons matches Latin and Devanagari, cross-script + token-wise', () => {
  assert.equal(searchPersons(P, 'dharma').length, 1);
  assert.equal(searchPersons(P, 'tamang').length, 2); // Latin "Tamang" + transliterated "तामाङ"
  assert.equal(searchPersons(P, 'तामाङ').length, 2); // Devanagari query hits both too
  assert.equal(searchPersons(P, 'timure').length, 2);
  assert.equal(searchPersons(P, 'timure nuwakot').length, 1); // AND semantics
  assert.equal(searchPersons(P, 'zzzzz').length, 0);
  assert.equal(searchPersons(P, '').length, 4); // empty query returns all
});

test('transliterate maps Devanagari to Latin', () => {
  assert.equal(transliterate('मणि तामाङ'), 'mani tamang');
  assert.equal(transliterate('शर्मा'), 'sharma');
  assert.equal(transliterate('ज्ञान'), 'gyan');
});

test('searchBodies searches identifiedName/refNo/location', () => {
  const B = [
    { id: 1, identifiedName: 'Ram Bahadur', refNo: 'DB-1', location: 'नुवाकोट', district: 'नुवाकोट', description: '', station: '' },
    { id: 2, identifiedName: '', refNo: 'DB-2', location: 'रसुवा', district: 'रसुवा', description: '', station: '' },
  ];
  assert.equal(searchBodies(B, 'DB-2').length, 1);
  assert.equal(searchBodies(B, 'रसुवा').length, 1);
  assert.equal(searchBodies(B, 'ram').length, 1);
});

test('matchScore rewards shared name tokens + location', () => {
  const a = { name: 'Dharma Raj Rimal', location: 'Nuwakot Timure' };
  const exact = { name: 'Dharma Raj Rimal', location: 'Nuwakot Timure' };
  const partial = { name: 'Dharma Rimal', location: 'Kathmandu' };
  const none = { name: 'Sita Devi', location: 'Pokhara' };
  assert.ok(matchScore(a, exact) > matchScore(a, partial));
  assert.equal(matchScore(a, none), 0);
});

test('suggestMatches ranks and limits', () => {
  const target = { id: '1', name: 'Dharma Raj Rimal', location: 'Nuwakot Timure' };
  const candidates = [
    { id: 'a', name: 'Dharma Rimal', location: 'Kathmandu' },
    { id: 'b', name: 'Dharma Raj Rimal', location: 'Nuwakot Timure' },
    { id: 'c', name: 'Sita Devi', location: 'Pokhara' },
  ];
  const res = suggestMatches(target, candidates, { minScore: 0.3 });
  assert.equal(res[0].item.id, 'b');
  assert.ok(res.length <= 2);
});

test('formatCount groups thousands', () => {
  assert.equal(formatCount(22714), '22,714');
  assert.equal(formatCount(null), '0');
});
