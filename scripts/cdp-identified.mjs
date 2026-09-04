// Verify the identified-tab links card on the live site.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9339;

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
await send('Page.navigate', { url: 'https://ashisregmi.github.io/rasuwa-flood-tracker/#identified' });
await sleep(30000);

const state = await evalJS(`JSON.stringify({
  linksCardHidden: document.getElementById('identified-links').classList.contains('hidden'),
  links: Array.from(document.querySelectorAll('#identified-links a')).map(a => a.textContent + ' -> ' + a.href),
  emptyText: document.getElementById('dead-empty').textContent.slice(0, 120),
  deadCards: document.querySelectorAll('#dead-list .card').length,
})`);
console.log(state);

// switch to unidentified — links card should hide
await evalJS(`document.querySelector('#seg-dead button[data-status="unidentified"]').click()`);
await sleep(600);
const after = await evalJS(`JSON.stringify({
  linksCardHidden: document.getElementById('identified-links').classList.contains('hidden'),
  deadCards: document.querySelectorAll('#dead-list .card').length,
})`);
console.log('after switch to unidentified:', after);

ws.close();
proc.kill();
