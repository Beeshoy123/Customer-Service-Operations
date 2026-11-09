// e2e_merge_scale.mjs - real-browser test: upload file A, then file B (overlapping on
// agent + day, 300K rows in total) and check that nothing from A is lost or doubled.
//
//   node tools/make-fake-overlap-files.mjs /tmp/overlap
//   npm run build && cp /tmp/overlap/fakeB.csv dist/
//   npx vite preview --port 4173 &
//   (one-time, outside the repo) npm i puppeteer-core @sparticuz/chromium
//   node tools/e2e_merge_scale.mjs http://localhost:4173 /tmp/overlap
//
// File A goes through the normal upload UI. The app has no visible "add another file"
// button once data is loaded, so file B is passed to the app's own import entry point
// (dashData.handleAutomaticImport, the function the landing page calls). Fake data only.
import fs from 'node:fs';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] || 'http://localhost:4173';
const DIR = process.argv[3] || '/tmp/overlap';
const expected = JSON.parse(fs.readFileSync(`${DIR}/expected.json`, 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  args: [...chromium.args, '--no-sandbox'],
  headless: 'shell',
  protocolTimeout: 900000,
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1000 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 160)));

// Summarise the dashboard's own in-memory data (read from the React tree, inside the page).
const stats = () => page.evaluate(() => {
  const rootEl = document.getElementById('root');
  const key = Object.keys(rootEl).find((k) => k.startsWith('__reactContainer$'));
  const seen = new Set(); const stack = [rootEl[key]]; let hist = null, agents = null;
  while (stack.length) {
    const f = stack.pop(); if (!f || seen.has(f)) continue; seen.add(f);
    const v = f.memoizedProps && f.memoizedProps.value;
    if (v && v.dashData && v.dashData.historicalData) { hist = v.dashData.historicalData; agents = v.dashData.agents; break; }
    if (f.sibling) stack.push(f.sibling); if (f.child) stack.push(f.child);
  }
  if (!hist) return { error: 'historicalData not found' };
  const s = { agents: agents.length, agentDays: 0, calls: 0, surveys: 0, promoters: 0, handoffsCount: 0, supUnknown: 0 };
  for (const a of agents) if (!a.supervisor || a.supervisor === 'Unknown') s.supUnknown++;
  for (const id of Object.keys(hist)) for (const d of Object.keys(hist[id])) {
    const r = hist[id][d]; s.agentDays++;
    if (r.calls != null) s.calls += r.calls;
    if (r.surveys != null) s.surveys += r.surveys;
    if (r.promoters != null) s.promoters += r.promoters;
    if (r.handoffsCount != null) s.handoffsCount += r.handoffsCount;
  }
  return s;
});

const chooseSavedAccountIfAsked = async () => {
  if (await page.evaluate(() => document.body.innerText.includes('Which account are these files for'))) {
    const sel = await page.$('select');
    const opts = await page.$$eval('select option', (os) => os.map((o) => o.value + '|' + o.textContent));
    await sel.select(opts.find((o) => o.includes('Verizon')).split('|')[0]);
    await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Import for this account'))?.click());
  }
};

await page.goto(BASE, { waitUntil: 'networkidle0' });
console.log('== upload file A through the upload UI');
await (await page.$('input[type=file]')).uploadFile(`${DIR}/fakeA.csv`);
await page.waitForFunction(() => /Which account are these files for|Applied \d+ imported rows/.test(document.body.innerText), { timeout: 120000, polling: 500 });
await chooseSavedAccountIfAsked();
await page.waitForFunction(() => /Applied \d+ imported rows/.test(document.body.innerText), { timeout: 300000, polling: 500 });
await sleep(3000);
const afterA = await stats();
console.log('after A', JSON.stringify(afterA));

console.log('== upload file B through the app import entry point');
await page.evaluate(async () => {
  const rootEl = document.getElementById('root');
  const key = Object.keys(rootEl).find((k) => k.startsWith('__reactContainer$'));
  const seen = new Set(); const stack = [rootEl[key]]; let dash = null;
  while (stack.length) {
    const f = stack.pop(); if (!f || seen.has(f)) continue; seen.add(f);
    const v = f.memoizedProps && f.memoizedProps.value;
    if (v && v.dashData && v.dashData.handleAutomaticImport) { dash = v.dashData; break; }
    if (f.sibling) stack.push(f.sibling); if (f.child) stack.push(f.child);
  }
  const blob = await (await fetch('/fakeB.csv')).blob();
  dash.handleAutomaticImport([new File([blob], 'fakeB.csv', { type: 'text/csv' })]);
});
await sleep(4000);
await chooseSavedAccountIfAsked();
// B is applied when the handoffs from B show up in the data.
for (let i = 0; i < 120; i++) { const s = await stats(); if (s.handoffsCount > 0) break; await sleep(2000); }
await sleep(3000);
const afterB = await stats();
console.log('after B', JSON.stringify(afterB));

const checks = [
  ['A alone: agent-days', afterA.agentDays === expected.rowsA],
  ['A alone: calls', afterA.calls === expected.callsA],
  ['A+B: still 3,000 agents (no duplicates)', afterB.agents === 3000],
  ['A+B: agent-days = union of A and B', afterB.agentDays === expected.agentDays],
  ['A+B: calls = union, not doubled', afterB.calls === expected.callsUnion],
  ['A+B: surveys from A kept', afterB.surveys === expected.surveysA],
  ['A+B: promoters from A kept', afterB.promoters === expected.promotersA],
  ['A+B: handoffs from B present', afterB.handoffsCount === expected.handoffsB],
  ['A+B: supervisors from A kept (none "Unknown")', afterB.supUnknown === 0],
  ['no page errors', pageErrors.length === 0],
];
let failed = 0;
for (const [name, ok] of checks) { console.log(ok ? 'PASS' : 'FAIL', name); if (!ok) failed++; }
await browser.close();
process.exit(failed ? 1 : 0);
