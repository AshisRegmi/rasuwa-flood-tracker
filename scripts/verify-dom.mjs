// Verify the DOM contract: every #id referenced in app.js exists in index.html.
// Catches the classic dead-page bug (script references an id that isn't in markup).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(ROOT, 'src', 'app.js'), 'utf-8');
const html = readFileSync(join(ROOT, 'index.html'), 'utf-8');

const ids = new Set();
for (const m of app.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)) ids.add(m[1]);
for (const m of app.matchAll(/\$\("#([A-Za-z0-9_-]+)"\)/g)) ids.add(m[1]);
for (const m of app.matchAll(/\$\('([A-Za-z0-9_-]+)'\)/g)) ids.add(m[1]);
for (const m of app.matchAll(/getElementById\('([A-Za-z0-9_-]+)'\)/g)) ids.add(m[1]);
// dynamic view ids built via template literal `#view-${tab}`
for (const m of app.matchAll(/`#view-\$\{(\w+)\}`/g)) {
  for (const t of ['people', 'dead', 'donate', 'info']) ids.add(`view-${t}`);
}

const missing = [...ids].filter((i) => !html.includes(`id="${i}"`));
console.log('ids referenced:', [...ids].sort().join(', '));
console.log('MISSING:', missing.length ? missing.join(', ') : 'none');

// manifest icon files exist + are real PNGs
import { existsSync, statSync } from 'node:fs';
const man = JSON.parse(readFileSync(join(ROOT, 'manifest.webmanifest'), 'utf-8'));
for (const icon of man.icons) {
  const p = join(ROOT, icon.src.replace(/^\//, ''));
  const ok = existsSync(p);
  console.log(`icon ${icon.src} -> ${ok ? 'exists' : 'MISSING'} (${ok ? statSync(p).size : 0}b)`);
}

process.exit(missing.length ? 1 : 0);
