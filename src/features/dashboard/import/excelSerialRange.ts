// S7.3 (2026-10-12): single owner of the Excel date-serial constants that were
// previously declared under the SAME NAME (`EXCEL_SERIAL_MIN` / `_MAX`) with
// DIFFERENT VALUES in two files:
//   - importPolicy.ts        MIN = 1     (value-level conversion)
//   - columnFingerprinter.ts MIN = 35000 (column classification)
// Same name + different meaning is exactly how the divergence went unnoticed
// for so long. Here each role gets its own named constant and its own predicate,
// and a parity test (excelSerialRange.test.ts) locks the one invariant that
// must hold between them: every value classified date-like must also convert.
//
// Layering note: this file has ZERO imports so it sits below every member of
// the import/ folder's acyclic layer list (types → pure modules → importService
// → ImportPreviewModal). columnFingerprinter.ts previously had no imports at
// all and must not gain an edge into importPolicy.ts (which already imports
// FROM it) — hence this dedicated leaf module instead of importing from either.

// Excel's serial date epoch: days are counted from 1899-12-30 (not 1899-12-31)
// because Excel perpetuates the Lotus 1-2-3 leap-year-1900 bug where serial 60
// represents the fictional 1900-02-29. Serials above 60 are all one day ahead of
// what you'd get from 1899-12-31, so 1899-12-30 is the correct JS epoch to use.
export const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30); // 1899-12-30 UTC

// Plausible range for real-world Excel date serials:
//   1 → 1900-01-01,  60000 → 2064-04-08
// Values outside this range are rejected rather than passed to new Date() as a
// bare string, which would silently produce astronomical-year nonsense.
export const EXCEL_SERIAL_MIN = 1;
export const EXCEL_SERIAL_MAX = 60000;

// Floor for COLUMN-LEVEL classification (the fingerprinter's "is this column
// date-like?" question). This is the value that used to be duplicated as
// columnFingerprinter's own `EXCEL_SERIAL_MIN = 35000` — the divergent half of
// the S7 known-divergence. It is NOT the same constant as EXCEL_SERIAL_MIN:
// conversion (importPolicy) runs only after a header/field match has already
// deemed the column date-like, so it can accept the full 1–60000 range;
// classification runs on raw values with no context, so ordinary counts and
// durations (100, 150, 300 calls/seconds) must not fingerprint as dates.
// The classify floor stays at the fingerprinter's ORIGINAL value, 35000
// (~1995-10-28): ordinary business exports never contain pre-1995 dates, and
// lowering it would start fingerprinting 5-digit employee IDs and zip-like
// values as date columns. S7.3's win is that both numbers now live in ONE
// place with their differing roles named — not that either threshold moved.
export const EXCEL_SERIAL_CLASSIFY_MIN = 35000;

/** True when a numeric value is a plausible Excel serial for *conversion*. */
export function isExcelDateSerial(serial: number): boolean {
  return Number.isFinite(serial) && serial >= EXCEL_SERIAL_MIN && serial <= EXCEL_SERIAL_MAX;
}

/**
 * True when a bare integer is plausible enough to make its whole *column*
 * look date-like during fingerprinting (strict floor — see
 * EXCEL_SERIAL_CLASSIFY_MIN above for why this differs from conversion).
 */
export function isClassifiableDateSerial(serial: number): boolean {
  return Number.isFinite(serial) && serial >= EXCEL_SERIAL_CLASSIFY_MIN && serial <= EXCEL_SERIAL_MAX;
}

/** Convert an Excel serial (integer part = days, fraction ignored) to YYYY-MM-DD. */
export function excelSerialToIsoDate(serial: number): string {
  const days = Math.floor(serial);
  return new Date(EXCEL_EPOCH_MS + days * 86400000).toISOString().slice(0, 10);
}
