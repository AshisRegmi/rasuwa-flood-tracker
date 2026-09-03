// Live-site check via Chrome DevTools Protocol (headless Edge, real-time wait).
// Verifies the deployed app actually fetches and renders data.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333;
const TARGET_URL = process.argv[2] || 'https://ashisregmi.github.io/rasuwa-flood-tracker/';
const WAIT_MS = Number(process.argv[3] || 12000);

const proc = spawn(EDGE, [
  '--headless=new',
  '--disable-gpu',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${process.env.TEMP}\\sahara-cdp-profile-${Date.now()}`,
  'about:blank',
], { stdio: 'ignore' });

let target;
for (let i = 0; i < 20; i++) {
  await sleep(500);
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json`);
    const list = await res.json();
    target = list.find((t) => t.type === 'page');
    if (target) break;
  } catch {}
}
if (!target) { console.log('FATAL: no CDP target'); proc.kill(); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });

let seq = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
};
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

// capture console errors + network failures
const problems = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.method === 'Runtime.exceptionThrown') problems.push('EXC: ' + JSON.stringify(m.params.exceptionDetails).slice(0, 200));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') problems.push('console.error: ' + JSON.stringify(m.params.args).slice(0, 200));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') problems.push('log: ' + m.params.entry.text.slice(0, 200));
});

await send('Runtime.enable');
await send('Log.enable');
await send('Page.navigate', { url: TARGET_URL });
await sleep(WAIT_MS);

const r = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    title: document.title,
    stats: {
      lost: (document.getElementById('stat-lost')||{}).textContent,
      found: (document.getElementById('stat-found')||{}).textContent,
      dead: (document.getElementById('stat-dead')||{}).textContent,
    },
    sync: (document.getElementById('sync-label')||{}).textContent,
    peopleCards: document.querySelectorAll('#people-list .card').length,
    deadCards: document.querySelectorAll('#dead-list .card').length,
    donateCards: document.querySelectorAll('#donate-list .card').length,
    firstNames: Array.from(document.querySelectorAll('#people-list .card .name')).slice(0,3).map(n=>n.textContent),
    moreBtn: !(document.getElementById('people-more')||{classList:{contains:()=>true}}).classList.contains('hidden'),
  })`,
  returnByValue: true,
});

if (r.result?.result?.value) {
  console.log(JSON.stringify(JSON.parse(r.result.result.value), null, 2));
} else {
  console.log('evaluate failed:', JSON.stringify(r).slice(0, 300));
}
console.log('page problems:', problems.length ? problems.join('\n') : 'none');

ws.close();
proc.kill();
