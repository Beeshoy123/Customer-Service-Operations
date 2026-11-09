// e2e_storage_reload.mjs - real-browser test: upload a big fake file, reload the page,
// and check that the data is still there (storage must not lose it silently).
//
//   node tools/make-fake-overlap-files.mjs /tmp/overlap
//   npm run build
//   npx vite preview --port 4173 &
//   (one-time) npm i --no-save puppeteer-core @sparticuz/chromium
//   node tools/e2e_storage_reload.mjs http://localhost:4173 /tmp/overlap
//
// Uses fakeA.csv only (fake names and IDs). Prints agent-days before and after reload,
// the size of the old localStorage key, and whether IndexedDB holds the data.
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
  const s = { agents: agents.length, agentDays: 0, calls: 0 };
  for (const id of Object.keys(hist)) for (const d of Object.keys(hist[id])) {
    s.agentDays++;
    const c = hist[id][d].calls; if (c != null) s.calls += c;
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

const storageInfo = () => page.evaluate(async () => {
  const ls = localStorage.getItem('customer-service-dashboard-state-v1');
  const dbs = (indexedDB.databases ? await indexedDB.databases() : []).map((d) => d.name);
  return { localStorageBytes: ls ? ls.length : 0, indexedDbNames: dbs };
});

await page.goto(BASE, { waitUntil: 'networkidle0' });
console.log('== upload file A through the upload UI');
await (await page.$('input[type=file]')).uploadFile(`${DIR}/fakeA.csv`);
await page.waitForFunction(() => /Which account are these files for|Applied \d+ imported rows/.test(document.body.innerText), { timeout: 120000, polling: 500 });
await chooseSavedAccountIfAsked();
await page.waitForFunction(() => /Applied \d+ imported rows/.test(document.body.innerText), { timeout: 300000, polling: 500 });
await sleep(5000);
const before = await stats();
const info1 = await storageInfo();
console.log('before reload', JSON.stringify(before), JSON.stringify(info1));

console.log('== reload the page');
await page.reload({ waitUntil: 'networkidle0' });
let after = { error: 'not loaded' };
for (let i = 0; i < 60; i++) {
  after = await stats();
  if (!after.error) break;
  await sleep(1000);
}
const info2 = await storageInfo();
console.log('after reload', JSON.stringify(after), JSON.stringify(info2));

const checks = [
  ['agent-days loaded before reload', before.agentDays === expected.rowsA],
  ['agent-days survive reload', after.agentDays === expected.rowsA],
  ['calls survive reload', after.calls === expected.callsA],
  ['no page errors', pageErrors.length === 0],
];
let failed = 0;
for (const [name, ok] of checks) { console.log(ok ? 'PASS' : 'FAIL', name); if (!ok) failed++; }
await browser.close();
process.exit(failed ? 1 : 0);
