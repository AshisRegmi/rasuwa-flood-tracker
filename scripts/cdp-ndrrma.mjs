// Capture API calls made by the NDRRMA rescue page (find the real data endpoint).
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9340;
const TARGET = 'https://ndrrma.gov.np/np/rescue';

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
const reqs = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.method === 'Network.requestWillBeSent') {
    const u = m.params.request.url;
    if (!/\.(png|jpg|css|woff|svg|js)/.test(u)) reqs.push(m.params.request.method + ' ' + u.slice(0, 160));
  }
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });

await send('Runtime.enable');
await send('Network.enable');
await send('Page.enable');
await send('Page.navigate', { url: TARGET });
await sleep(15000);

console.log('=== non-static requests ===');
for (const r of [...new Set(reqs)]) console.log(r);

ws.close();
proc.kill();
