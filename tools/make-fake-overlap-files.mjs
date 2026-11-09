// make-fake-overlap-files.mjs - two FAKE overlapping files (300K rows, 75K shared agent-days)
// for the "merge without losing data" browser test (tools/e2e_merge_scale.mjs).
//
//   node tools/make-fake-overlap-files.mjs [outDir]      (default: ./fake-overlap)
//
// A = "VOC" file (has ID + supervisor + survey counts); B = "Transfer" file (names only,
// no ID, no supervisor). 100% invented names. CSVs are NOT meant to be committed.
import fs from 'node:fs';
const AG = 3000, DAYS_A = 50, OFFSET_B = 25, DAYS_B = 50;
const base = Date.UTC(2026, 7, 1);
const iso = (i) => new Date(base + i * 86400000).toISOString().slice(0, 10);
const calls = (a, d) => 5 + ((a * 7 + d * 13) % 40);          // same fact in both files
const aht = (a, d) => 200 + ((a * 3 + d) % 300);
const surveys = (a, d) => 1 + ((a + d) % 6);
const prom = (a, d) => Math.floor(surveys(a, d) * 0.6);
const hand = (a, d) => (a + d) % 4;
const name = (a) => `Fake Agent ${String(a).padStart(4, '0')}`;
let A = ['Employee Name,Employee ID,Supervisor,Report Date,Calls,AHT,Surveys,Promoters'];
let B = ['Employee Name,Report Date,Calls,Handoffs Count'];
let exp = { aOnly: 0, both: 0, bOnly: 0, callsUnion: 0, surveysA: 0, promotersA: 0, handoffsB: 0, handoffsBoth: 0 };
for (let a = 0; a < AG; a++) {
  for (let d = 0; d < DAYS_A; d++) {
    A.push(`${name(a)},E${100000 + a},Fake Sup ${a % 300},${iso(d)},${calls(a, d)},${aht(a, d)},${surveys(a, d)},${prom(a, d)}`);
    exp.surveysA += surveys(a, d); exp.promotersA += prom(a, d);
  }
  for (let k = 0; k < DAYS_B; k++) {
    const d = OFFSET_B + k;
    B.push(`${name(a)},${iso(d)},${calls(a, d)},${hand(a, d)}`);
    exp.handoffsB += hand(a, d);
  }
}
const union = new Set();
let callsUnion = 0;
for (let a = 0; a < AG; a++) for (let d = 0; d < DAYS_A; d++) union.add(a * 1000 + d);
for (let a = 0; a < AG; a++) for (let k = 0; k < DAYS_B; k++) union.add(a * 1000 + OFFSET_B + k);
for (const key of union) { const a = Math.floor(key / 1000), d = key % 1000; callsUnion += calls(a, d); }
exp.agentDays = union.size; exp.callsUnion = callsUnion; exp.rowsA = A.length - 1; exp.rowsB = B.length - 1;
let callsA = 0; for (let a = 0; a < AG; a++) for (let d = 0; d < DAYS_A; d++) callsA += calls(a, d);
exp.callsAOnlyIfBErasedA = null; exp.callsA = callsA;
const OUT = process.argv[2] || 'fake-overlap'; fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(OUT + '/fakeA.csv', A.join('\n')); fs.writeFileSync(OUT + '/fakeB.csv', B.join('\n'));
fs.writeFileSync(OUT + '/expected.json', JSON.stringify(exp, null, 1));
console.log(exp);
