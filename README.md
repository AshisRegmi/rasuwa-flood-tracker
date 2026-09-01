# Sahara (सहारा) — Rasuwa Flood Relief

A mobile-first, installable PWA tracking **lost / found / deceased** persons and
**verified donation channels** for the Rasuwa flash flood (Bhote Koshi–Trishuli).

## Data source

The app pulls live data from the official Government of Nepal **Rasuwa Flood Rescue
Portal** (OPMCM) — no API key required, open CORS:

- `https://rescue.opmcm.gov.np/api/person-reports/` — lost / found people
- `https://rescue.opmcm.gov.np/api/dead-bodies/` — deceased (Nepal Police UDB)
- `https://rescue.opmcm.gov.np/api/donations/` — official donation channels
- `https://rescue.opmcm.gov.np/api/stats/sources` — aggregate source counts

Data is cached offline in IndexedDB with a "last synced" stamp; the app re-syncs on
open. All records show their source; nothing is invented or edited by this app.

## Run locally

```bash
node serve.js          # http://localhost:8080
npm test               # unit tests (pure logic, no browser needed)
```

Zero build step, zero dependencies. `npm run check` syntax-checks every JS file.

## Tech

- Vanilla JS (ES modules), no framework, no bundler
- Pure-logic / DOM split: `normalize.js` + `logic.js` are fully unit-tested
- Nepali + English (`i18n.js`), cross-script search (Devanagari ⇄ Latin)
- Apple-style design system (`styles.css`): light/dark, 6 accent palettes

## Privacy & dignity

Deceased records default to a minimal, respectful view (ref no + district only) for
unidentified remains, out of respect for the deceased and their families.

## License

MIT
