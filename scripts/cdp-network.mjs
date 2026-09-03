// Watch live-site API requests + failures via CDP.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9336;
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
    const res = await fetch(`http://127.0.0.1:${PORT}/json`);
    target = (await res.json()).find((t) => t.type === 'page');
    if (target) break;
  } catch {}
}
if (!target) { console.log('FATAL: no CDP target'); proc.kill(); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });

let seq = 0;
const pending = new Map();
const apiLog = [];
const events = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.method === 'Network.requestWillBeSent') {
    const u = m.params.request.url;
    if (u.includes('rescue.opmcm.gov.np')) apiLog.push(['SENT', u.slice(0, 110), new Date().toISOString().slice(17, 23)]);
  }
  if (m.method === 'Network.responseReceived') {
    const u = m.params.response.url;
    if (u.includes('rescue.opmcm.gov.np')) apiLog.push(['RESP ' + m.params.response.status, u.slice(0, 110), new Date().toISOString().slice(17, 23)]);
  }
  if (m.method === 'Network.loadingFailed') {
    if (m.params.blockedReason || m.params.errorText) apiLog.push(['FAIL ' + (m.params.blockedReason || m.params.errorText), m.params.canceled ? '(canceled)' : '', '']);
  }
  if (m.method === 'Runtime.exceptionThrown') events.push('EXC: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 200));
  if (m.method === 'Runtime.consoleAPICalled') events.push('console.' + m.params.type + ': ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });

await send('Runtime.enable');
await send('Network.enable');
await send('Page.enable');
await send('Page.navigate', { url: TARGET_URL });
await sleep(WAIT_MS);

console.log('=== API requests ===');
for (const l of apiLog) console.log(l.join(' | '));
if (!apiLog.length) console.log('NO requests to rescue.opmcm.gov.np at all');
console.log('=== events ===');
for (const e of events.slice(0, 6)) console.log(e);

const r = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    sync: (document.getElementById('sync-label')||{}).textContent,
    peopleCards: document.querySelectorAll('#people-list .card').length,
    statLost: (document.getElementById('stat-lost')||{}).textContent,
  })`,
  returnByValue: true,
});
if (r.result?.result?.value) console.log('STATE:', r.result.result.value);

ws.close();
proc.kill();
