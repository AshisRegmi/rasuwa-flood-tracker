// Verify search on the live site: type a query into the people search box.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9337;
const TARGET_URL = 'https://ashisregmi.github.io/rasuwa-flood-tracker/';
const WAIT_MS = 25000;

const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${process.env.TEMP}\\sahara-cdp-${Date.now()}`,
  'about:blank',
], { stdio: 'ignore' });

let target;
for (let i = 0; i < 20; i++) {
  await sleep(500);
  try {
    target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page');
    if (target) break;
  } catch {}
}
if (!target) { console.log('FATAL: no target'); proc.kill(); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let seq = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evalJS = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: TARGET_URL });
await sleep(WAIT_MS);

const before = await evalJS(`document.querySelectorAll('#people-list .card').length`);
console.log('cards before search:', before);

// type 'thami' (should match 2 lost records: Tek raaj thami x2)
await evalJS(`
  const input = document.getElementById('people-q');
  input.value = 'thami';
  input.dispatchEvent(new Event('input', { bubbles: true }));
`);
await sleep(1200);

const res = await evalJS(`JSON.stringify({
  cards: document.querySelectorAll('#people-list .card').length,
  names: Array.from(document.querySelectorAll('#people-list .card .name')).slice(0, 5).map(n => n.textContent),
  emptyShown: !document.getElementById('people-empty').classList.contains('hidden'),
})`);
console.log('search result:', res);

// switch to found segment and search there too
await evalJS(`
  const seg = document.getElementById('seg-people');
  seg.querySelector('button[data-state="found"]').click();
`);
await sleep(600);
const foundCount = await evalJS(`document.querySelectorAll('#people-list .card').length`);
console.log('found segment cards:', foundCount);

await evalJS(`
  const input = document.getElementById('people-q');
  input.value = 'tamang';
  input.dispatchEvent(new Event('input', { bubbles: true }));
`);
await sleep(1200);
const foundSearch = await evalJS(`JSON.stringify({
  cards: document.querySelectorAll('#people-list .card').length,
  names: Array.from(document.querySelectorAll('#people-list .card .name')).slice(0, 5).map(n => n.textContent),
})`);
console.log('found segment search "tamang":', foundSearch);

ws.close();
proc.kill();
