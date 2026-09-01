import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  normalizePersons,
  normalizeDeadBodies,
  normalizeDeadBody,
  normalizeDonations,
  normalizePerson,
} from '../src/normalize.js';

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name) => JSON.parse(readFileSync(join(here, 'fixtures', name), 'utf-8'));

test('person-reports fixture normalizes to domain model', () => {
  const raw = fx('person-reports.json');
  assert.ok(raw.success);
  assert.ok(Array.isArray(raw.data.items));
  const persons = normalizePersons(raw.data.items);
  assert.ok(persons.length > 0);

  for (const p of persons) {
    assert.equal(typeof p.id, 'string');
    assert.equal(typeof p.name, 'string');
    assert.ok(['male', 'female', 'unknown'].includes(p.gender), `bad gender: ${p.gender}`);
    assert.ok(['lost', 'found'].includes(p.type), `bad type: ${p.type}`);
    assert.ok(['open', 'resolved'].includes(p.status), `bad status: ${p.status}`);
  }

  // type ↔ status consistency as observed in the live API
  const lostOpen = persons.filter((p) => p.type === 'lost' && p.status === 'open').length;
  const foundResolved = persons.filter((p) => p.type === 'found' && p.status === 'resolved').length;
  assert.equal(lostOpen + foundResolved, persons.length);
});

test('normalizePerson handles messy/empty fields defensively', () => {
  const p = normalizePerson({
    _id: 'x1',
    fullName: '  Dharma   Raj  Rimal ',
    gender: '',
    approximateAge: 'Around 50',
    images: null,
    ndrrmaId: '23480',
  });
  assert.equal(p.name, 'Dharma Raj Rimal');
  assert.equal(p.gender, 'unknown');
  assert.equal(p.type, 'found'); // default when type missing
  assert.equal(p.status, 'resolved'); // default when status missing
  assert.deepEqual(p.images, []);
  assert.equal(p.ndrrmaId, 23480);
  assert.equal(normalizePerson(null), null);
});

test('dead-bodies fixture maps identity status and fields', () => {
  const raw = fx('dead-bodies.json');
  const bodies = normalizeDeadBodies(raw.data.items);
  assert.ok(bodies.length > 0);

  const statuses = new Set(bodies.map((b) => b.status));
  for (const s of statuses) assert.ok(['identified', 'unidentified'].includes(s), `bad status: ${s}`);

  for (const b of bodies) {
    assert.equal(typeof b.refNo, 'string');
    assert.ok(['male', 'female', 'unknown'].includes(b.gender));
    if (b.status === 'unidentified') assert.equal(b.identifiedName, '');
  }
});

test("dead-bodies gender 'other' → unknown", () => {
  const raw = fx('dead-bodies.json');
  const body = normalizeDeadBody(raw.data.items[0]);
  assert.equal(body.gender, 'unknown'); // first record's gender is 'other'
});

test('donations fixture maps bank/wallet/QR fields', () => {
  const raw = fx('donations.json');
  const dons = normalizeDonations(raw.data.items);
  assert.ok(dons.length > 0);
  for (const d of dons) {
    assert.equal(typeof d.title, 'string');
    assert.equal(typeof d.qrImage, 'string');
    assert.equal(typeof d.isActive, 'boolean');
  }
  // PMDRF-style record carries account details or a QR image
  const withQr = dons.filter((d) => d.qrImage.startsWith('data:image'));
  assert.ok(withQr.length > 0, 'expected at least one donation with an embedded QR');
});
