import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODAL_INITIAL,
  UI_INITIAL,
  modalReducer,
  uiReducer,
} from './uiReducer';
import type { UiState, UiPatch, ModalState, ModalPatch } from './uiReducer';

const UI_KEYS: (keyof UiState)[] = [
  'mainTab', 'activeMainAiTool', 'activeSupAiTool', 'showColMenu',
  'showModalColMenu', 'showTimeframeMenu', 'runChartMetric', 'isCumulative',
  'heatmapViewType', 'outlierMode', 'outlierLevel', 'apprenticeViewMode',
];

const MODAL_KEYS: (keyof ModalState)[] = [
  'activeModal', 'selectedSupervisorObj', 'expandedBurnoutAgentId',
  'highlightedAgentId', 'supTab',
];

describe('initial state shape', () => {
  it('UI_INITIAL carries exactly the 12 documented display fields', () => {
    assert.deepEqual(Object.keys(UI_INITIAL).sort(), [...UI_KEYS].sort());
    assert.equal(UI_INITIAL.mainTab, 'roster');
    assert.equal(UI_INITIAL.runChartMetric, 'bonus');
    assert.equal(UI_INITIAL.isCumulative, false);
  });

  it('MODAL_INITIAL carries exactly the 5 documented modal fields', () => {
    assert.deepEqual(Object.keys(MODAL_INITIAL).sort(), [...MODAL_KEYS].sort());
    assert.equal(MODAL_INITIAL.activeModal, null);
    assert.equal(MODAL_INITIAL.supTab, 'roster');
  });
});

describe('uiReducer', () => {
  it('patches one key and leaves the other 11 untouched', () => {
    const next = uiReducer(UI_INITIAL, { mainTab: 'outliers' });
    assert.equal(next.mainTab, 'outliers');
    assert.equal(next.showColMenu, UI_INITIAL.showColMenu);
    assert.equal(next.runChartMetric, UI_INITIAL.runChartMetric);
    for (const key of UI_KEYS) {
      if (key !== 'mainTab') assert.equal(next[key], UI_INITIAL[key]);
    }
  });

  it('applies several keys in a single dispatch', () => {
    const next = uiReducer(UI_INITIAL, { outlierMode: 'defenders', outlierLevel: 'supervisor' });
    assert.equal(next.outlierMode, 'defenders');
    assert.equal(next.outlierLevel, 'supervisor');
    assert.equal(next.mainTab, UI_INITIAL.mainTab);
  });

  it('never mutates the previous state or the patch', () => {
    const patch: UiPatch = { showColMenu: true, isCumulative: true };
    const snapshot = { ...UI_INITIAL };
    const next = uiReducer(UI_INITIAL, patch);

    assert.notEqual(next, UI_INITIAL);
    assert.deepEqual(UI_INITIAL, snapshot);
    assert.deepEqual(patch, { showColMenu: true, isCumulative: true });
    assert.equal(UI_INITIAL.showColMenu, false);
  });

  it('returns a new object even when the patch is empty', () => {
    const next = uiReducer(UI_INITIAL, {});
    assert.notEqual(next, UI_INITIAL);
    assert.deepEqual(next, UI_INITIAL);
  });

  it('returns a new object for an equal value — App.uiState memoizes on identity', () => {
    const next = uiReducer(UI_INITIAL, { mainTab: UI_INITIAL.mainTab });
    assert.notEqual(next, UI_INITIAL);
    assert.deepEqual(next, UI_INITIAL);
  });

  it('resets every field back to the documented default', () => {
    const dirty = uiReducer(UI_INITIAL, {
      mainTab: 'burnout',
      showColMenu: true,
      isCumulative: true,
      outlierLevel: 'supervisor',
    });
    assert.deepEqual(uiReducer(dirty, UI_INITIAL), UI_INITIAL);
  });

  it('rejects an unknown key at compile time (not at runtime — see UiPatch)', () => {
    // The reducer spreads whatever it is handed, so a mistyped key would still
    // land on the state at runtime. The guard is the patch type: tsc -b fails
    // if UiPatch ever widens to `any`, because @ts-expect-error then has no
    // error to suppress (TS2578). No-op at runtime on purpose.
    // @ts-expect-error `showCollMenu` is not a member of UiState
    const mistyped: UiPatch = { showCollMenu: true };
    assert.ok(mistyped);
  });
});

describe('modalReducer', () => {
  it('patches one key and leaves the other 4 untouched', () => {
    const next = modalReducer(MODAL_INITIAL, { activeModal: 'supervisor' });
    assert.equal(next.activeModal, 'supervisor');
    for (const key of MODAL_KEYS) {
      if (key !== 'activeModal') assert.equal(next[key], MODAL_INITIAL[key]);
    }
  });

  it('clears all 5 fields in one dispatch (closeModal resets them together)', () => {
    const dirty = modalReducer(MODAL_INITIAL, {
      activeModal: 'supervisor',
      selectedSupervisorObj: { name: 'Ada' } as Record<string, any>,
      expandedBurnoutAgentId: 'A1',
      highlightedAgentId: 'A2',
      supTab: 'strategy',
    });
    assert.deepEqual(modalReducer(dirty, MODAL_INITIAL), MODAL_INITIAL);
  });

  it('never mutates the previous state or the patch', () => {
    const patch: ModalPatch = { supTab: 'analysis' };
    const snapshot = { ...MODAL_INITIAL };
    const next = modalReducer(MODAL_INITIAL, patch);

    assert.notEqual(next, MODAL_INITIAL);
    assert.deepEqual(MODAL_INITIAL, snapshot);
    assert.equal(MODAL_INITIAL.supTab, 'roster');
  });

  it('starts from the documented defaults', () => {
    assert.deepEqual(MODAL_INITIAL, {
      activeModal: null, selectedSupervisorObj: null,
      expandedBurnoutAgentId: null, highlightedAgentId: null, supTab: 'roster',
    });
  });
});
