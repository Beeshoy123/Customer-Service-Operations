import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FIELD_ALIASES,
  PAIRED_COUNT_FIELDS,
  findCanonicalField,
  findPairedCountField,
  findCanonicalFieldWithTag,
} from './importPolicy';
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
});

