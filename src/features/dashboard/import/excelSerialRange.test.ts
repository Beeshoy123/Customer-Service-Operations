// S7.3 (2026-10-12): excelSerialRange is the single owner of the Excel date
// serial constants that used to be declared under the SAME names with
// DIFFERENT values in importPolicy.ts (MIN=1, conversion) and
// columnFingerprinter.ts (MIN=35000, classification). These tests lock the
// invariant whose violation was the "known divergence": anything the
// classifier calls date-like MUST convert, and the epoch math stays pinned.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXCEL_EPOCH_MS,
  EXCEL_SERIAL_MIN,
  EXCEL_SERIAL_MAX,
  EXCEL_SERIAL_CLASSIFY_MIN,
  isExcelDateSerial,
  isClassifiableDateSerial,
  excelSerialToIsoDate,
} from './excelSerialRange';
import { isDateLikeString } from './columnFingerprinter';
import { normalizeImportedValue } from './importPolicy';

describe('excelSerialRange (S7.3 — shared serial bounds)', () => {
  it('pins the documented constants', () => {
    assert.equal(EXCEL_EPOCH_MS, Date.UTC(1899, 11, 30));
    assert.equal(EXCEL_SERIAL_MIN, 1);
    assert.equal(EXCEL_SERIAL_MAX, 60000);
    assert.equal(EXCEL_SERIAL_CLASSIFY_MIN, 35000);
  });

  it('PARITY: every value classified date-like also converts (no dead window)', () => {
    // Sweep the whole numeric space that matters plus both floors' ±1 edges.
    const samples = new Set<number>();
    for (let n = 0; n <= 70000; n += 25) samples.add(n);
    for (const edge of [EXCEL_SERIAL_MIN - 1, EXCEL_SERIAL_MIN, EXCEL_SERIAL_MIN + 1,
                        EXCEL_SERIAL_CLASSIFY_MIN - 1, EXCEL_SERIAL_CLASSIFY_MIN, EXCEL_SERIAL_CLASSIFY_MIN + 1,
                        EXCEL_SERIAL_MAX - 1, EXCEL_SERIAL_MAX, EXCEL_SERIAL_MAX + 1]) {
      samples.add(edge);
    }
    for (const n of samples) {
      if (!isClassifiableDateSerial(n)) continue;
      assert.ok(
        isExcelDateSerial(n),
        `classify⊆convert violated at ${n}: fingerprinter would call it a date but conversion rejects it`,
      );
      // And end-to-end through the real pipeline entry points:
      assert.equal(
        normalizeImportedValue('date', String(n)),
        excelSerialToIsoDate(n),
        `value-level conversion mismatch at ${n}`,
      );
    }
  });

  it('conversion accepts everything the classify range accepts, via the public API', () => {
    // The two public entry points must agree on the classify band's extremes.
    assert.equal(isDateLikeString('35000'), true);
    assert.equal(normalizeImportedValue('date', '35000'), '1995-10-28');
    assert.equal(isDateLikeString('60000'), true);
    assert.equal(normalizeImportedValue('date', '60000'), '2064-04-08');
    // Below the classify floor: not date-like as a COLUMN, but still converts
    // when the field is already known to be a date (intentional asymmetry,
    // documented in excelSerialRange.ts).
    assert.equal(isDateLikeString('120'), false);
    assert.equal(normalizeImportedValue('date', '120'), '1900-04-29');
    // Above MAX: neither classifies nor converts.
    assert.equal(isDateLikeString('60001'), false);
    assert.equal(normalizeImportedValue('date', '60001'), null);
  });

  it('epoch math matches the historical anchor values', () => {
    assert.equal(excelSerialToIsoDate(45383), '2024-04-01');
    assert.equal(excelSerialToIsoDate(45292), '2024-01-01');
    assert.equal(excelSerialToIsoDate(45383.75), '2024-04-01'); // fraction ignored
    assert.equal(excelSerialToIsoDate(1), '1899-12-31');
    assert.equal(excelSerialToIsoDate(61), '1900-03-01'); // past the Lotus 1900 leap bug
  });

  it('predicates reject non-finite input', () => {
    assert.equal(isExcelDateSerial(Number.NaN), false);
    assert.equal(isExcelDateSerial(Number.POSITIVE_INFINITY), false);
    assert.equal(isClassifiableDateSerial(Number.NaN), false);
  });
});
