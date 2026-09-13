// @ts-nocheck
// ============================================================================
// FILE STRUCTURE:
// ├── Date & Default Constants
// ├── KPI Target Thresholds
// ├── Metric Display Configurations
// ├── Dynamic Target Calculators
// ├── Column Definitions
// └── AI Persona Configuration
// ============================================================================

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

// ─── KPI Target Thresholds ──────────────────────────────────────
export const TARGETS = {
  resolve2hr: 92,
  resolve3d: 80,
  vxs: 88,
  handoffs: 10,
  phoneAdds: 1.3,
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
  if (key === 'phoneAdds') return Math.ceil(validCount * 1.3);
  return METRIC_CONFIG[key]?.target;
};

export const getDynamicMax = (key, count = 1) => {
  const validCount = Math.max(1, count || 1);
  if (key === 'phoneAdds') return Math.max(20, Math.ceil(validCount * 1.3) * 1.5);
  return METRIC_CONFIG[key]?.max || 100;
};

// ─── Column Definitions ──────────────────────────────────────
export const COL_DEFINITIONS = [
  { key: 'vxs', stateKey: 'vxs', label: 'C-Sat', format: '', reverse: false },
  { key: 'resolve2hr', stateKey: 'resolve2hr', label: '2HR', format: '', reverse: false },
  { key: 'phoneAdds', stateKey: 'phoneAdds', label: 'Phone Lines', format: '', reverse: false, isInteger: true },
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

// ─── AI Persona Configuration ──────────────────────────────────────
export const PERSONA = 'You are a data-driven, direct, and results-oriented performance improvement consultant. Use simple, everyday English.';
