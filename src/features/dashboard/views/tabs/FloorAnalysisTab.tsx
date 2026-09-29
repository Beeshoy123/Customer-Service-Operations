// Extracted from App.tsx (Phase 3 move-only refactor) — behavior must stay identical.
import { FormattedText, GeminiLoader } from '../../../../components/shared';
import { useDashboard } from '../../hooks';
import { useEffect } from 'react';

// ─── Analysis Tab ──────────────────────────────────────
export const FloorAnalysisTab = () => {
  const { dashData, aiTools, uiState, uiHandlers } = useDashboard();
  useEffect(() => {
    if(dashData.hasUploadedData && !aiTools.teamReport && !aiTools.loadingTeam) aiTools.generateTeamReport();
  }, [dashData.hasUploadedData, dashData.historicalData]);


  return (
    <div className="flex flex-col gap-6 p-6 bg-slate-50 border-t border-slate-200 rounded-b-xl">
      <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
        <div className="mb-6 border-b border-slate-100 pb-4 flex justify-between items-end">
          <div>
            <h3 className="text-xl font-extrabold flex items-center gap-2 mb-1 text-slate-900"><span>🤖</span> Floor Analysis & Game Plan</h3>
            <p className="text-sm text-slate-500 m-0">Unified AI-driven analysis of organizational trends paired with actionable daily leadership targets.</p>
          </div>
          {aiTools.teamReport && <button className="gemini-btn btn-alt px-3 py-1.5 text-xs" onClick={() => navigator.clipboard.writeText(aiTools.teamReport)}>Copy</button>}
        </div>
        {aiTools.loadingTeam ? ( <GeminiLoader message="Brewing up your Unified Strategy Report..." color="#3b82f6" /> ) : aiTools.teamReport ? (
           <div className="report-body text-[1.05rem] leading-relaxed mt-0">
             <FormattedText text={aiTools.teamReport} linkedEntities={uiState.linkedEntities} onEntityClick={uiHandlers.handleAiLinkClick} />
           </div>
        ) : (
           <div className="text-center p-5 text-slate-500 italic">Initializing Floor Strategy Report...</div>
        )}
      </div>
    </div>
  );
};
