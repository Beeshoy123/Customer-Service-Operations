// Extracted from App.tsx (Phase 3 move-only refactor) — behavior must stay identical.
import { FormattedText, AiLoader, CopyReportButton } from '../../../../components/shared';
import { useDashboard } from '../../hooks';
import { TabFrame } from '../chrome/TabFrame';
import { useEffect } from 'react';

// ─── Analysis Tab ──────────────────────────────────────
export const FloorAnalysisTab = () => {
  const { dashData, aiTools, uiState, uiHandlers } = useDashboard();
  useEffect(() => {
    if(dashData.hasUploadedData && !aiTools.teamReport && !aiTools.loadingTeam) aiTools.generateTeamReport();
  }, [dashData.hasUploadedData, dashData.historicalData]);


  return (
    <TabFrame
      icon="analysis"
      title="Floor analysis & game plan"
      subtitle="Unified AI-driven analysis of organizational trends paired with actionable daily leadership targets."
      controls={aiTools.teamReport ? <CopyReportButton text={aiTools.teamReport} /> : undefined}
    >
      {aiTools.loadingTeam ? ( <AiLoader message="Brewing up your Unified Strategy Report..." color="#3b82f6" /> ) : aiTools.teamReport ? (
        <div className="report-body text-[1.05rem] leading-relaxed mt-0">
          <FormattedText text={aiTools.teamReport} linkedEntities={uiState.linkedEntities} onEntityClick={uiHandlers.handleAiLinkClick} />
        </div>
      ) : (
        <div className="text-center p-5 text-slate-500 italic">Initializing Floor Strategy Report...</div>
      )}
    </TabFrame>
  );
};
