// Extracted from App.tsx (Phase 3 move-only refactor) — behavior must stay identical.
import { FormattedText, AiLoader, CopyReportButton } from '../../../../components/shared';
import { useDashboard } from '../../hooks';
import { TabFrame } from '../chrome/TabFrame';
import { useEffect } from 'react';

// ─── Correlation Tab ──────────────────────────────────────
export const FloorCorrelationTab = () => {
  const { dashData, aiTools, uiState, uiHandlers } = useDashboard();
  useEffect(() => {
    if(dashData.hasUploadedData && !aiTools.correlationReport && !aiTools.loadingCorrelation) aiTools.generateCorrelationReport();
  }, [dashData.hasUploadedData, dashData.historicalData]);


  return (
    <TabFrame
      icon="match"
      title="Integrity match-ups"
      subtitle="Pre-built risk profiles mapping behavioral trade-offs. The AI actively scans the raw data to surface the strongest hidden links."
      controls={aiTools.correlationReport ? <CopyReportButton text={aiTools.correlationReport} /> : undefined}
    >
      {aiTools.loadingCorrelation ? (
        <div className="flex justify-center p-10"><AiLoader color="#f59e0b" message="Scanning data for all Integrity Match-ups..." icon="🧠" /></div>
      ) : aiTools.correlationReport ? (
        <div className="report-body text-[1.05rem] leading-relaxed mt-0">
          <FormattedText text={aiTools.correlationReport} linkedEntities={uiState.linkedEntities} onEntityClick={uiHandlers.handleAiLinkClick} />
        </div>
      ) : (
        <div className="text-center p-10 text-slate-500 bg-slate-50 border border-dashed border-slate-300 rounded-lg">Initializing Correlation Scan...</div>
      )}
    </TabFrame>
  );
};
