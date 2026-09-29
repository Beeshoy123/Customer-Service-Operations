import { useDashboard } from '../features/dashboard/hooks';
import { METRIC_CONFIG } from '../features/dashboard/config';
import { GeminiLoader, FormattedText } from '../components/shared';

// Extracted from App.tsx (Phase 1 move-only refactor) — behavior must stay identical.

// ─── AI Chart Action Modal ──────────────────────────────────────
export const ChartActionPlanModal = () => {
  const { aiTools, uiState, uiHandlers } = useDashboard();
  if (!aiTools.loadingChartActionPlan && !aiTools.chartActionPlan) return null;
  return (
    <>
      {aiTools.loadingChartActionPlan && (
        <div className="modal-backdrop open">
          <div className="main-modal bg-transparent shadow-none border-none flex justify-center items-center">
            <GeminiLoader message="Cooking up a targeted action plan..." color="#10B981" />
          </div>
        </div>
      )}
      
      {aiTools.chartActionPlan && (
        <div className="modal-backdrop open" onClick={() => aiTools.setChartActionPlan(null)}>
          <div className="main-modal" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-slate-200 p-6 px-8">
              <h2 className="m-0 text-red-600 flex items-center gap-2 text-xl">
                <span>🎯</span> Targeted Action Plan ({(METRIC_CONFIG as Record<string, { label: string }>)[uiState.runChartMetric as string].label})
              </h2>
              <button onClick={() => aiTools.setChartActionPlan(null)} className="bg-transparent border-none text-slate-500 cursor-pointer text-2xl">✕</button>
            </div>
            <div className="p-8 whitespace-pre-wrap leading-relaxed text-slate-700 text-sm">
              <FormattedText text={aiTools.chartActionPlan} linkedEntities={uiState.linkedEntities} onEntityClick={uiHandlers.handleAiLinkClick} />
              <div className="mt-8 text-right">
                <button className="gemini-btn inline-block w-auto" onClick={() => navigator.clipboard.writeText(aiTools.chartActionPlan)}>📋 Copy Action Plan</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
