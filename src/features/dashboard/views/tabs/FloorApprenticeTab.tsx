// Extracted from App.tsx (Phase 3 move-only refactor) — behavior must stay identical.
import { FormattedText, GeminiLoader } from '../../../../components/shared';
import { METRIC_CONFIG, getDynamicTarget } from '../../config';
import { aggregateTeamMetrics } from '../../helpers';
import { useDashboard } from '../../hooks';
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
    <div className="flex flex-col gap-6 p-8 bg-slate-50 border-t border-slate-200">
       <div className="flex justify-between items-start flex-wrap gap-4">
           <div>
             <h3 className="text-2xl m-0 flex items-center gap-2 font-extrabold text-slate-900">
               <span>🎓</span> Apprentice Track Impact
             </h3>
             <p className="text-sm m-0 mt-1 text-slate-500">
               The race between {isCoding ? 'New Hires and Transitions' : 'OJT and Nesting'}.
             </p>
           </div>
           
           <div className="flex bg-slate-50 rounded-lg border border-slate-200 overflow-hidden shadow-sm p-1 gap-1">
              <button 
                onClick={() => uiHandlers.setApprenticeViewMode('coding')}
                className="px-4 py-2 border-none font-bold cursor-pointer text-sm transition-all rounded-md"
                style={{ background: uiState.apprenticeViewMode === 'coding' ? '#ffffff' : 'transparent', color: uiState.apprenticeViewMode === 'coding' ? '#0b0f19' : '#64748b', boxShadow: uiState.apprenticeViewMode === 'coding' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >Coding Track</button>
              <button 
                onClick={() => uiHandlers.setApprenticeViewMode('phase')}
                className="px-4 py-2 border-none font-bold cursor-pointer text-sm transition-all rounded-md"
                style={{ background: uiState.apprenticeViewMode === 'phase' ? '#ffffff' : 'transparent', color: uiState.apprenticeViewMode === 'phase' ? '#0b0f19' : '#64748b', boxShadow: uiState.apprenticeViewMode === 'phase' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >Operational Phase</button>
            </div>
       </div>


       <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
               <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="p-4 px-6 text-slate-700 font-bold uppercase text-xs w-1/3">Metric</th>
                  <th 
                    className="p-4 px-6 text-center border-l border-slate-200 w-1/3 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleCohortClick(isCoding ? 'New Hire' : 'OJT')}
                    title={`Click to deeply filter floor roster by ${titleA}`}
                  >
                      <div className="text-slate-900 font-extrabold text-base">{titleA}</div>
                      <div className="text-slate-400 text-xs font-normal mt-1">{groupA.length} Agents</div>
                  </th>
                  <th 
                    className="p-4 px-6 text-center border-l border-slate-200 w-1/3 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleCohortClick(isCoding ? 'Transition' : 'Nesting')}
                    title={`Click to deeply filter floor roster by ${titleB}`}
                  >
                      <div className="text-slate-900 font-extrabold text-base">{titleB}</div>
                      <div className="text-slate-400 text-xs font-normal mt-1">{groupB.length} Agents</div>
                  </th>
               </tr>
            </thead>
            <tbody>
               {metricsToRender.map((m, idx) => {
                  const target = getDynamicTarget(m.key, 1);
                  const isReverse = (METRIC_CONFIG as Record<string, any>)[m.key]?.reverse;
                  
                  const formatVal = (v: any, type: any) => type === 'count' ? Math.round(v) : Number(v).toFixed(1) + '%';
                  const getColor = (v: any) => {
                      if (!target || v === 0) return '#0b0f19';
                      return (isReverse ? v <= target : v >= target) ? '#059669' : '#dc2626';
                  };


                  return (
                    <tr key={m.key} className={idx !== metricsToRender.length - 1 ? "border-b border-slate-100" : ""}>
                       <td className="p-5 px-6 font-bold text-slate-800 bg-slate-50">{m.label}</td>
                       <td className="p-5 px-6 text-center border-l border-slate-100">
                           <div className="flex flex-col items-center justify-center">
                              <span className="text-lg font-extrabold" style={{ color: m.key === 'calls' ? '#0b0f19' : getColor(m.aVal) }}>{formatVal(m.aVal, m.type)}</span>
                              {m.aSub && <span className="text-xs text-slate-400 font-normal mt-1">{m.aSub}</span>}
                           </div>
                       </td>
                       <td className="p-5 px-6 text-center border-l border-slate-100">
                           <div className="flex flex-col items-center justify-center">
                              <span className="text-lg font-extrabold" style={{ color: m.key === 'calls' ? '#0b0f19' : getColor(m.bVal) }}>{formatVal(m.bVal, m.type)}</span>
                              {m.bSub && <span className="text-xs text-slate-400 font-normal mt-1">{m.bSub}</span>}
                           </div>
                       </td>
                    </tr>
                  );
               })}
            </tbody>
          </table>
       </div>


       {aiTools.loadingApprentice ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 flex justify-center">
             <GeminiLoader message="Analyzing track performance..." color="#8b5cf6" icon="🧠" />
          </div>
       ) : aiTools.apprenticeReport && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
             <div className="p-5 px-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h3 className="text-lg font-extrabold flex items-center gap-2 m-0 text-slate-900"><span>🤖</span> AI Impact Analysis</h3>
                <button className="gemini-btn btn-alt px-3 py-1.5 text-xs" onClick={() => navigator.clipboard.writeText(aiTools.apprenticeReport)}>Copy</button>
             </div>
             <div className="report-body text-[1.05rem] leading-relaxed m-0 p-6 px-8">
               <FormattedText text={aiTools.apprenticeReport} linkedEntities={uiState.linkedEntities} onEntityClick={uiHandlers.handleAiLinkClick} />
             </div>
          </div>
       )}
    </div>
  );
};
