// Extracted from App.tsx (Phase 6 move-only refactor) — behavior must stay identical.
// The reducers are the same merge lambdas App used inline: (state, action) => ({ ...state, ...action }).
// Typed patches replace the previous `any`, so a mistyped dispatch key is now a compile error
// rather than a silent no-op (this was finding C4's enabling condition).

/** The 5 modal fields owned by App and dispatching through `dispatchModal`. */
export interface ModalState {
  activeModal: string | null;
  selectedSupervisorObj: Record<string, any> | null;
  expandedBurnoutAgentId: string | null;
  highlightedAgentId: string | null;
  supTab: string;
}

/** The 12 UI display fields owned by App and dispatching through `dispatchUi`. */
export interface UiState {
  mainTab: string;
  activeMainAiTool: string | null;
  activeSupAiTool: string | null;
  showColMenu: boolean;
  showModalColMenu: boolean;
  showTimeframeMenu: boolean;
  runChartMetric: string;
  isCumulative: boolean;
  heatmapViewType: string;
  outlierMode: string;
  outlierLevel: string;
  apprenticeViewMode: string;
}

export const MODAL_INITIAL: ModalState = {
  activeModal: null, selectedSupervisorObj: null,
  expandedBurnoutAgentId: null, highlightedAgentId: null, supTab: 'roster',
};

export const UI_INITIAL: UiState = {
  mainTab: 'roster',
  activeMainAiTool: null,
  activeSupAiTool: null,
  showColMenu: false,
  showModalColMenu: false,
  showTimeframeMenu: false,
  runChartMetric: 'bonus',
  isCumulative: false,
  heatmapViewType: 'weekly',
  outlierMode: 'offenders',
  outlierLevel: 'agent',
  apprenticeViewMode: 'coding',
};

/** A dispatch payload: any subset of the state, merged over the previous value. */
export type ModalPatch = Partial<ModalState>;
export type UiPatch = Partial<UiState>;

export const modalReducer = (state: ModalState, action: ModalPatch): ModalState => ({ ...state, ...action });

export const uiReducer = (state: UiState, action: UiPatch): UiState => ({ ...state, ...action });
