// Capture ALL requests + console from NDRRMA rescue page.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9344;

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
const logs = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.method === 'Network.requestWillBeSent') reqs.push(m.params.request.method + ' ' + m.params.request.url.slice(0, 140));
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) reqs.push('HTTP ' + m.params.response.status + ' ' + m.params.response.url.slice(0, 140));
  if (m.method === 'Runtime.consoleAPICalled') logs.push('console.' + m.params.type + ': ' + m.params.args.map((a) => (a.value ?? a.description ?? '')).join(' ').slice(0, 200));
  if (m.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 200));
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });

await send('Runtime.enable');
await send('Network.enable');
await send('Page.enable');
await send('Page.navigate', { url: 'https://ndrrma.gov.np/np/rescue' });
await sleep(15000);

console.log('=== requests ===');
for (const r of [...new Set(reqs)]) console.log(r);
console.log('=== logs ===');
for (const l of logs.slice(0, 10)) console.log(l);

ws.close();
proc.kill();
