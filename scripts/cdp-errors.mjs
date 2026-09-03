// Full exception/console capture for the live site.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9335;
const TARGET_URL = process.argv[2] || 'https://ashisregmi.github.io/rasuwa-flood-tracker/';
const WAIT_MS = Number(process.argv[3] || 9000);

const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${process.env.TEMP}\\sahara-cdp-${Date.now()}`,
  'about:blank',
], { stdio: 'ignore' });
proc.on('error', (e) => { console.log('spawn error:', e.message); process.exit(1); });

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
const events = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    events.push(`EXCEPTION: ${d.text || ''}\n  url: ${d.url}:${d.lineNumber}:${d.columnNumber}\n  desc: ${(d.exception && d.exception.description || '').slice(0, 500)}`);
  }
  if (m.method === 'Runtime.consoleAPICalled') {
    const parts = m.params.args.map((a) => (a.value !== undefined ? String(a.value) : (a.description || '')));
    events.push(`console.${m.params.type}: ${parts.join(' ').slice(0, 500)}`);
  }
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: TARGET_URL });
await sleep(WAIT_MS);

for (const e of events.slice(0, 10)) console.log(e + '\n---');

const r = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    sync: (document.getElementById('sync-label')||{}).textContent,
    peopleCards: document.querySelectorAll('#people-list .card').length,
    deadCards: document.querySelectorAll('#dead-list .card').length,
  })`,
  returnByValue: true,
});
if (r.result?.result?.value) console.log('STATE:', r.result.result.value);

ws.close();
proc.kill();
