// Extracted from App.tsx (Phase 3 move-only refactor) — behavior must stay identical.
import { FormattedText, GeminiLoader } from '../../../../components/shared';
import { useDashboard } from '../../hooks';
import { useEffect } from 'react';

// ─── Correlation Tab ──────────────────────────────────────
export const FloorCorrelationTab = () => {
  const { dashData, aiTools, uiState, uiHandlers } = useDashboard();
  useEffect(() => {
    if(dashData.hasUploadedData && !aiTools.correlationReport && !aiTools.loadingCorrelation) aiTools.generateCorrelationReport();
  }, [dashData.hasUploadedData, dashData.historicalData]);


  return (
    <div className="flex flex-col gap-6 p-6 bg-slate-50 border-t border-slate-200 rounded-b-xl">
      <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
        <div className="mb-6 border-b border-slate-100 pb-4 flex justify-between items-end flex-wrap gap-4">
          <div>
            <h3 className="text-xl font-extrabold flex items-center gap-2 mb-1 text-slate-900"><span>🎯</span> Integrity Match-ups</h3>
            <p className="text-sm text-slate-500 m-0">Pre-built risk profiles mapping behavioral trade-offs. The AI actively scans the raw data to surface the strongest hidden links.</p>
          </div>
          {aiTools.correlationReport && <button className="gemini-btn btn-alt px-3 py-1.5 text-xs" onClick={() => navigator.clipboard.writeText(aiTools.correlationReport)}>Copy</button>}
        </div>


        {aiTools.loadingCorrelation ? (
           <div className="flex justify-center p-10"><GeminiLoader color="#f59e0b" message="Scanning data for all Integrity Match-ups..." icon="🧠" /></div>
        ) : aiTools.correlationReport ? (
           <div className="report-body text-[1.05rem] leading-relaxed mt-0">
             <FormattedText text={aiTools.correlationReport} linkedEntities={uiState.linkedEntities} onEntityClick={uiHandlers.handleAiLinkClick} />
           </div>
        ) : (
           <div className="text-center p-10 text-slate-500 bg-slate-50 border border-dashed border-slate-300 rounded-lg">Initializing Correlation Scan...</div>
        )}
      </div>
    </div>
  );
};
