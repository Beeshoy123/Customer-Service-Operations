// @ts-nocheck
import type { AccountProfile, DataLocation, TargetStyle } from '../accountSetup/account-profile-schema';
// ============================================================================
// FILE STRUCTURE:
// ├── Date & Default Constants
// ├── KPI Target Thresholds
// ├── Metric Display Configurations
// ├── Dynamic Target Calculators
// ├── Column Definitions
// └── AI Persona Configuration
// ============================================================================

// Calculation convention: account-specific metric styles must be added as new
// profile-selected options. Existing defaults and branches remain active for other
// accounts and must not be replaced or deleted without explicit instruction.

// ─── Date & Default Constants ──────────────────────────────────────
export const getYesterdayDateString = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const DEFAULT_MANAGER_NAME = 'Department Manager';
export const DEFAULT_DATE = getYesterdayDateString();
export const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const CHART_COLORS = ['#D52B1E', '#10B981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#6366f1', '#64748b', '#0b0f19'];

const defaultData = (matchedColumns = ['']) : DataLocation => ({
  shape: 'ready-rate',
  matchedColumns,
});

const flatTarget = (value: number): TargetStyle => ({ kind: 'flat', value });

export const DEFAULT_ACCOUNT_PROFILE: AccountProfile = {
  accountName: 'verizon-consumer',
  createdAt: '',
  updatedAt: '',
  customerExperience: {
    label: 'C-Sat',
    data: defaultData(['vxs']),
    target: 88,
  },
  resolveRate: {
    shortTerm: { tracked: true, windowLabel: '2 hour', data: defaultData(['resolve2hr']), target: 92 },
    longTerm: { tracked: true, windowLabel: '3 day', data: defaultData(['resolve3d']), target: 80 },
  },
  sales: {
    mobile: {
      smartphones: { tracked: true, label: 'Phone Lines', matchedColumn: 'phoneAdds', targetStyle: flatTarget(1.3) },
      dataLines: { tracked: false, label: 'Data Lines', targetStyle: flatTarget(0) },
    },
    internet: {
      fiber: { tracked: false, label: 'Fiber', targetStyle: flatTarget(0) },
      fixedWireless: { tracked: true, label: 'VHI', matchedColumn: 'vhi', targetStyle: flatTarget(1) },
      hotspot: { tracked: false, label: 'Hotspot', targetStyle: flatTarget(0) },
    },
  },
  handoffs: { label: 'Hand-offs', data: defaultData(['handoffs']), target: 10 },
  dpc: { tracked: true, data: defaultData(['dpc']), target: 3 },
  ahtHold: {
    aht: { data: defaultData(['aht']), target: 1100 },
    hold: { data: defaultData(['hold']), target: 130, calcStyle: 'average-time' },
  },
  vtt: { tracked: false, requiredMessages: [], data: defaultData(['vtt']), target: 93 },
  credit: { calcStyle: 'frequency', label: 'Credit Freq', data: defaultData(['creditFreq']), target: 5, lowerIsBetter: true },
  ncw: { tracked: false, target: 10 },
  calculationStyles: { rateMergeStyle: 'arithmetic-average' },
};

// ─── KPI Target Thresholds ──────────────────────────────────────
export const TARGETS = {
  resolve2hr: 92,
  resolve3d: 80,
  vxs: 88,
  handoffs: 10,
  phoneAdds: 1.3,
  dataLines: 0,
  fiber: 0,
  hotspot: 0,
  grossAddsFwa: 1,
  aht: 1100,
  hold: 130,
  netOcc: 80,
  creditFreq: 5,
  dpc: 3,
  viewTogether: 93,
  ncw: 10,
};

// ─── Metric Display Configurations ──────────────────────────────────────
export const METRIC_CONFIG = {
  bonus: { label: 'Bonus Score', target: 100, format: '', reverse: false, max: 120 },
  vxs: { label: 'C-Sat', target: TARGETS.vxs, format: '', reverse: false, max: 100 },
  resolve2hr: { label: '2HR', target: TARGETS.resolve2hr, format: '', reverse: false, max: 100 },
  phoneAdds: { label: 'Phone Lines', target: TARGETS.phoneAdds, format: '', reverse: false, max: 20, isInteger: true },
  dataLines: { label: 'Data Lines', target: TARGETS.dataLines, format: '', reverse: false, max: 20, isInteger: true },
  fiber: { label: 'Fiber', target: TARGETS.fiber, format: '', reverse: false, max: 20, isInteger: true },
  hotspot: { label: 'Hotspot', target: TARGETS.hotspot, format: '', reverse: false, max: 20, isInteger: true },
  handoffs: { label: 'Hand-offs', target: TARGETS.handoffs, format: '', reverse: true, max: 25 },
  resolve3d: { label: '3DR', target: TARGETS.resolve3d, format: '', reverse: false, max: 100 },
  aht: { label: 'AHT', target: TARGETS.aht, format: '', reverse: true, max: 1500 },
  hold: { label: 'Hold', target: TARGETS.hold, reverse: true, max: 300 },
  dpc: { label: 'DPC', target: TARGETS.dpc, format: '', reverse: true, max: 10 },
  vtt: { label: 'VTT', target: TARGETS.viewTogether, format: '', reverse: false, max: 100 },
  netOcc: { label: 'Net OCC', target: TARGETS.netOcc, format: '', reverse: false, max: 100 },
  creditFreq: { label: 'Credit Freq', target: TARGETS.creditFreq, format: '', reverse: true, max: 20 },
  vhi: { label: 'VHI', target: TARGETS.grossAddsFwa, format: '', reverse: false, max: 20, isInteger: true },
  ncw: { label: 'NCW %', target: TARGETS.ncw, format: '%', reverse: true, max: 100 },
};

// ─── Dynamic Target Calculators ──────────────────────────────────────
export const getDynamicTarget = (key, count = 1) => {
  const validCount = Math.max(1, count || 1);
  if (key === 'phoneAdds') {
    const style = ACTIVE_ACCOUNT_PROFILE.sales.mobile.smartphones.targetStyle;
    return style.kind === 'dynamic-per-agent' ? Math.ceil(validCount * style.multiplier) : style.value;
  }
  return METRIC_CONFIG[key]?.target;
};

export const getDynamicMax = (key, count = 1) => {
  const validCount = Math.max(1, count || 1);
  if (key === 'phoneAdds') return Math.max(20, Math.ceil(getDynamicTarget(key, validCount) * 1.5));
  return METRIC_CONFIG[key]?.max || 100;
};

// ─── Column Definitions ──────────────────────────────────────
export const COL_DEFINITIONS = [
  { key: 'vxs', stateKey: 'vxs', label: 'C-Sat', format: '', reverse: false },
  { key: 'resolve2hr', stateKey: 'resolve2hr', label: '2HR', format: '', reverse: false },
  { key: 'phoneAdds', stateKey: 'phoneAdds', label: 'Phone Lines', format: '', reverse: false, isInteger: true },
  { key: 'dataLines', stateKey: 'dataLines', label: 'Data Lines', format: '', reverse: false, isInteger: true },
  { key: 'fiber', stateKey: 'fiber', label: 'Fiber', format: '', reverse: false, isInteger: true },
  { key: 'hotspot', stateKey: 'hotspot', label: 'Hotspot', format: '', reverse: false, isInteger: true },
  { key: 'handoffs', stateKey: 'handoffs', label: 'Hand-offs', format: '', reverse: true },
  { key: 'resolve3d', stateKey: 'resolve3d', label: '3DR', format: '', reverse: false },
  { key: 'aht', stateKey: 'aht', label: 'AHT', format: '', reverse: true },
  { key: 'hold', stateKey: 'hold', label: 'Hold', format: '', reverse: true },
  { key: 'dpc', stateKey: 'dpc', label: 'DPC', format: '', reverse: true },
  { key: 'viewTogether', stateKey: 'vtt', label: 'VTT', format: '', reverse: false },
  { key: 'netOcc', stateKey: 'netOcc', label: 'Net OCC', format: '', reverse: false },
  { key: 'creditFreq', stateKey: 'creditFreq', label: 'Credit Freq', format: '', reverse: true },
  { key: 'vhi', stateKey: 'vhi', label: 'VHI', format: '', reverse: false, isInteger: true },
  { key: 'ncw', stateKey: 'ncw', label: 'NCW %', format: '%', reverse: true },
];

const DEFAULT_COL_DEFINITIONS = COL_DEFINITIONS.map((column) => ({ ...column }));

// ─── AI Persona Configuration ──────────────────────────────────────
export const PERSONA = 'You are a data-driven, direct, and results-oriented performance improvement consultant. Use simple, everyday English.';

export let ACTIVE_ACCOUNT_PROFILE: AccountProfile = DEFAULT_ACCOUNT_PROFILE;

const targetFor = (profile: AccountProfile, key: string): number => {
  if (key === 'vxs') return profile.customerExperience.target;
  if (key === 'resolve2hr') return profile.resolveRate.shortTerm.target;
  if (key === 'resolve3d') return profile.resolveRate.longTerm.target;
  if (key === 'handoffs') return profile.handoffs.target;
  if (key === 'dpc') return profile.dpc.target ?? TARGETS.dpc;
  if (key === 'aht') return profile.ahtHold.aht.target;
  if (key === 'hold') return profile.ahtHold.hold.target;
  if (key === 'vtt' || key === 'viewTogether') return profile.vtt.target ?? TARGETS.viewTogether;
  if (key === 'phoneAdds') return profile.sales.mobile.smartphones.targetStyle.kind === 'flat'
    ? profile.sales.mobile.smartphones.targetStyle.value
    : profile.sales.mobile.smartphones.targetStyle.multiplier;
  if (key === 'dataLines') return profile.sales.mobile.dataLines.targetStyle.kind === 'flat'
    ? profile.sales.mobile.dataLines.targetStyle.value
    : profile.sales.mobile.dataLines.targetStyle.multiplier;
  if (key === 'fiber') return profile.sales.internet.fiber.targetStyle.kind === 'flat'
    ? profile.sales.internet.fiber.targetStyle.value
    : profile.sales.internet.fiber.targetStyle.multiplier;
  if (key === 'vhi') return profile.sales.internet.fixedWireless.targetStyle.kind === 'flat'
    ? profile.sales.internet.fixedWireless.targetStyle.value
    : profile.sales.internet.fixedWireless.targetStyle.multiplier;
  if (key === 'hotspot') return profile.sales.internet.hotspot.targetStyle.kind === 'flat'
    ? profile.sales.internet.hotspot.targetStyle.value
    : profile.sales.internet.hotspot.targetStyle.multiplier;
  if (key === 'netOcc' || key === 'creditFreq') return profile.credit.target;
  if (key === 'ncw') return profile.ncw.target ?? TARGETS.ncw;
  return TARGETS[key];
};

export const applyAccountProfile = (profile: AccountProfile | null | undefined): AccountProfile => {
  const active = profile || DEFAULT_ACCOUNT_PROFILE;
  ACTIVE_ACCOUNT_PROFILE = active;

  for (const key of Object.keys(TARGETS)) {
    const nextTarget = targetFor(active, key);
    if (typeof nextTarget === 'number') TARGETS[key] = nextTarget;
  }
  TARGETS.grossAddsFwa = targetFor(active, 'vhi');

  const labels: Record<string, string> = {
    vxs: active.customerExperience.label || 'C-Sat',
    resolve2hr: active.resolveRate.shortTerm.windowLabel || '2HR',
    resolve3d: active.resolveRate.longTerm.windowLabel || '3DR',
    phoneAdds: active.sales.mobile.smartphones.label || 'Phone Lines',
    dataLines: active.sales.mobile.dataLines.label || 'Data Lines',
    fiber: active.sales.internet.fiber.label || 'Fiber',
    vhi: active.sales.internet.fixedWireless.label || 'VHI',
    hotspot: active.sales.internet.hotspot.label || 'Hotspot',
    handoffs: active.handoffs.label || 'Hand-offs',
    dpc: 'DPC',
    vtt: 'VTT',
    netOcc: active.credit.label || 'Credit',
    creditFreq: active.credit.label || 'Credit Freq',
  };

  for (const [key, config] of Object.entries(METRIC_CONFIG)) {
    if (labels[key]) config.label = labels[key];
    const nextTarget = targetFor(active, key);
    if (typeof nextTarget === 'number') config.target = nextTarget;
    if (key === 'creditFreq' || key === 'netOcc') config.reverse = active.credit.lowerIsBetter;
  }

  const configuredColumns = new Set<string>(['vxs', 'resolve2hr', 'resolve3d', 'handoffs', 'aht', 'hold', 'netOcc', 'creditFreq', 'phoneAdds', 'vhi', 'ncw']);
  if (active.dpc.tracked) configuredColumns.add('dpc');
  if (active.vtt.tracked) configuredColumns.add('vtt');
  const profileColumns = [
    ['dataLines', active.sales.mobile.dataLines],
    ['fiber', active.sales.internet.fiber],
    ['hotspot', active.sales.internet.hotspot],
  ] as const;
  for (const [stateKey, line] of profileColumns) {
    if (line.tracked) configuredColumns.add(stateKey);
  }
  COL_DEFINITIONS.splice(0, COL_DEFINITIONS.length, ...DEFAULT_COL_DEFINITIONS.filter((column) => configuredColumns.has(column.stateKey)));
  return active;
};
