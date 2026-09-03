// Debug found-segment rendering on the live site.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9338;
const TARGET_URL = 'https://ashisregmi.github.io/rasuwa-flood-tracker/';
const WAIT_MS = 30000;

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
await sleep(WAIT_MS);

console.log('sync label:', await evalJS(`document.getElementById('sync-label').textContent`));
console.log('input value:', JSON.stringify(await evalJS(`document.getElementById('people-q').value`)));

// click found segment
await evalJS(`document.querySelector('#seg-people button[data-state="found"]').click()`);
await sleep(800);

const state1 = await evalJS(`JSON.stringify({
  idx: document.getElementById('seg-people').dataset.idx,
  cards: document.querySelectorAll('#people-list .card').length,
  names: Array.from(document.querySelectorAll('#people-list .card .name')).slice(0, 6).map(n=>n.textContent),
  q: document.getElementById('people-q').value,
})`);
console.log('after found click:', state1);

// clear query, search tamang
await evalJS(`
  const input = document.getElementById('people-q');
  input.value = 'tamang';
  input.dispatchEvent(new Event('input', { bubbles: true }));
`);
await sleep(1500);

const state2 = await evalJS(`JSON.stringify({
  cards: document.querySelectorAll('#people-list .card').length,
  names: Array.from(document.querySelectorAll('#people-list .card .name')).slice(0, 8).map(n=>n.textContent),
  empty: !document.getElementById('people-empty').classList.contains('hidden'),
  q: document.getElementById('people-q').value,
})`);
console.log('after tamang search:', state2);

ws.close();
proc.kill();
