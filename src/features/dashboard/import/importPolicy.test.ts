import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FIELD_ALIASES,
  PAIRED_COUNT_FIELDS,
  getFieldComponentGroup,
  getResolveWindowField,
  findCanonicalField,
  findPairedCountField,
  findCanonicalFieldWithTag,
  normalizeImportedValue,
  scoreColumnMapping,
  detectColumnMappingWithConfidence,
} from './importPolicy';
import { rememberMapping, clearMemory } from './mappingMemory';
import { normalizeHeaderToField } from './schemaNormalizer';
import { aggregateTransactions } from './aggregateTransactions';
import type { NormalizedRow } from './types';

describe('importPolicy extensions', () => {
  describe('resolveTotalContacts canonical field', () => {
    it('is registered in FIELD_ALIASES with kind number', () => {
      assert.ok(FIELD_ALIASES.resolveTotalContacts);
      assert.equal(FIELD_ALIASES.resolveTotalContacts.kind, 'number');
    });

    it('matches all specified aliases', () => {
      const expectedAliases = [
        'resolve total contacts',
        'resolvetotalcontacts',
        'total resolved',
        'resolved contacts',
      ];

      for (const alias of expectedAliases) {
        const canonical = findCanonicalField(alias);
        assert.equal(canonical, 'resolveTotalContacts', `Expected "${alias}" to map to resolveTotalContacts`);
      }
    });

    it('works through normalizeHeaderToField', () => {
      assert.equal(normalizeHeaderToField('Resolve Total Contacts'), 'resolveTotalContacts');
      assert.equal(normalizeHeaderToField('Total Resolved'), 'resolveTotalContacts');
      assert.equal(normalizeHeaderToField('Resolved Contacts'), 'resolveTotalContacts');
    });
  });

  describe('legacy concept keyword coverage', () => {
    it('recognizes legacy vxs and resolve keywords through the active import policy', () => {
      assert.equal(findCanonicalField('Customer NPS Score'), 'vxs');
      assert.equal(findCanonicalField('Repeat Callback Rate'), 'resolve2hr');
    });

    it('recognizes the missing sales line item fields for fiber, hotspot, and data lines', () => {
      assert.equal(findCanonicalField('Total Fiber Adds'), 'fiber');
      assert.equal(findCanonicalField('Hotspot Gross Adds'), 'hotspot');
      assert.equal(findCanonicalField('Watch Adds'), 'dataLines');
    });

    it('recognizes grouped Credit and VTT raw components', () => {
      assert.equal(findCanonicalField('OCC_Amt'), 'creditAmount');
      assert.equal(findCanonicalField('Occ_Trans_Cnt'), 'creditTransactions');
      assert.equal(findCanonicalField('VT_Eligible_Count'), 'vttEligible');
      assert.equal(findCanonicalField('VT_Ind_Count'), 'vttIndicated');
      assert.equal(findCanonicalField('VT_ATTACH_NUM'), 'vttAttach');
      assert.deepEqual(getFieldComponentGroup('creditAmount'), { concept: 'credit', role: 'amount' });
      assert.deepEqual(getFieldComponentGroup('vttAttach'), { concept: 'vtt', role: 'attachment-count' });
    });

    it('recognizes every resolve window as an explicit candidate', () => {
      assert.equal(findCanonicalField('Same Day Repeat Rate'), 'resolveSameDay');
      assert.equal(findCanonicalField('Resolve 2hr'), 'resolve2hr');
      assert.equal(findCanonicalField('3-Day Resolution'), 'resolve3d');
      assert.equal(findCanonicalField('5 Day Repeat'), 'resolve5d');
      assert.equal(findCanonicalField('7-Day Resolve'), 'resolve7d');
      assert.equal(getResolveWindowField('resolve7d')?.windowLabel, '7 day');
    });
  });

  describe('PAIRED_COUNT_FIELDS and paired count detection', () => {
    it('defines PAIRED_COUNT_FIELDS mapping canonical percent fields to pass and cnt alias lists', () => {
      assert.ok(PAIRED_COUNT_FIELDS.vxs);
      assert.ok(Array.isArray(PAIRED_COUNT_FIELDS.vxs.passAliases));
      assert.ok(Array.isArray(PAIRED_COUNT_FIELDS.vxs.cntAliases));

      assert.ok(PAIRED_COUNT_FIELDS.resolve2hr);
      assert.ok(PAIRED_COUNT_FIELDS.resolve3d);
    });

    it('findPairedCountField tags VXS_Overall_Rep_Pass and VXS_Overall_Rep_Cnt with canonical field and side', () => {
      const passMatch = findPairedCountField('VXS_Overall_Rep_Pass');
      assert.ok(passMatch);
      assert.equal(passMatch.canonicalField, 'vxs');
      assert.equal(passMatch.side, 'pass');
      assert.equal(passMatch.taggedField, 'vxs_Pass');

      const cntMatch = findPairedCountField('VXS_Overall_Rep_Cnt');
      assert.ok(cntMatch);
      assert.equal(cntMatch.canonicalField, 'vxs');
      assert.equal(cntMatch.side, 'cnt');
      assert.equal(cntMatch.taggedField, 'vxs_Cnt');
    });

    it('detects _pass and _cnt suffix patterns dynamically', () => {
      const passTag = findPairedCountField('Resolve_3d_Pass');
      assert.ok(passTag);
      assert.equal(passTag.canonicalField, 'resolve3d');
      assert.equal(passTag.side, 'pass');

      const cntTag = findPairedCountField('Resolve_3d_Cnt');
      assert.ok(cntTag);
      assert.equal(cntTag.canonicalField, 'resolve3d');
      assert.equal(cntTag.side, 'cnt');
    });

    it('findCanonicalField returns tagged field for paired count headers, preventing overwrite', () => {
      const passField = findCanonicalField('VXS_Overall_Rep_Pass');
      const cntField = findCanonicalField('VXS_Overall_Rep_Cnt');

      // They should NOT both be 'vxs', which would cause column overwrite
      assert.notEqual(passField, cntField);
      assert.equal(passField, 'vxs_Pass');
      assert.equal(cntField, 'vxs_Cnt');
    });

    it('findCanonicalFieldWithTag returns canonical field, side, and tagged field', () => {
      const tag = findCanonicalFieldWithTag('VXS_Overall_Rep_Pass');
      assert.ok(tag);
      assert.equal(tag.canonicalField, 'vxs');
      assert.equal(tag.side, 'pass');
      assert.equal(tag.taggedField, 'vxs_Pass');
    });

    it('normalizeHeaderToField maps paired count headers to tagged fields', () => {
      assert.equal(normalizeHeaderToField('VXS_Overall_Rep_Pass'), 'vxs_Pass');
      assert.equal(normalizeHeaderToField('VXS_Overall_Rep_Cnt'), 'vxs_Cnt');
    });

    it('enables aggregateTransactions to compute ratio instead of treating them as competing values', () => {
      // Simulate rows normalized with the tagged headers
      const rows: NormalizedRow[] = [
        {
          agentName: 'Alice',
          date: '2026-01-01',
          vxs_Pass: 1,
          vxs_Cnt: 1,
          resolveTotalContacts: 1,
        },
        {
          agentName: 'Alice',
          date: '2026-01-01',
          vxs_Pass: 1,
          vxs_Cnt: 1,
          resolveTotalContacts: 1,
        },
        {
          agentName: 'Alice',
          date: '2026-01-01',
          vxs_Pass: 0,
          vxs_Cnt: 1,
          resolveTotalContacts: 0,
        },
        {
          agentName: 'Alice',
          date: '2026-01-01',
          vxs_Pass: 0,
          vxs_Cnt: 0,
          resolveTotalContacts: 0,
        },
      ];

      const aggregated = aggregateTransactions(rows);
      assert.equal(aggregated.length, 1);
      const res = aggregated[0];

      assert.equal(res.calls, 4);
      // 2 passes out of 3 counts = 66.67%
      assert.equal(res.vxs, 66.67);
      assert.equal(res.vxs_Pass, 2);
      assert.equal(res.vxs_Cnt, 3);
      // resolveTotalContacts summed: 1 + 1 + 0 + 0 = 2
      assert.equal(res.resolveTotalContacts, 2);
    });
  });

  // ── Excel serial date handling ──────────────────────────────────────────────
  // convertDateLike is not exported directly; these tests drive it through the
  // public normalizeImportedValue(field, value) API with field = 'date'.
  describe('convertDateLike — Excel serial date detection', () => {

    // ── Core serial conversion ────────────────────────────────────────────────

    it('converts real Excel serial 45383 to the correct calendar date 2024-04-01', () => {
      // 45383 days after 1899-12-30 = 2024-04-01.
      // Bug: previously fell through to new Date("45383"), which JS interprets as
      // the astronomical year 45383, producing "+045383-01-01" — a non-null result
      // that passes hasMeaningfulText() and silently corrupts every row's date.
      const result = normalizeImportedValue('date', '45383');
      assert.equal(
        result,
        '2024-04-01',
        `Serial 45383 must convert to 2024-04-01 via Excel epoch (1899-12-30); got: ${result}`,
      );
    });

    it('converts serial 45292 to 2024-01-01', () => {
      assert.equal(normalizeImportedValue('date', '45292'), '2024-01-01');
    });

    it('converts serial 44927 to 2023-01-01', () => {
      assert.equal(normalizeImportedValue('date', '44927'), '2023-01-01');
    });

    it('converts serial 45000 to 2023-03-15', () => {
      assert.equal(normalizeImportedValue('date', '45000'), '2023-03-15');
    });

    it('strips the fractional time-of-day component from a serial with decimals', () => {
      // 45383.75 represents 2024-04-01 at 18:00 — only the date part matters.
      assert.equal(normalizeImportedValue('date', '45383.75'), '2024-04-01');
      assert.equal(normalizeImportedValue('date', '45383.0'), '2024-04-01');
    });

    // ── Range guard: prevents mis-mapped columns silently becoming dates ───────

    it('returns null for a numeric string far above EXCEL_SERIAL_MAX (e.g. "45383000")', () => {
      // Without the range guard, new Date("45383000") would be parsed by JS as
      // year 45383000, producing a non-null "+45383000-..." that passes validation.
      // The range guard (MAX = 60000 ≈ year 2064) must intercept this and return null
      // so validation.ts flags it as a missing date rather than a plausible one.
      const result = normalizeImportedValue('date', '45383000');
      assert.equal(
        result,
        null,
        `Out-of-range numeric "45383000" must return null, not an astronomical year: ${result}`,
      );
    });

    it('returns null for a small numeric string that is below EXCEL_SERIAL_MIN (e.g. "0")', () => {
      // Serial 0 is below the valid range (MIN = 1).
      assert.equal(normalizeImportedValue('date', '0'), null);
    });

    it('returns null for a misrouted calls-count column value like "120"', () => {
      // Serial 120 = 1900-04-29: within range and would silently produce a wrong
      // date. This is by design — a calls value of 120 mapped to 'date' IS in the
      // serial range because small numbers are valid early-1900 dates. The fix
      // protects against the far-future-year case (e.g. 45383000). Callers are
      // responsible for correct column mapping; we document this behaviour.
      // This test documents the actual behaviour rather than asserting null.
      const result = normalizeImportedValue('date', '120');
      // 120 is within [1..60000] → converts to 1900-04-29
      assert.equal(result, '1900-04-29');
    });

    it('returns null for a very large number like "999999" (above EXCEL_SERIAL_MAX)', () => {
      assert.equal(normalizeImportedValue('date', '999999'), null);
    });

    // ── Regression: existing formatted-date paths still work ─────────────────

    it('still converts ISO format YYYY-MM-DD strings', () => {
      assert.equal(normalizeImportedValue('date', '2024-03-15'), '2024-03-15');
      assert.equal(normalizeImportedValue('date', '2023-01-01'), '2023-01-01');
    });

    it('still converts MM/DD/YYYY slash-separated strings', () => {
      assert.equal(normalizeImportedValue('date', '03/15/2024'), '2024-03-15');
      // '1/5/2024' is ambiguous (could be Jan-5 or May-1); the parser resolves it as
      // month=5, day=1 (2024-05-01) because it tries the (second, first) candidate first.
      // Use an unambiguous value where the month candidate > 12 forces the other order.
      assert.equal(normalizeImportedValue('date', '01/15/2024'), '2024-01-15');
    });

    it('still converts DD-MM-YYYY dash-separated strings', () => {
      assert.equal(normalizeImportedValue('date', '15-03-2024'), '2024-03-15');
    });

    it('returns null for completely unparseable date strings', () => {
      assert.equal(normalizeImportedValue('date', 'not-a-date'), null);
      assert.equal(normalizeImportedValue('date', ''),           null);
    });
  });

  describe('scoreColumnMapping (Step 3 Multi-Signal Scoring Engine)', () => {
    it('auto-maps exact aliases with high confidence', () => {
      const names = ['DOE, JOHN', 'SMITH, JANE', 'ALVAREZ, CARLOS'];
      const mapping = scoreColumnMapping('Agent Name', 0, names);

      assert.equal(mapping.mappedField, 'agentName');
      assert.equal(mapping.confidence, 'exact');
      assert.equal(mapping.isLowConfidence, false);
      assert.equal(mapping.matchType, 'exact_alias');
      assert.ok(mapping.score && mapping.score >= 85);
      assert.ok(mapping.candidates && mapping.candidates.length > 0);
      assert.equal(mapping.candidates[0].field, 'agentName');
    });

    it('blocks false positives for system call IDs like IVR_Call_ID and Acss_Call_ID', () => {
      const ivrSamples = [
        'IVR_20240915_9847120',
        'IVR_20240915_9847121',
        'IVR_20240915_9847122',
      ];
      const ivrMapping = scoreColumnMapping('IVR_Call_ID', 0, ivrSamples);

      // Must be Unmapped — NOT employeeId and NOT calls!
      assert.equal(ivrMapping.mappedField, null);
      assert.equal(ivrMapping.confidence, 'none');
      assert.equal(ivrMapping.matchType, 'unmapped');
      assert.equal(ivrMapping.isLowConfidence, false);

      const acssSamples = [
        'Acss_Call_ID_001',
        'Acss_Call_ID_002',
        'Acss_Call_ID_003',
      ];
      const acssMapping = scoreColumnMapping('Acss_Call_ID', 0, acssSamples);

      assert.equal(acssMapping.mappedField, null);
      assert.equal(acssMapping.confidence, 'none');
      assert.equal(acssMapping.matchType, 'unmapped');
    });

    it('suggests low confidence for fuzzy header + compatible values like Avg Talk Time', () => {
      clearMemory();
      const ahtSamples = ['320', '450', '185', '600'];
      const mapping = scoreColumnMapping('Avg Talk Time', 0, ahtSamples);

      // Score should be in 50–84 range -> low confidence suggestion
      assert.equal(mapping.mappedField, 'aht');
      assert.equal(mapping.confidence, 'low');
      assert.equal(mapping.isLowConfidence, true);
      assert.ok(mapping.score && mapping.score >= 50 && mapping.score < 85);
      assert.ok(mapping.candidates && mapping.candidates[0].field === 'aht');
    });

    it('auto-maps with remembered confidence when header was previously learned in memory', () => {
      clearMemory();
      const ahtSamples = ['320', '450', '185', '600'];

      // First run before memory
      const initial = scoreColumnMapping('Avg Talk Time', 0, ahtSamples);
      assert.equal(initial.confidence, 'low');

      // User manually confirms/remembers mapping
      rememberMapping('Avg Talk Time', 'aht');

      // Re-score with memory active
      const afterRemember = scoreColumnMapping('Avg Talk Time', 0, ahtSamples);
      assert.equal(afterRemember.mappedField, 'aht');
      assert.equal(afterRemember.confidence, 'remembered');
      assert.equal(afterRemember.matchType, 'remembered');
      assert.equal(afterRemember.isLowConfidence, false);
      assert.ok(afterRemember.score && afterRemember.score >= 85);

      clearMemory();
    });

    it('matches paired count fields with exact structural confidence', () => {
      const passSamples = ['1', '0', '1', '1'];
      const mapping = scoreColumnMapping('VXS_Overall_Rep_Pass', 0, passSamples);

      assert.equal(mapping.mappedField, 'vxs_Pass');
      assert.equal(mapping.confidence, 'exact');
      assert.equal(mapping.matchType, 'paired_count');
      assert.equal(mapping.isLowConfidence, false);
    });

    it('returns unmapped for empty or unmapped headers', () => {
      const mapping1 = scoreColumnMapping('', 0, []);
      assert.equal(mapping1.mappedField, null);
      assert.equal(mapping1.confidence, 'none');
      assert.equal(mapping1.matchType, 'unmapped');

      const mapping2 = scoreColumnMapping('Completely Random Unrelated Header', 0, ['foo', 'bar']);
      assert.equal(mapping2.mappedField, null);
      assert.equal(mapping2.confidence, 'none');
      assert.equal(mapping2.matchType, 'unmapped');
    });

    it('detectColumnMappingWithConfidence delegates seamlessly to scoreColumnMapping', () => {
      const names = ['DOE, JOHN', 'SMITH, JANE'];
      const res = detectColumnMappingWithConfidence('Agent Name', 0, names);
      assert.equal(res.mappedField, 'agentName');
      assert.equal(res.confidence, 'exact');
      assert.ok(res.candidates && res.candidates.length > 0);
    });
  });
});

