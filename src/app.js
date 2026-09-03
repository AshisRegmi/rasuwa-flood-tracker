// Sahara — app wiring. Pure logic lives in normalize.js / logic.js; this file
// owns DOM rendering, state, events, and the sync lifecycle.

import { ENDPOINTS, EMERGENCY, PAGE_LIMIT } from './config.js';
import { setLang, getLang, t } from './i18n.js';
import {
  normalizePersons,
  normalizeDeadBodies,
  normalizeDonations,
} from './normalize.js';
import {
  countByState,
  countBodiesByStatus,
  filterPersons,
  filterBodies,
  searchPersons,
  searchBodies,
  formatDate,
  formatCount,
} from './logic.js';
import {
  fetchPage,
  fetchDonations,
  fetchStats,
} from './api.js';
import { saveSnapshot, loadSnapshot, savePrefs, loadPrefs } from './store.js';

// ---- helpers ---------------------------------------------------------------

const $ = (sel) => document.querySelector(sel);

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---- state -----------------------------------------------------------------

// How many cards to render at once (lists can reach tens of thousands of records).
const RENDER_STEP = 250;

const ui = {
  tab: 'people',
  peopleState: 'lost',
  deadStatus: 'unidentified', // default to the respectful minimal view
  gender: 'all',
  source: 'all',
  peopleQ: '',
  deadQ: '',
  peopleLimit: RENDER_STEP,
  deadLimit: RENDER_STEP,
};

let snapshot = null; // { persons, bodies, donations, stats, efforts, syncedAt }

// ---- i18n -------------------------------------------------------------------

function applyI18n() {
  document.documentElement.lang = getLang();
  document.querySelectorAll('[data-i18n]').forEach((n) => {
    n.textContent = t(n.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((n) => {
    n.setAttribute('placeholder', t(n.getAttribute('data-i18n-placeholder')));
  });
}

function toggleLang() {
  setLang(getLang() === 'ne' ? 'en' : 'ne');
  savePrefs({ lang: getLang() });
  applyI18n();
  renderAll();
}

// ---- render: stats ----------------------------------------------------------

function renderStats() {
  if (!snapshot) return;
  const { lost, found } = countByState(snapshot.persons);
  const { identified, unidentified } = countBodiesByStatus(snapshot.bodies);
  $('#stat-lost').textContent = formatCount(lost);
  $('#stat-found').textContent = formatCount(found);
  $('#stat-dead').textContent = formatCount(identified + unidentified);
}

// ---- render: people ----------------------------------------------------------

function buildGenderChips() {
  const opts = [
    ['all', t('filterAll')],
    ['male', t('filterMale')],
    ['female', t('filterFemale')],
  ];
  return opts
    .map(
      ([v, lbl]) =>
        `<button class="chip ${ui.gender === v ? 'on' : ''}" data-gender="${v}">${esc(lbl)}</button>`
    )
    .join('');
}

function buildSourceChips() {
  if (!snapshot) return '';
  const counts = new Map();
  for (const p of snapshot.persons) {
    const key = p.source || 'unknown';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (top.length < 2) return '';
  const all = `<button class="chip ${ui.source === 'all' ? 'on' : ''}" data-source="all">${esc(t('filterAll'))}</button>`;
  return (
    all +
    top
      .map(
        ([s]) =>
          `<button class="chip ${ui.source === s ? 'on' : ''}" data-source="${esc(s)}">${esc(s)}</button>`
      )
      .join('')
  );
}

function personCard(p) {
  const badge =
    p.type === 'lost'
      ? `<span class="badge lost">${esc(t('segLost'))}</span>`
      : `<span class="badge found">${esc(t('segFound'))}</span>`;
  const gender =
    p.gender !== 'unknown'
      ? `<span class="badge g">${esc(p.gender === 'male' ? t('genderMale') : t('genderFemale'))}</span>`
      : '';
  const age = p.age ? `<span class="badge g">${esc(t('age'))} ${esc(p.age)}</span>` : '';
  const loc = p.location ? `<div class="loc">${esc(p.location)}</div>` : '';
  const desc = p.description ? `<div class="desc">${esc(p.description)}</div>` : '';
  const src = p.source
    ? `<div class="src">${esc(t('source'))}: ${esc(p.source)} · ${esc(formatDate(p.updatedAt || p.createdAt, getLang()))}</div>`
    : '';
  return `<article class="card">
    <div class="row"><div class="name">${esc(p.name || '—')}</div>${badge}</div>
    <div class="meta">${gender}${age}</div>
    ${loc}${desc}${src}
  </article>`;
}

function renderPeople() {
  if (!snapshot) return;
  const filtered = filterPersons(snapshot.persons, {
    type: ui.peopleState,
    gender: ui.gender,
    source: ui.source,
  });
  const results = searchPersons(filtered, ui.peopleQ);

  $('#chips-people').innerHTML = buildGenderChips();
  $('#chips-people-src').innerHTML = buildSourceChips();

  const list = $('#people-list');
  const empty = $('#people-empty');
  if (results.length === 0) {
    list.innerHTML = '';
    empty.textContent = t(ui.peopleQ ? 'noResults' : 'emptyLost');
    empty.classList.remove('hidden');
    $('#people-more').classList.add('hidden');
  } else {
    empty.classList.add('hidden');
    list.innerHTML = results.slice(0, ui.peopleLimit).map(personCard).join('');
    const more = $('#people-more');
    if (results.length > ui.peopleLimit) {
      more.textContent = `${t('loadMore')} (${formatCount(results.length - ui.peopleLimit)})`;
      more.classList.remove('hidden');
    } else {
      more.classList.add('hidden');
    }
  }
}

// ---- render: deceased --------------------------------------------------------

function bodyCard(b) {
  const id = b.status === 'identified' ? 'id' : 'uid';
  const badge = `<span class="badge ${id}">${esc(t(b.status === 'identified' ? 'filterIdentified' : 'filterUnidentified'))}</span>`;

  if (b.status === 'unidentified') {
    // Respectful minimal view — no physical description.
    const loc = b.location || b.district ? `<div class="loc">${esc([b.district, b.location].filter(Boolean).join(' · '))}</div>` : '';
    const meta = b.foundDate
      ? `<div class="time">${esc(formatDate(b.foundDate, getLang()))}</div>`
      : '';
    return `<article class="card">
      <div class="row"><div class="name">${esc(b.refNo || '—')}</div>${badge}</div>
      ${loc}${meta}
    </article>`;
  }

  const gender =
    b.gender !== 'unknown'
      ? `<span class="badge g">${esc(b.gender === 'male' ? t('genderMale') : t('genderFemale'))}</span>`
      : '';
  const age = b.age ? `<span class="badge g">${esc(t('age'))} ${esc(b.age)}</span>` : '';
  const loc = b.location || b.district ? `<div class="loc">${esc([b.district, b.location].filter(Boolean).join(' · '))}</div>` : '';
  const src = b.sourceUrl ? `<div class="src"><a href="${esc(b.sourceUrl)}" target="_blank" rel="noopener">${esc(t('source'))}</a></div>` : '';
  return `<article class="card">
    <div class="row"><div class="name">${esc(b.identifiedName || b.refNo || '—')}</div>${badge}</div>
    <div class="meta">${gender}${age}</div>
    ${loc}${src}
  </article>`;
}

function renderDead() {
  if (!snapshot) return;
  const filtered = filterBodies(snapshot.bodies, { status: ui.deadStatus });
  const results = searchBodies(filtered, ui.deadQ);
  const list = $('#dead-list');
  const empty = $('#dead-empty');
  if (results.length === 0) {
    list.innerHTML = '';
    empty.textContent = t(ui.deadQ ? 'noResults' : 'emptyDead');
    empty.classList.remove('hidden');
    $('#dead-more').classList.add('hidden');
  } else {
    empty.classList.add('hidden');
    list.innerHTML = results.slice(0, ui.deadLimit).map(bodyCard).join('');
    const more = $('#dead-more');
    if (results.length > ui.deadLimit) {
      more.textContent = `${t('loadMore')} (${formatCount(results.length - ui.deadLimit)})`;
      more.classList.remove('hidden');
    } else {
      more.classList.add('hidden');
    }
  }
}

// ---- render: donate -----------------------------------------------------------

function donateCard(d) {
  const qr = d.qrImage
    ? `<img class="qr" src="${esc(d.qrImage)}" alt="QR" loading="lazy" />`
    : '';
  const rows = [];
  const fields = [
    ['bankName', d.bankName],
    ['accountName', d.accountName],
    ['accountNumber', d.accountNumber],
    ['branch', d.branch],
    ['swiftCode', d.swiftCode],
    ['walletName', d.walletName],
    ['walletId', d.walletId],
  ];
  for (const [key, val] of fields) {
    if (val) rows.push({ key, val });
  }
  const accts = rows
    .map(
      (r) => `<div class="acct"><span class="val">${esc(r.val)}</span>
        <button data-copy="${esc(r.val)}">${esc(t('copyAccount'))}</button></div>`
    )
    .join('');
  const phone = d.contactPhone
    ? `<div class="acct"><span class="val">${esc(d.contactPhone)}</span>
        <a href="tel:${esc(d.contactPhone.replace(/[^0-9+]/g, ''))}" style="text-decoration:none;color:var(--accent);font-weight:700;font-size:12px;">${esc(t('call'))}</a></div>`
    : '';
  const org = d.organization ? `<div class="src">${esc(d.organization)}</div>` : '';
  return `<article class="card">
    <div class="row"><div class="name" style="font-size:15px;">${esc(d.title || '—')}</div></div>
    ${d.description ? `<div class="desc">${esc(d.description)}</div>` : ''}
    ${qr}${accts}${phone}${org}
  </article>`;
}

function renderDonate() {
  if (!snapshot) return;
  const active = snapshot.donations.filter((d) => d.isActive);
  const sorted = [...active].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
  $('#donate-list').innerHTML =
    sorted.map(donateCard).join('') ||
    `<div class="empty">${esc(t('noResults'))}</div>`;
}

// ---- render: info --------------------------------------------------------------

function renderInfo() {
  if (!snapshot) return;
  const persons = snapshot.stats?.persons || [];
  const bodies = snapshot.stats?.bodies;
  const totalPersons = persons.reduce((s, x) => s + (Number(x.count) || 0), 0);

  const rows = persons
    .filter((x) => Number(x.count) > 0)
    .sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0))
    .map((x) => {
      const pct = totalPersons ? ((Number(x.count) || 0) / totalPersons) * 100 : 0;
      return `<div class="src-row"><span>${esc(x.source || '—')}</span>
        <span class="bar"><i style="width:${pct.toFixed(1)}%"></i></span>
        <span class="n">${formatCount(x.count)}</span></div>`;
    })
    .join('');

  const bodyRow = bodies?.count
    ? `<div class="src-row"><span>${esc(bodies.source || t('tabDead'))}</span>
        <span class="bar"></span><span class="n">${formatCount(bodies.count)}</span></div>`
    : '';

  $('#src-list').innerHTML = rows + bodyRow || `<div class="muted">—</div>`;

  const efforts = (snapshot.efforts || [])
    .slice(0, 15)
    .map(
      (e) => `<div class="effort">${e.link ? `<a href="${esc(e.link)}" target="_blank" rel="noopener">${esc(e.title)}</a>` : `<span>${esc(e.title)}</span>`}
        ${e.agency ? `<div class="agency">${esc(e.agency)}</div>` : ''}</div>`
    )
    .join('');
  $('#efforts-list').innerHTML = efforts || `<div class="muted">—</div>`;
}

// ---- render: all ------------------------------------------------------------------

function selectPeople(state) {
  ui.peopleState = state;
  ui.peopleLimit = RENDER_STEP;
  const seg = $('#seg-people');
  if (seg) {
    seg.dataset.idx = state === 'lost' ? '0' : '1';
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.state === state));
  }
  renderPeople();
}

function selectDead(status) {
  ui.deadStatus = status;
  ui.deadLimit = RENDER_STEP;
  const seg = $('#seg-dead');
  if (seg) {
    seg.dataset.idx = status === 'identified' ? '0' : '1';
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.status === status));
  }
  renderDead();
}

function renderAll() {
  renderStats();
  selectPeople(ui.peopleState);
  selectDead(ui.deadStatus);
  renderDonate();
  renderInfo();
}

// Deep links: #found, #lost, #identified, #unidentified, #dead, #donate, #info
function applyHash() {
  const h = (location.hash || '').replace(/^#\/?/, '').toLowerCase();
  if (h === 'found') { switchTab('people'); selectPeople('found'); }
  else if (h === 'lost' || h === 'people') { switchTab('people'); selectPeople('lost'); }
  else if (h === 'identified') { switchTab('dead'); selectDead('identified'); }
  else if (h === 'unidentified') { switchTab('dead'); selectDead('unidentified'); }
  else if (h === 'dead' || h === 'deceased') switchTab('dead');
  else if (h === 'donate') switchTab('donate');
  else if (h === 'info') switchTab('info');
}

// ---- sync --------------------------------------------------------------------------

function setSync(state, label) {
  const el = $('#sync-status');
  el.classList.toggle('offline', state === 'offline');
  $('#sync-label').textContent = label;
}

async function sync() {
  setSync('syncing', t('syncing'));
  try {
    // Phase 1: first page of every endpoint (fast) so the UI renders immediately.
    const [p1, b1, donationsRaw, effortsRaw, statsRaw] = await Promise.all([
      fetchPage(ENDPOINTS.personReports, { page: 1, limit: PAGE_LIMIT }),
      fetchPage(ENDPOINTS.deadBodies, { page: 1, limit: PAGE_LIMIT }),
      fetchDonations(),
      fetchPage(ENDPOINTS.govEfforts, { page: 1, limit: 50 }),
      fetchStats(),
    ]);

    snapshot = {
      persons: normalizePersons(p1.items),
      bodies: normalizeDeadBodies(b1.items),
      donations: normalizeDonations(donationsRaw.items),
      stats: statsRaw,
      efforts: (effortsRaw.items || []).map((e) => ({
        title: e.title,
        agency: e.agency,
        link: e.link,
      })),
      syncedAt: Date.now(),
      personsTotal: p1.total || p1.items.length,
      bodiesTotal: b1.total || b1.items.length,
    };
    renderAll();

    // Phase 2: drain remaining pages in the background, appending + re-rendering.
    const drain = async (endpoint, total, normalize, append) => {
      let page = 2;
      while ((page - 1) * PAGE_LIMIT < total) {
        const r = await fetchPage(endpoint, { page, limit: PAGE_LIMIT });
        append(normalize(r.items));
        page += 1;
        if (page % 3 === 0) renderAll(); // periodic UI refresh
      }
    };

    await Promise.all([
      drain(ENDPOINTS.personReports, snapshot.personsTotal, normalizePersons, (xs) => snapshot.persons.push(...xs)),
      drain(ENDPOINTS.deadBodies, snapshot.bodiesTotal, normalizeDeadBodies, (xs) => snapshot.bodies.push(...xs)),
    ]);

    await saveSnapshot(snapshot);
    setSync('online', `${t('lastSynced')} ${formatDate(snapshot.syncedAt, getLang())}`);
    renderAll();
  } catch (err) {
    console.warn('sync failed:', err);
    setSync('offline', t('offline'));
    if (!snapshot) renderAll(); // still render any cached data
  }
}

// ---- events --------------------------------------------------------------------------

function switchTab(tab) {
  ui.tab = tab;
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('on'));
  $(`#view-${tab}`).classList.add('on');
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
}

function bindEvents() {
  // tab bar
  $('#tabbar').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (btn) switchTab(btn.dataset.tab);
  });

  // segmented controls
  $('#seg-people').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-state]');
    if (btn) selectPeople(btn.dataset.state);
  });

  $('#seg-dead').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-status]');
    if (btn) selectDead(btn.dataset.status);
  });

  // search (debounced)
  const debounce = (fn, ms) => {
    let h;
    return (...a) => {
      clearTimeout(h);
      h = setTimeout(() => fn(...a), ms);
    };
  };

  const peopleSearch = debounce(() => {
    ui.peopleQ = $('#people-q').value;
    ui.peopleLimit = RENDER_STEP;
    $('#search-people').classList.toggle('has-value', !!ui.peopleQ);
    renderPeople();
  }, 160);
  $('#people-q').addEventListener('input', peopleSearch);
  $('#people-clear').addEventListener('click', () => {
    $('#people-q').value = '';
    peopleSearch();
  });

  const deadSearch = debounce(() => {
    ui.deadQ = $('#dead-q').value;
    ui.deadLimit = RENDER_STEP;
    $('#search-dead').classList.toggle('has-value', !!ui.deadQ);
    renderDead();
  }, 160);
  $('#dead-q').addEventListener('input', deadSearch);
  $('#dead-clear').addEventListener('click', () => {
    $('#dead-q').value = '';
    deadSearch();
  });

  // filter chips (event delegation on both chip rows)
  const onChip = (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    if (chip.dataset.gender) {
      ui.gender = chip.dataset.gender;
      ui.peopleLimit = RENDER_STEP;
      renderPeople();
    } else if (chip.dataset.source) {
      ui.source = chip.dataset.source;
      ui.peopleLimit = RENDER_STEP;
      renderPeople();
    }
  };
  $('#chips-people').addEventListener('click', onChip);
  $('#chips-people-src').addEventListener('click', onChip);

  // load more
  $('#people-more').addEventListener('click', () => {
    ui.peopleLimit += RENDER_STEP;
    renderPeople();
  });
  $('#dead-more').addEventListener('click', () => {
    ui.deadLimit += RENDER_STEP;
    renderDead();
  });

  // copy account numbers
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    const text = btn.getAttribute('data-copy');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        const old = btn.textContent;
        btn.textContent = t('copied');
        setTimeout(() => (btn.textContent = old), 1200);
      });
    }
  });

  // language
  $('#lang-toggle').addEventListener('click', toggleLang);
}

// ---- boot -----------------------------------------------------------------------------

function registerSW() {
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

async function boot() {
  bindEvents();

  const prefs = (await loadPrefs().catch(() => null)) || {};
  if (prefs.lang) setLang(prefs.lang);
  applyI18n();
  renderAll();
  applyHash();

  // paint cached data immediately if available
  const cached = await loadSnapshot().catch(() => null);
  if (cached && Array.isArray(cached.persons) && Array.isArray(cached.bodies)) {
    snapshot = cached;
    setSync('online', `${t('lastSynced')} ${formatDate(cached.syncedAt, getLang())}`);
    renderAll();
  }

  registerSW();
  sync(); // background live refresh
}

boot();
