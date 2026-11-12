// Extracted from App.tsx (Phase 3 move-only refactor) — behavior must stay identical.
import { FormattedText, AiLoader, CopyReportButton } from '../../../../components/shared';
import { METRIC_CONFIG, getDynamicTarget } from '../../config';
import { aggregateTeamMetrics } from '../../helpers';
import { useDashboard } from '../../hooks';
import { TabFrame, Segmented } from '../chrome/TabFrame';
import { useEffect, useMemo } from 'react';

// ─── Floor Apprentice Tab ──────────────────────────────────────
export const FloorApprenticeTab = () => {
  const { dashData, aiTools, uiState, uiHandlers } = useDashboard();
  const isCoding = uiState.apprenticeViewMode === 'coding';
  
  const handleCohortClick = (cohortName: any) => {
      uiHandlers.setInputValue(cohortName);
      uiHandlers.setSearchQuery(cohortName);
      uiHandlers.setMainTab('roster');
  };


  const titleA = isCoding ? "New Hires" : "OJT";
  const titleB = isCoding ? "Transitions" : "Nesting";

  // Memoized: only recomputes when agents, view mode, or timeframe changes
  const groupA = useMemo(
    () => dashData.agents.filter((a: any) => isCoding ? a.coding === 'New Hire' && a.phase !== 'OJT' : a.phase === 'OJT'),
    [dashData.agents, isCoding]
  );
  const groupB = useMemo(
    () => dashData.agents.filter((a: any) => isCoding ? a.coding === 'Transition' : a.phase === 'Nesting'),
    [dashData.agents, isCoding]
  );

  const dataA = useMemo(
    () => aggregateTeamMetrics(groupA.map((a: any) => dashData.getAgentDataForTimeframe(a, dashData.activeTimeframe))),
    [groupA, dashData.activeTimeframe, dashData.getAgentDataForTimeframe]
  );
  const dataB = useMemo(
    () => aggregateTeamMetrics(groupB.map((a: any) => dashData.getAgentDataForTimeframe(a, dashData.activeTimeframe))),
    [groupB, dashData.activeTimeframe, dashData.getAgentDataForTimeframe]
  );


  useEffect(() => {
    if (dataA && dataB && ((dataA.calls ?? 0) > 0 || (dataB.calls ?? 0) > 0)) {
        aiTools.generateApprenticeReport(uiState.apprenticeViewMode, dataA, dataB, titleA, titleB);
    }
  }, [uiState.apprenticeViewMode, dashData.selectedDate, dashData.selectedWeek, dashData.activeTimeframe]);


  const getVal = (d: any, key: any) => (d && d[key] !== null && d[key] !== undefined && !isNaN(d[key])) ? d[key] : 0;
  
  const metricsToRender = [
    { key: 'calls', label: 'Volume (Calls)', type: 'count', aVal: getVal(dataA, 'calls'), bVal: getVal(dataB, 'calls'), aSub: `${getVal(dataA, 'ncwCount')} NCWs`, bSub: `${getVal(dataB, 'ncwCount')} NCWs` },
    { key: 'vxs', label: 'C-Sat', type: 'pct', aVal: getVal(dataA, 'vxs'), bVal: getVal(dataB, 'vxs'), aSub: `${getVal(dataA, 'detractors')} Detractors`, bSub: `${getVal(dataB, 'detractors')} Detractors` },
    { key: 'resolve2hr', label: '2HR', type: 'pct', aVal: getVal(dataA, 'resolve2hr'), bVal: getVal(dataB, 'resolve2hr') },
    { key: 'resolve3d', label: '3DR', type: 'pct', aVal: getVal(dataA, 'resolve3d'), bVal: getVal(dataB, 'resolve3d') },
    { key: 'handoffs', label: 'Hand-offs', type: 'pct', aVal: getVal(dataA, 'handoffs'), bVal: getVal(dataB, 'handoffs'), aSub: `${Math.round(getVal(dataA, 'handoffsCount'))} Transfers`, bSub: `${Math.round(getVal(dataB, 'handoffsCount'))} Transfers` },
    { key: 'phoneAdds', label: 'Phone Lines', type: 'count', aVal: getVal(dataA, 'phoneAdds'), bVal: getVal(dataB, 'phoneAdds') },
    { key: 'vhi', label: 'VHI', type: 'count', aVal: getVal(dataA, 'vhi'), bVal: getVal(dataB, 'vhi') },
    { key: 'vtt', label: 'VTT', type: 'pct', aVal: getVal(dataA, 'vtt'), bVal: getVal(dataB, 'vtt') }
  ];


  return (
    <TabFrame
      icon="apprentice"
      title="Apprentice track impact"
      subtitle={`The race between ${isCoding ? 'New Hires and Transitions' : 'OJT and Nesting'}.`}
      controls={
        <Segmented
          label="Track"
          value={uiState.apprenticeViewMode}
          options={[{ value: 'coding', label: 'Coding Track' }, { value: 'phase', label: 'Operational Phase' }]}
          onChange={(next) => uiHandlers.setApprenticeViewMode(next)}
        />
      }
    >
      <table className="cso-table cso-table-thirds">
        <thead>
          <tr>
            <th className="is-left">Metric</th>
            <th
              className="is-clickable"
              onClick={() => handleCohortClick(isCoding ? 'New Hire' : 'OJT')}
              title={`Click to deeply filter floor roster by ${titleA}`}
            >
              <div className="cohort-name">{titleA}</div>
              <div className="cohort-count">{groupA.length} Agents</div>
            </th>
            <th
              className="is-clickable"
              onClick={() => handleCohortClick(isCoding ? 'Transition' : 'Nesting')}
              title={`Click to deeply filter floor roster by ${titleB}`}
            >
              <div className="cohort-name">{titleB}</div>
              <div className="cohort-count">{groupB.length} Agents</div>
            </th>
          </tr>
        </thead>
        <tbody>
          {metricsToRender.map((m) => {
            const target = getDynamicTarget(m.key, 1);
            const isReverse = (METRIC_CONFIG as Record<string, any>)[m.key]?.reverse;
            const formatVal = (v: any, type: any) => type === 'count' ? Math.round(v) : Number(v).toFixed(1) + '%';
            const getColor = (v: any) => {
              if (!target || v === 0) return '#0b0f19';
              return (isReverse ? v <= target : v >= target) ? '#059669' : '#dc2626';
            };
            return (
              <tr key={m.key}>
                <td className="is-left cso-cell-strong">{m.label}</td>
                <td>
                  <div className="flex flex-col items-center justify-center">
                    <span className="cso-cell-value" style={{ color: m.key === 'calls' ? '#0b0f19' : getColor(m.aVal) }}>{formatVal(m.aVal, m.type)}</span>
                    {m.aSub && <span className="cso-cell-sub">{m.aSub}</span>}
                  </div>
                </td>
                <td>
                  <div className="flex flex-col items-center justify-center">
                    <span className="cso-cell-value" style={{ color: m.key === 'calls' ? '#0b0f19' : getColor(m.bVal) }}>{formatVal(m.bVal, m.type)}</span>
                    {m.bSub && <span className="cso-cell-sub">{m.bSub}</span>}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {aiTools.loadingApprentice ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 flex justify-center mt-6">
          <AiLoader message="Analyzing track performance..." color="#8b5cf6" icon="🧠" />
        </div>
      ) : aiTools.apprenticeReport && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mt-6">
          <div className="p-5 px-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <h3 className="text-lg font-extrabold m-0 text-slate-900">AI impact analysis</h3>
            <CopyReportButton text={aiTools.apprenticeReport} />
          </div>
          <div className="report-body text-[1.05rem] leading-relaxed m-0 p-6 px-8">
            <FormattedText text={aiTools.apprenticeReport} linkedEntities={uiState.linkedEntities} onEntityClick={uiHandlers.handleAiLinkClick} />
          </div>
        </div>
      )}
    </TabFrame>
  );
};
