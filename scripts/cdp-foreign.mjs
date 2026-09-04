// Verify the foreign tab + rescued stat on the live site.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9345;

const TARGET_URL = process.argv[2] || 'https://ashisregmi.github.io/rasuwa-flood-tracker/#foreign';
const WAIT_MS = Number(process.argv[3] || 150000);

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
if (!target) { console.log('FATAL'); proc.kill(); process.exit(1); }

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
await sleep(WAIT_MS); // wait for phase 2 incl. foreign keyword searches

const state = await evalJS(`JSON.stringify({
  rescuedStat: document.getElementById('stat-rescued').textContent,
  foreignCards: document.querySelectorAll('#foreign-list .card').length,
  foreignNames: Array.from(document.querySelectorAll('#foreign-list .card .name')).slice(0, 8).map(n => n.textContent),
  chips: Array.from(document.querySelectorAll('#chips-foreign .chip')).map(c => c.textContent),
  linksCard: !!document.getElementById('foreign-links'),
  sync: document.getElementById('sync-label').textContent,
})`);
console.log(state);

ws.close();
proc.kill();
