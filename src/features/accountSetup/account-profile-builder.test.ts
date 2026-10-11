// S11 guard tests: buildAccountProfile output contract (moved to accountSetup beside its schema)
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAccountProfile, type MetricDraftInput } from './account-profile-builder';

const dl = (cols: string[]) => ({ shape: 'ready-rate' as const, matchedColumns: cols });
const d = (metric: MetricDraftInput['metric'], header: string, target: number, extra: Partial<MetricDraftInput> = {}): MetricDraftInput =>
  ({ metric, header, data: dl([header]), target, ...extra });

test('empty drafts keep DEFAULT seed but reset all five sales lines to untracked', () => {
  const p = buildAccountProfile('verizon-consumer', null, []);
  assert.equal(p.accountName, 'verizon-consumer');
  assert.equal(p.sales.mobile.smartphones.tracked, false);
  assert.equal(p.sales.mobile.dataLines.tracked, false);
  assert.equal(p.sales.internet.fiber.tracked, false);
  assert.equal(p.sales.internet.fixedWireless.tracked, false);
  assert.equal(p.sales.internet.hotspot.tracked, false);
  assert.deepEqual(p.dpc, { tracked: false });
  assert.deepEqual(p.vtt, { tracked: false, requiredMessages: [] });
});

test('blank account name falls back to the default profile name', () => {
  const p = buildAccountProfile('   ', null, []);
  assert.equal(p.accountName, 'verizon-consumer');
});

test('resolve windows use draft label with sensible defaults', () => {
  const p = buildAccountProfile('x', null, [
    d('resolve2hr', '2HR RR', 92),
    d('resolve3d', '3DR RR', 80, { windowLabel: '7 day' }),
  ]);
  assert.equal(p.resolveRate.shortTerm.windowLabel, '2 hour');
  assert.equal(p.resolveRate.shortTerm.tracked, true);
  assert.equal(p.resolveRate.longTerm.windowLabel, '7 day');
});

test('credit derives label and lowerIsBetter from calcStyle', () => {
  const occ = buildAccountProfile('x', null, [d('credit', 'Net OCC', 1.5, { calcStyle: 'per-call-average' })]);
  assert.equal(occ.credit.label, 'Net OCC');
  assert.equal(occ.credit.lowerIsBetter, true);
  const freq = buildAccountProfile('x', null, [d('credit', 'Credit', 10)]);
  assert.equal(freq.credit.calcStyle, 'frequency');
  assert.equal(freq.credit.label, 'Credit');
});

test('vtt keeps required messages; missing messages become empty array', () => {
  const withMsgs = buildAccountProfile('x', null, [d('vtt', 'VTT', 95, { requiredMessages: ['view-together'] })]);
  assert.equal(withMsgs.vtt.tracked, true);
  assert.deepEqual(withMsgs.vtt.requiredMessages, ['view-together']);
  const without = buildAccountProfile('x', null, [d('vtt', 'VTT', 90)]);
  assert.deepEqual(without.vtt.requiredMessages, []);
});

test('sales drafts flip lines to tracked with header as label/matchedColumn', () => {
  const p = buildAccountProfile('x', null, [
    d('phoneAdds', 'Phones', 3, { targetStyle: { kind: 'dynamic-per-agent', multiplier: 1.3 } }),
    d('fiber', 'Fiber GA', 1),
  ]);
  assert.equal(p.sales.mobile.smartphones.tracked, true);
  assert.equal(p.sales.mobile.smartphones.label, 'Phones');
  assert.deepEqual(p.sales.mobile.smartphones.targetStyle, { kind: 'dynamic-per-agent', multiplier: 1.3 });
  assert.equal(p.sales.internet.fiber.matchedColumn, 'Fiber GA');
  assert.deepEqual(p.sales.internet.fiber.targetStyle, { kind: 'flat', value: 1 });
});

test('customerExperience replaces the seeded config when provided', () => {
  const cx = { label: 'NPS', data: dl(['NPS Col']), target: 40 };
  const p = buildAccountProfile('x', cx, []);
  assert.equal(p.customerExperience.label, 'NPS');
});
