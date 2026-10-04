import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  METRIC_COLUMN_SOURCES,
  collectFieldsWithData,
  computeAutoHiddenVisibleCols,
} from './emptyColumns';

const DEFAULT_VISIBLE_COLS = {
  vxs: true, resolve2hr: true, phoneAdds: true, handoffs: true, resolve3d: false, aht: false,
  hold: false, dpc: false, vtt: false, netOcc: false, creditFreq: false, vhi: false, ncw: false, trajectory: true,
};

describe('collectFieldsWithData', () => {
  it('returns fields that carry a real value on at least one row', () => {
    const fields = collectFieldsWithData([
      { agentName: 'Alice', calls: 5, vxs: 88 },
      { agentName: 'Bob', calls: 3, phoneAdds: 1 },
    ]);
    assert.ok(fields.has('agentName'));
    assert.ok(fields.has('calls'));
    assert.ok(fields.has('vxs'));
    assert.ok(fields.has('phoneAdds'));
    assert.equal(fields.size, 4);
  });

  it('ignores null, undefined, and empty-string values', () => {
    const fields = collectFieldsWithData([
      { phoneAdds: null },
      { phoneAdds: undefined },
      { phoneAdds: '' },
      { vhi: 2 },
    ]);
    assert.ok(!fields.has('phoneAdds'));
    assert.ok(fields.has('vhi'));
  });

  it('returns an empty set for null/empty input', () => {
    assert.equal(collectFieldsWithData(null).size, 0);
    assert.equal(collectFieldsWithData([]).size, 0);
  });
});

describe('computeAutoHiddenVisibleCols', () => {
  it('hides a visible column whose backing field is entirely absent (phoneAdds)', () => {
    const fieldsWithData = collectFieldsWithData([
      { agentName: 'Alice', calls: 10, vxs: 90, resolve2hr: 95 },
    ]);
    const next = computeAutoHiddenVisibleCols(DEFAULT_VISIBLE_COLS, fieldsWithData);

    assert.equal(next.phoneAdds, false);
    // Columns with data stay visible
    assert.equal(next.vxs, true);
    assert.equal(next.resolve2hr, true);
    // Already-hidden columns stay hidden (never re-enabled)
    assert.equal(next.resolve3d, false);
  });

  it('keeps a visible column when ANY of its source fields has data (handoffs)', () => {
    // Rate variant absent, count variant present
    const fieldsWithData = collectFieldsWithData([{ handoffsCount: 4 }]);
    const next = computeAutoHiddenVisibleCols(DEFAULT_VISIBLE_COLS, fieldsWithData);
    assert.equal(next.handoffs, true);

    // Count variant absent, rate variant present
    const rateOnly = computeAutoHiddenVisibleCols(
      DEFAULT_VISIBLE_COLS,
      collectFieldsWithData([{ handoffs: 3.5 }]),
    );
    assert.equal(rateOnly.handoffs, true);
  });

  it('keeps the vtt column when only transaction fields are present', () => {
    const next = computeAutoHiddenVisibleCols(
      { ...DEFAULT_VISIBLE_COLS, vtt: true },
      collectFieldsWithData([{ vttSent: 10, vttTransacted: 8 }]),
    );
    assert.equal(next.vtt, true);
  });

  it('preserves non-metric toggles and derived metrics untouched', () => {
    const fieldsWithData = collectFieldsWithData([{ agentName: 'Alice', calls: 5 }]);
    const next = computeAutoHiddenVisibleCols(DEFAULT_VISIBLE_COLS, fieldsWithData);

    // trajectory and ncw are not in METRIC_COLUMN_SOURCES, so they are untouched
    assert.equal(next.trajectory, true);
    assert.equal(next.ncw, false);
    // Visible metrics with no data DO get hidden (core metrics are not protected)
    assert.equal(next.vxs, false);
    assert.equal(next.resolve2hr, false);
    assert.equal(next.handoffs, false);
  });

  it('returns the same object reference when nothing needs to hide', () => {
    const fieldsWithData = collectFieldsWithData([
      { vxs: 90, resolve2hr: 95, handoffsCount: 2, phoneAdds: 1 },
    ]);
    const next = computeAutoHiddenVisibleCols(DEFAULT_VISIBLE_COLS, fieldsWithData);
    assert.equal(next, DEFAULT_VISIBLE_COLS);
  });

  it('never re-enables columns that are already hidden and does not mutate input', () => {
    const input = { ...DEFAULT_VISIBLE_COLS, vhi: true, aht: true };
    const snapshot = { ...input };
    const next = computeAutoHiddenVisibleCols(input, collectFieldsWithData([{ agentName: 'Alice', calls: 5 }]));

    // Columns with no data are hidden, including the one just enabled
    assert.equal(next.vhi, false);
    assert.equal(next.aht, false);
    // The input object was not mutated
    assert.deepEqual(input, snapshot);
  });

  it('handles a missing/invalid fieldsWithData argument safely', () => {
    const next = computeAutoHiddenVisibleCols(DEFAULT_VISIBLE_COLS, undefined);
    // Every visible metric column gets hidden
    for (const key of Object.keys(METRIC_COLUMN_SOURCES)) {
      assert.equal(next[key], false);
    }
    assert.equal(next.trajectory, true);
  });
});
