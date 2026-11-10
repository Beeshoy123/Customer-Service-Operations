#!/usr/bin/env node
// make-fake-floor.mjs — builds a FAKE call-center quarter (Q3 2026) for tests.
//
//   node tools/make-fake-floor.mjs [outDir]        (default: ./fake-floor-2026Q3)
//
// 100% invented data: fake names, fake IDs, no employer. Same seed = same files
// every run, so tests can rely on it. Output is NOT meant to be committed
// (CSV/XLSX are blocked by .gitignore); commit this script instead.
//
// Needs the repo's `xlsx` package (run from the repo after `npm install`).

import fs from 'node:fs';
import path from 'node:path';
import * as XLSXNS from 'xlsx';
const XLSX = XLSXNS.default ?? XLSXNS;

const OUT = path.resolve(process.argv[2] || 'fake-floor-2026Q3');
fs.mkdirSync(OUT, { recursive: true });

// ---------- seeded random ----------
let seed = 20260930;
const rnd = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const normal = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

// ---------- people ----------
const FIRST = ['Omar','Youssef','Ahmed','Mahmoud','Karim','Hassan','Tarek','Khaled','Ali','Ibrahim','Mostafa','Amr','Hany','Sherif','Walid','Adel','Samir','Ramy','Nader','Fady','Mona','Sara','Nour','Heba','Dina','Rania','Yasmin','Salma','Laila','Aya','Hana','Farah','Mariam','Nada','Reem','Doaa','Eman','Esraa','Shaimaa','Amira','John','Mark','Mina','Peter','Bishoy','George','Michael','Kirollos','Andrew','Marina'];
const LAST = ['Hamdy','Saad','Farouk','Nasser','Mansour','Fawzy','Gaber','Salem','Zaki','Ragab','Shawky','Abbas','Lotfy','Sabry','Hegazy','Morsi','Kamel','Fahmy','Badr','Soliman','Darwish','Ghoneim','Tawfik','Rizk','Wahba','Habib','Naguib','Bakr','Younis','Metwally','Radwan','Selim','Shaker','Atef','Hussein','Awad','Magdy','Taha','Anwar','Gad','Fouad','Helmy','Idris','Lashin','Mekky','Nabil','Osman','Qassem','Reda','Sharaf'];
const combos = shuffle(FIRST.flatMap((f) => LAST.map((l) => `${f} ${l}`)));

const FLOORS = [{ name: 'Floor 1', n: 130 }, { name: 'Floor 2', n: 120 }, { name: 'Floor 3', n: 100 }];
const OAMS = ['Salah Fikry', 'Medhat Anis', 'Laila Shehata'];
const sups = []; // 35 supervisors, 10 agents each
let ci = 0;
for (let f = 0; f < FLOORS.length; f++) {
  const count = FLOORS[f].n / 10;
  for (let s = 0; s < count; s++) sups.push({ name: combos[ci++], floor: f });
}

const DAYS = []; // Jul 1 – Sep 30, 2026 (UTC midnight)
for (let d = Date.UTC(2026, 6, 1); d <= Date.UTC(2026, 8, 30); d += 86400000) DAYS.push(d);
const monthOf = (d) => new Date(d).getUTCMonth() - 6; // 0,1,2
const AUG15 = Date.UTC(2026, 7, 15), AUG3 = Date.UTC(2026, 7, 3);
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const dmy = (d) => { const x = new Date(d); return `${String(x.getUTCDate()).padStart(2, '0')}/${String(x.getUTCMonth() + 1).padStart(2, '0')}/${x.getUTCFullYear()}`; };
const serial = (d) => Math.round((d - Date.UTC(1899, 11, 30)) / 86400000);

const agents = [];
let idn = 0;
FLOORS.forEach((fl, f) => {
  const floorSups = sups.filter((s) => s.floor === f);
  for (let i = 0; i < fl.n; i++) {
    const sup = floorSups[Math.floor(i / 10)];
    agents.push({
      id: `CC${String(480000 + (idn += 1 + Math.floor(rnd() * 7)))}`,
      name: combos[ci++], floor: f, sup: sup.name, sup2: null, oam: OAMS[f],
      profile: 'steady', start: DAYS[0], end: DAYS[DAYS.length - 1],
      offPair: pick([[5, 6], [5, 6], [5, 6], [6, 0], [0, 1], [4, 5]]),
      lambda: Math.exp(Math.log(13) + normal() * 0.25),
      aht: clamp(420 + normal() * 60, 240, 700),
      p2h: clamp(0.82 + normal() * 0.05, 0.6, 0.95),
      pTop: clamp(0.78 + normal() * 0.06, 0.55, 0.95),
      pHand: clamp(0.07 + normal() * 0.03, 0.01, 0.2),
      vacation: null, trainingDays: new Set(),
    });
  }
});
const order = shuffle(agents.map((_, i) => i));
const take = (n, profile, fn) => order.splice(0, n).forEach((i) => { agents[i].profile = profile; fn && fn(agents[i]); });
take(12, 'persistent_low');
take(15, 'improving');
take(10, 'declining');
take(20, 'new_hire', (a) => { a.start = AUG3; });
take(15, 'leaver', (a) => { a.end = Date.UTC(2026, 7, 10) + Math.floor(rnd() * 40) * 86400000; });
take(10, 'sup_change', (a) => {
  const others = sups.filter((s) => s.floor === a.floor && s.name !== a.sup);
  a.sup2 = pick(others).name;
});
agents.forEach((a) => {
  if (rnd() < 0.08) { const st = 5 + Math.floor(rnd() * 70); a.vacation = [DAYS[st], DAYS[st] + (4 + Math.floor(rnd() * 8)) * 86400000]; }
  if (a.profile !== 'new_hire' && rnd() < 0.5) { // 2 training days in August (present, but no calls)
    for (let k = 0; k < 2; k++) a.trainingDays.add(Date.UTC(2026, 7, 4 + Math.floor(rnd() * 24)));
  }
});

const rates = (a, m) => {
  let pTop = a.pTop, p2h = a.p2h, aht = a.aht * (m === 2 ? 1.03 : 1);
  if (a.profile === 'persistent_low') { pTop = 0.56 - 0.02 * m; p2h = 0.68 - 0.01 * m; aht *= 1.15; }
  if (a.profile === 'improving') { pTop += 0.06 * m; p2h += 0.03 * m; }
  if (a.profile === 'declining') { pTop -= 0.07 * m; p2h -= 0.04 * m; aht *= 1 + 0.04 * m; }
  return { pTop: clamp(pTop, 0.3, 0.97), p2h: clamp(p2h, 0.4, 0.97), aht };
};

// ---------- csv helpers ----------
const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const line = (arr) => arr.map(esc).join(',');
const write = (name, lines) => fs.writeFileSync(path.join(OUT, name), lines.join('\n') + '\n');

// ---------- simulate ----------
const CALL_HEAD = ['Employee Name', 'Employee ID', 'Supervisor', 'OAM', 'Location', 'Date', 'Handle_Tm_Seconds', 'Resolve_2Hr_Pass', 'Resolve_2Hr_Cnt', 'Resolve_3D_Pass', 'Resolve_3D_Cnt', 'VXS_Pass', 'VXS_Cnt'];
const callLines = [[], [], []];
const reexport = []; // Jul 29-31 repeated in a second file
const transferRows = [];
const absRows = [];
const auxRows = [[], [], []];
const T = new Map(); // key id|m -> totals
const tot = (a, m) => { const k = `${a.id}|${m}`; if (!T.has(k)) T.set(k, { calls: 0, hand: 0, r2p: 0, r2c: 0, r3p: 0, r3c: 0, vp: 0, vc: 0, ahtSum: 0, days: 0 }); return T.get(k); };
const noisy = (n) => { const r = rnd(); return r < 0.006 ? n.toUpperCase() : r < 0.012 ? `${n} ` : r < 0.016 ? n.replace(' ', '  ') : n; };

for (const d of DAYS) {
  const m = monthOf(d), dow = new Date(d).getUTCDay();
  const dayRows = [];
  for (const a of agents) {
    if (d < a.start || d > a.end || dow === a.offPair[0] || dow === a.offPair[1]) continue;
    const onVac = a.vacation && d >= a.vacation[0] && d <= a.vacation[1];
    const absent = !onVac && rnd() < 0.05;
    const ncns = absent && rnd() < 0.1;
    const training = a.trainingDays.has(d);
    const sched = 9;
    if (onVac || absent) {
      absRows.push([a.id, serial(d), sched, sched, onVac ? 'AL' : ncns ? 'NCNS' : pick(['SL', 'SL', 'UL', 'EM'])]);
      continue;
    }
    const late = rnd() < 0.03 ? 15 + Math.floor(rnd() * 90) : 0;
    absRows.push([a.id, serial(d), sched, late / 60 > 0 ? +(late / 60).toFixed(2) : 0, late ? 'LATE' : '']);
    // AUX minutes for the day (login 540 min incl. breaks)
    const aux = { brk: 55 + Math.floor(rnd() * 20), lunch: 60, train: training ? 420 : (rnd() < 0.1 ? 30 + Math.floor(rnd() * 60) : 0), coach: rnd() < 0.15 ? 20 + Math.floor(rnd() * 25) : 0, meet: rnd() < 0.2 ? 15 + Math.floor(rnd() * 30) : 0, off: Math.floor(rnd() * 15) };
    auxRows[m].push([a.id, serial(d), +((540 - late) / 60).toFixed(2), aux.brk, aux.lunch, aux.train, aux.coach, aux.meet, aux.off]);
    if (training) continue; // present all day, zero calls

    const r = rates(a, m);
    const rampF = a.profile === 'new_hire' && d < AUG3 + 14 * 86400000 ? 0.5 : 1;
    const dayF = dow === 0 || dow === 1 ? 1.15 : dow === 4 ? 0.9 : 1;
    const calls = Math.max(0, Math.round(a.lambda * rampF * dayF + normal() * Math.sqrt(a.lambda)));
    const sup = a.sup2 && d >= AUG15 ? a.sup2 : a.sup;
    const t = tot(a, m); t.days++;
    let hand = 0;
    for (let c = 0; c < calls; c++) {
      const ht = clamp(Math.round(r.aht * Math.exp(normal() * 0.5 - 0.125)), 30, 3600);
      const p2 = rnd() < r.p2h ? 1 : 0;
      const p3 = p2 ? 1 : rnd() < 0.55 ? 1 : 0;
      const surveyed = rnd() < 0.09;
      const top = surveyed ? (rnd() < r.pTop ? 1 : 0) : '';
      if (rnd() < a.pHand) hand++;
      t.calls++; t.ahtSum += ht; t.r2c++; t.r3c++; t.r2p += p2; t.r3p += p3;
      if (surveyed) { t.vc++; t.vp += top; }
      const dateStr = m === 0 ? iso(d) : dmy(d);
      dayRows.push([m, line([noisy(a.name), a.id, sup, a.oam, FLOORS[a.floor].name, dateStr, ht, p2, 1, p3, 1, top, surveyed ? 1 : ''])]);
    }
    t.hand += hand;
    if (calls > 0) transferRows.push([noisy(a.name), dmy(d), calls, hand]);
  }
  shuffle(dayRows).forEach(([mm, l]) => {
    callLines[mm].push(l);
    if (mm === 0 && d >= Date.UTC(2026, 6, 29)) reexport.push(l);
  });
}

// junk rows: a few bad lines per month (blank name, blank date, negative handle time, test agent)
callLines.forEach((arr, m) => {
  const ds = m === 0 ? iso : dmy;
  const day = DAYS.find((x) => monthOf(x) === m && new Date(x).getUTCDay() === 2);
  arr.push(line(['', '', 'Nobody', OAMS[0], 'Floor 1', ds(day), 300, 1, 1, 1, 1, '', '']));
  arr.push(line(['TEST AGENT', 'CC000000', 'QA', OAMS[0], 'Floor 1', '', 300, 1, 1, 1, 1, '', '']));
  arr.push(line([agents[7].name, agents[7].id, agents[7].sup, agents[7].oam, 'Floor 1', ds(day), -1, 1, 1, 1, 1, '', '']));
});

// ---------- write files ----------
['2026-07', '2026-08', '2026-09'].forEach((mo, m) => write(`calls_${mo}.csv`, [line(CALL_HEAD), ...callLines[m]]));
write('calls_2026-07_reexport_last3days.csv', [line(CALL_HEAD), ...reexport]);
write('transfer_logs_2026Q3.csv', [line(['Employee Name', 'Date', 'Calls', 'Handoff Count']), ...transferRows.map(line)]);

// sales: per agent per month + per floor per month
const MON = ['Jul-26', 'Aug-26', 'Sep-26'];
const salesLines = [line(['Agent Name', 'Month', 'Sales Units', 'Orders', 'Revenue', 'Target'])];
const floorSales = [0, 1, 2].map(() => [0, 0, 0]);
agents.forEach((a) => {
  for (let m = 0; m < 3; m++) {
    const t = T.get(`${a.id}|${m}`); if (!t) continue;
    const units = Math.max(0, Math.round(t.calls * (a.profile === 'persistent_low' ? 0.02 : 0.045) + normal() * 2));
    floorSales[a.floor][m] += units;
    salesLines.push(line([a.name, MON[m], units, Math.round(units * 1.2), units * (180 + Math.floor(rnd() * 90)), 40]));
  }
});
write('sales_agent_monthly.csv', salesLines);
write('sales_floor_monthly.csv', [line(['Floor', 'Month', 'Sales Units', 'Target']), ...FLOORS.flatMap((f, i) => [0, 1, 2].map((m) => line([f.name, MON[m], floorSales[i][m], f.n * 40])))]);

// pivot-table style export (July only) — headers the importer should flag
const julAgents = agents.filter((a) => T.get(`${a.id}|0`));
write('pivot_calls_by_agent_jul.csv', [line(['Row Labels', 'Sum of Calls', 'Average of VXS']),
  ...julAgents.map((a) => { const t = T.get(`${a.id}|0`); return line([a.name, t.calls, t.vc ? (100 * t.vp / t.vc).toFixed(1) : '']); }),
  line(['Grand Total', julAgents.reduce((s, a) => s + T.get(`${a.id}|0`).calls, 0), ''])]);

// floor-level VOC workbook: one sheet per month, month written 3 different ways, a Total row
const fm = (f, m) => agents.filter((a) => a.floor === f).reduce((s, a) => { const t = T.get(`${a.id}|${m}`); if (t) { s.vc += t.vc; s.vp += t.vp; } return s; }, { vc: 0, vp: 0 });
const wbVoc = XLSX.utils.book_new();
[['Jul', 'July 2026'], ['Aug', 'Aug-26'], ['Sep', 'September 2026']].forEach(([sheet, label], m) => {
  const rows = [['Floor', 'Month', 'Surveys', 'Promoters', 'VXS %']];
  let ts = 0, tp = 0;
  FLOORS.forEach((f, i) => { const x = fm(i, m); ts += x.vc; tp += x.vp; rows.push([f.name, label, x.vc, x.vp, +(100 * x.vp / x.vc).toFixed(1)]); });
  rows.push(['Total', label, ts, tp, +(100 * tp / ts).toFixed(1)]);
  XLSX.utils.book_append_sheet(wbVoc, XLSX.utils.aoa_to_sheet(rows), sheet);
});
XLSX.writeFile(wbVoc, path.join(OUT, 'voc_floor_monthly_2026Q3.xlsx'));

// absenteeism (daily, serial dates) + AUX (one sheet per month, serial dates)
const wbAbs = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbAbs, XLSX.utils.aoa_to_sheet([['Employee ID', 'Date', 'Scheduled Hrs', 'Absent Hrs', 'Absence Code'], ...absRows]), 'Absence');
XLSX.writeFile(wbAbs, path.join(OUT, 'absenteeism_2026Q3.xlsx'));
const wbAux = XLSX.utils.book_new();
['AUX Jul', 'AUX Aug', 'AUX Sep'].forEach((sheet, m) => XLSX.utils.book_append_sheet(wbAux, XLSX.utils.aoa_to_sheet([['Employee ID', 'Date', 'Login Hrs', 'AUX Break', 'AUX Lunch', 'AUX Training', 'AUX Coaching', 'AUX Meeting', 'AUX Offline'], ...auxRows[m]]), sheet));
XLSX.writeFile(wbAux, path.join(OUT, 'aux_2026Q3.xlsx'));

// ---------- answer key (truth for tests) ----------
const keyLines = [line(['Employee ID', 'Employee Name', 'Floor', 'Supervisor (start)', 'Supervisor (after Aug 15)', 'Profile', 'Month', 'Calls', 'Handoffs', 'Resolve2hr Pass', 'Resolve2hr Cnt', 'Resolve3d Pass', 'Resolve3d Cnt', 'VXS Pass', 'VXS Cnt', 'AHT sec (mean)', 'Days with calls'])];
const floorKey = FLOORS.map(() => [0, 1, 2].map(() => ({ calls: 0, hand: 0, r2p: 0, r2c: 0, vp: 0, vc: 0 })));
agents.forEach((a) => [0, 1, 2].forEach((m) => {
  const t = T.get(`${a.id}|${m}`); if (!t) return;
  keyLines.push(line([a.id, a.name, FLOORS[a.floor].name, a.sup, a.sup2 || a.sup, a.profile, MON[m], t.calls, t.hand, t.r2p, t.r2c, t.r3p, t.r3c, t.vp, t.vc, t.calls ? (t.ahtSum / t.calls).toFixed(1) : '', t.days]));
  const f = floorKey[a.floor][m]; f.calls += t.calls; f.hand += t.hand; f.r2p += t.r2p; f.r2c += t.r2c; f.vp += t.vp; f.vc += t.vc;
}));
write('answer_key_agent_month.csv', keyLines);
write('answer_key_floor_month.csv', [line(['Floor', 'Month', 'Calls', 'Handoffs', 'Resolve2hr Pass', 'Resolve2hr Cnt', 'VXS Pass', 'VXS Cnt']),
  ...FLOORS.flatMap((f, i) => [0, 1, 2].map((m) => { const x = floorKey[i][m]; return line([f.name, MON[m], x.calls, x.hand, x.r2p, x.r2c, x.vp, x.vc]); }))]);

// ---------- README ----------
const nRows = callLines.reduce((s, a) => s + a.length, 0);
fs.writeFileSync(path.join(OUT, 'README.txt'), `FAKE call-center quarter (Q3 2026). All names/IDs are invented. Seed 20260930.
350 agents, 3 floors, 35 supervisors, 3 OAMs. ${nRows} call rows in 3 monthly files.

Files
  calls_2026-07/08/09.csv        per-call rows. July dates are YYYY-MM-DD, Aug/Sep are DD/MM/YYYY.
  calls_2026-07_reexport_last3days.csv   Jul 29-31 repeated (overlap test: totals must not double)
  transfer_logs_2026Q3.csv       agent+day: Calls and Handoff Count. No Supervisor, no ID. Calls repeats the call-file total (must NOT be summed).
  sales_agent_monthly.csv        agent + month ("Jul-26"). sales_floor_monthly.csv: floor + month.
  pivot_calls_by_agent_jul.csv   pivot export ("Row Labels", "Sum of ...", Grand Total) - should be flagged
  voc_floor_monthly_2026Q3.xlsx  floor + month, no agent; sheets Jul/Aug/Sep; month typed 3 ways; has a Total row
  absenteeism_2026Q3.xlsx        daily per agent, Excel serial dates, codes AL/SL/UL/EM/NCNS/LATE
  aux_2026Q3.xlsx                daily per agent, one sheet per month, serial dates
  answer_key_agent_month.csv / answer_key_floor_month.csv   the true totals

Built-in traps
  - 10 agents change supervisor on Aug 15 (merge key must not include supervisor)
  - ~1.6% of call rows have name noise (UPPERCASE, trailing/double space); IDs are always correct
  - 20 new hires start Aug 3 (half volume for 2 weeks); 15 leavers stop mid-quarter
  - ~half the agents have 2 August training days: present, AUX Training, zero calls (not "off")
  - 8% have a vacation block; 5% of scheduled days are absences
  - 12 persistent low performers (all 3 months), 15 improving, 10 declining
  - 9 junk rows (blank name, test agent, blank date, negative handle time) - 3 per month
  - Survey/VXS cells are blank when no survey came back (missing is not 0)
`);

console.log(`done: ${OUT}`);
console.log(`agents ${agents.length}, call rows ${nRows} (+${reexport.length} re-export), transfer rows ${transferRows.length}, absence rows ${absRows.length}, aux rows ${auxRows.reduce((s, a) => s + a.length, 0)}`);
