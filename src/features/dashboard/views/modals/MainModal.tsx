// Extracted from App.tsx (Phase 4 move-only refactor) — behavior must stay identical.
import React, { useMemo } from 'react';
import { METRIC_CONFIG, getDynamicTarget, COL_DEFINITIONS } from '../../config';
import { GeminiLoader, FormattedText, SubMetricCard, MetricCell } from '../../../../components/shared';
import { useDashboard } from '../../hooks';

// ==== AI assistant content ==== 
// Source: src/App.tsx -> AskAiContent
// ==== Ask AI modal content ==== 
// Source: src/App.tsx -> AskAiContent
const AskAiContent = ({ aiTools, uiState, uiHandlers }: any) => {
  const smartChips = [
    "🔍 Why did 3DR drop yesterday?",
    "🔍 Who has the highest Hand-offs vs NCW?",
    "🔍 Which Supervisor is driving the most Sales?"
  ];


  return (
    <div className="flex flex-col gap-6 animate-slide-down bg-slate-50 p-6 rounded-xl border border-slate-200">
      <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
        <div className="mb-4">
          <h3 className="text-xl font-extrabold flex items-center gap-2 mb-1 text-slate-900"><span>🔍</span> Data Assistant</h3>
        </div>
        <div className="chat-input-area border border-slate-300 rounded-lg p-1 bg-slate-50 focus-within:border-blue-500 transition-all shadow-sm flex items-center">
          <svg className="ml-3 text-slate-400" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input 
            type="text" className="chat-input border-none bg-transparent flex-1 text-slate-900 placeholder:text-slate-400 !outline-none !shadow-none" placeholder="e.g. Which supervisor has the highest AHT? or What is my overall C-Sat?"
            value={aiTools.askAiQuery} onChange={(e) => aiTools.setAskAiQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && aiTools.handleAskAiSubmit()} disabled={aiTools.askAiLoading}
          />
          <button className="gemini-btn w-auto !m-1" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.2)' }} onClick={() => aiTools.handleAskAiSubmit()} disabled={aiTools.askAiLoading || !aiTools.askAiQuery.trim()}>Ask</button>
        </div>
        
        {/* Smart Chips Section */}
        <div className="flex flex-wrap gap-2 mt-4">
          {smartChips.map((chip, idx) => (
            <button 
              key={idx}
              onClick={() => aiTools.handleAskAiSubmit(chip)}
              disabled={aiTools.askAiLoading}
              className="px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-600 text-xs font-semibold cursor-pointer hover:bg-slate-100 hover:text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {chip}
            </button>
          ))}
        </div>
        
        {aiTools.askAiLoading && (
          <div className="flex justify-center p-6 mt-4"><GeminiLoader message="Analyzing dashboard data..." icon="🧠" color="#3b82f6" /></div>
        )}
        
        {aiTools.askAiResponse && !aiTools.askAiLoading && (
          <div className="ai-output-box !mb-0 mt-6 border-blue-200 bg-blue-50">
              <div className="text-xs font-extrabold text-blue-800 uppercase mb-3 flex items-center gap-2"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> Data Assistant Analysis</div>
              <div className="whitespace-pre-wrap text-slate-800 text-[1.05rem] leading-relaxed"><FormattedText text={aiTools.askAiResponse} linkedEntities={uiState.linkedEntities} onEntityClick={uiHandlers.handleAiLinkClick} /></div>
          </div>
        )}
      </div>
    </div>
  );
};


const SupervisorModalContent = () => {
  const { dashData, metrics, aiTools, uiState, uiHandlers } = useDashboard();
  const supName = uiState.selectedSupervisorObj?.name;

  // ── Memoized: only recomputes when supervisor, timeframe, or sort changes ──
  const supAgentsList = useMemo(() =>
    dashData.agents
      .filter((a: any) => a.supervisor === supName)
      .map((a: any) => ({ agent: a, data: dashData.getAgentDataForTimeframe(a, dashData.activeTimeframe) }))
      .filter((item: any) => !item.data.isOff),
    [dashData.agents, supName, dashData.activeTimeframe, dashData.getAgentDataForTimeframe]
  );

  const topDetractors = useMemo(() => [...supAgentsList].sort((a, b) => (b.data.detractors || 0) - (a.data.detractors || 0)).filter(a => a.data.detractors >= 1).slice(0, 3), [supAgentsList]);
  const topRepeats    = useMemo(() => [...supAgentsList].sort((a, b) => (b.data.repeats3d || 0) - (a.data.repeats3d || 0)).filter(a => a.data.repeats3d >= 1).slice(0, 3), [supAgentsList]);
  const topPromoters  = useMemo(() => [...supAgentsList].filter(a => a.data.vxs === 100 && a.data.promoters >= 1).sort((a, b) => (b.data.promoters || 0) - (a.data.promoters || 0)).slice(0, 3), [supAgentsList]);
  const topResolvers  = useMemo(() => [...supAgentsList].filter(a => a.data.resolve3d != null).sort((a, b) => b.data.resolve3d - a.data.resolve3d).slice(0, 3), [supAgentsList]);

  const sortedAgentsList = useMemo(() => {
    const sorted = [...supAgentsList];
    sorted.sort((a, b) => {
      let valA, valB;
      if (uiState.agentSortConfig.key === 'name') {
        valA = a.agent.name.toLowerCase(); valB = b.agent.name.toLowerCase();
        if (valA < valB) return uiState.agentSortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return uiState.agentSortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      } else {
        valA = a.data[uiState.agentSortConfig.key]; valB = b.data[uiState.agentSortConfig.key];
        valA = valA === null || valA === undefined || isNaN(valA) ? -Infinity : Number(valA);
        valB = valB === null || valB === undefined || isNaN(valB) ? -Infinity : Number(valB);
        if (valA < valB) return uiState.agentSortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return uiState.agentSortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      }
    });
    return sorted;
  }, [supAgentsList, uiState.agentSortConfig]);

  if (!uiState.selectedSupervisorObj) return null;

  return (
    <div className="flex flex-col gap-6 mt-2 w-full min-w-0">
      {uiState.supTab === 'roster' && (
        <div className="flex flex-col gap-6 animate-slide-down w-full min-w-0">
          <div className="p-5 bg-slate-50 rounded-xl border border-slate-200">
            <div className="text-sm font-extrabold text-slate-900 uppercase mb-4 border-b border-slate-200 pb-2 flex items-center gap-2">
               <span className="text-xl">📊</span> Team KPIs
            </div>
            <div className="grid grid-cols-6 gap-4">
              {(() => {
                  const liveSupObj = metrics.supervisorStats.find((s: any) => s.name === uiState.selectedSupervisorObj.name) || uiState.selectedSupervisorObj;
                  const aData = liveSupObj.activeData;


                  return (
                      <>
                        {COL_DEFINITIONS.filter(col => uiState.visibleCols[col.stateKey]).map(col => {
                          let decimals = 2;
                          if (['aht', 'hold', 'phoneAdds', 'vhi'].includes(col.stateKey)) decimals = 0;
                          else if (['resolve2hr', 'vxs', 'resolve3d', 'handoffs', 'vtt'].includes(col.stateKey)) decimals = 1;
                          return (
                            <SubMetricCard 
                              key={col.label} label={col.label} val={aData[col.stateKey]} 
                              metricKey={col.stateKey} agentCount={liveSupObj.agentCount} 
                              decimals={decimals} prefix={col.stateKey === 'netOcc' ? '$' : ''} suffix={(METRIC_CONFIG as Record<string, any>)[col.stateKey].format} 
                            />
                          );
                        })}
                        {COL_DEFINITIONS.filter(col => uiState.visibleCols[col.stateKey]).length === 0 && (
                          <div className="col-span-full p-2 text-center text-slate-500 text-sm">No KPIs selected. Please toggle metrics in Settings.</div>
                        )}
                      </>
                  );
              })()}
            </div>
          </div>


          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm w-full min-w-0">
            <table className="roster-table" style={{ minWidth: 0, width: '100%', margin: 0 }}>
              <thead className="bg-slate-900">
                <tr>
                  <th className="bg-slate-900 text-white border-b-2 border-slate-800 cursor-pointer select-none" onClick={() => uiHandlers.handleAgentSortChange('name')}>
                    Agent Name {uiState.agentSortConfig.key === 'name' && <span className="sort-icon">{uiState.agentSortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                  </th>
                  {COL_DEFINITIONS.map(col => uiState.visibleCols[col.stateKey] && (
                    <th key={col.key} className="bg-slate-900 text-white border-b-2 border-slate-800 text-center cursor-pointer select-none" onClick={() => uiHandlers.handleAgentSortChange(col.stateKey)}>
                      {col.label} {uiState.agentSortConfig.key === col.stateKey && <span className="sort-icon">{uiState.agentSortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                 {sortedAgentsList.map(item => (
                  <tr key={item.agent.ccms} className={`roster-row transition-all duration-300 hover:-translate-y-1 hover:shadow-md relative z-10 ${uiState.highlightedAgentId === item.agent.ccms ? 'bg-blue-100 outline outline-2 outline-blue-500 rounded-md z-20' : ''}`}>
                     <td className="font-semibold p-3 px-6">{item.agent.name}</td>
                     {COL_DEFINITIONS.map(col => uiState.visibleCols[col.stateKey] && (
                        <td key={col.key} className="p-3 px-6 text-center">
                          <MetricCell value={item.data[col.stateKey]} target={getDynamicTarget(col.stateKey, 1)} reverse={col.reverse} isInteger={col.isInteger} />
                        </td>
                     ))}
                  </tr>
                 ))}
              </tbody>
            </table>
          </div>
        </div>
      )}


      {uiState.supTab === 'outliers' && (
        <div className="flex flex-col gap-6 animate-slide-down">
          <div className="grid grid-cols-2 gap-6">
            <div className="p-6 bg-white rounded-xl border border-red-200 shadow-sm">
              <div className="text-lg font-extrabold text-red-800 uppercase mb-4 flex items-center gap-2 border-b border-red-100 pb-3">
                 <span className="text-2xl">⚠️</span> Negative Outliers
              </div>
              <div className="flex flex-col gap-4">
                <div className="bg-red-50 p-4 rounded-lg">
                  <div className="text-sm font-extrabold text-red-900 uppercase mb-3">CSAT Detractors</div>
                  {topDetractors.length > 0 ? topDetractors.map(x => (
                    <div key={x.agent.ccms} className="flex justify-between text-base mb-2 border-b border-red-100 pb-1">
                      <span className="text-slate-700 font-semibold">{x.agent.name}</span><span className="text-red-600 font-bold">{Math.round(x.data.detractors)}</span>
                    </div>
                  )) : <div className="text-sm text-slate-500">None</div>}
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <div className="text-sm font-extrabold text-red-900 uppercase mb-3">3DR Repeats</div>
                  {topRepeats.length > 0 ? topRepeats.map(x => (
                    <div key={x.agent.ccms} className="flex justify-between text-base mb-2 border-b border-red-100 pb-1">
                      <span className="text-slate-700 font-semibold">{x.agent.name}</span><span className="text-red-600 font-bold">{Math.round(x.data.repeats3d)}</span>
                    </div>
                  )) : <div className="text-sm text-slate-500">None</div>}
                </div>
              </div>
            </div>


            <div className="p-6 bg-white rounded-xl border border-emerald-200 shadow-sm">
              <div className="text-lg font-extrabold text-emerald-800 uppercase mb-4 flex items-center gap-2 border-b border-emerald-100 pb-3">
                 <span className="text-2xl">🌟</span> Top Performers
              </div>
              <div className="flex flex-col gap-4">
                <div className="bg-emerald-50 p-4 rounded-lg">
                  <div className="text-sm font-extrabold text-emerald-900 uppercase mb-3">Clean CSAT (100%)</div>
                  {topPromoters.length > 0 ? topPromoters.map(x => (
                    <div key={x.agent.ccms} className="flex justify-between text-base mb-2 border-b border-emerald-100 pb-1">
                      <span className="text-slate-700 font-semibold">{x.agent.name}</span><span className="text-emerald-600 font-bold">{Math.round(x.data.promoters)}</span>
                    </div>
                  )) : <div className="text-sm text-slate-500">None</div>}
                </div>
                <div className="bg-emerald-50 p-4 rounded-lg">
                  <div className="text-sm font-extrabold text-emerald-900 uppercase mb-3">Top 3DR</div>
                  {topResolvers.length > 0 ? topResolvers.map(x => (
                    <div key={x.agent.ccms} className="flex justify-between text-base mb-2 border-b border-emerald-100 pb-1">
                      <span className="text-slate-700 font-semibold">{x.agent.name}</span><span className="text-emerald-600 font-bold">{Number(x.data.resolve3d).toFixed(1)}%</span>
                    </div>
                  )) : <div className="text-sm text-slate-500">None</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}


      {uiState.supTab === 'strategy' && (
        <div className="flex flex-col gap-6 animate-slide-down bg-slate-50 p-6 rounded-xl border border-slate-200">
          
          <div className="flex flex-col gap-3">
             <div className="text-xs font-extrabold text-slate-400 uppercase px-2">AI Toolbelt</div>
             
             <div className="flex flex-wrap gap-2 pb-4 border-b border-slate-200">
               <button 
                 onClick={() => uiHandlers.setActiveSupAiTool('report')} 
                 className={`px-3 py-2 rounded-lg font-bold transition-all flex items-center gap-2 text-sm ${uiState.activeSupAiTool === 'report' ? 'bg-white shadow-sm border border-slate-200 text-slate-900' : 'text-slate-600 hover:bg-slate-200 border border-transparent'}`}
               >
                 <span className="text-base">🤖</span> Sup Report
               </button>


               <button 
                 onClick={() => uiHandlers.setActiveSupAiTool('burnout')} 
                 className={`px-3 py-2 rounded-lg font-bold transition-all flex items-center gap-2 text-sm ${uiState.activeSupAiTool === 'burnout' ? 'bg-white shadow-sm border border-slate-200 text-red-600' : 'text-slate-600 hover:bg-slate-200 border border-transparent'}`}
               >
                 <span className="text-base">🧠</span> Behavioral Scan
               </button>
             </div>
          </div>


          <div className="w-full flex flex-col gap-6">
            {uiState.activeSupAiTool === null && (
              <div className="bg-white border border-slate-200 rounded-xl p-12 shadow-sm flex flex-col items-center justify-center text-center mt-2">
                <span className="text-5xl mb-4">✨</span>
                <h3 className="text-2xl font-extrabold text-slate-800 mb-2">Supervisor Action Hub</h3>
                <p className="text-slate-500 max-w-md">Select a tool from the toolbelt above to generate personalized coaching scripts, reports, or turnaround plans.</p>
              </div>
            )}


            {uiState.activeSupAiTool === 'burnout' && (() => {
              const supBurnoutList = metrics.orgBurnoutList.filter((item: any) => item.agent.supervisor === uiState.selectedSupervisorObj.name);
              return (
                <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
                  <div className="mb-6 border-b border-slate-100 pb-4">
                    <h3 className="text-xl font-extrabold flex items-center gap-2 mb-1 text-red-700"><span>🧠</span> Behavioral Scan Watchlist</h3>
                    <p className="text-sm text-slate-500 m-0">Agents flagged for extreme operational strain. Rank priority: AHT &gt; Net OCC &gt; DPC &gt; Hold.</p>
                  </div>


                  {supBurnoutList.length === 0 ? (
                    <div className="text-center p-5 text-slate-500 italic">No agents currently flagged for high behavioral risk on this team.</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {supBurnoutList.map((item: any, idx: any) => {
                        const isExpanded = uiState.expandedBurnoutAgentId === item.agent.ccms;
                        return (
                          <div key={item.agent.ccms} className="flex flex-col bg-red-50 border border-red-200 rounded-lg overflow-hidden shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
                            <div
                              onClick={() => uiHandlers.setExpandedBurnoutAgentId(isExpanded ? null : item.agent.ccms)}
                              className="flex justify-between p-4 px-5 items-center cursor-pointer transition-all"
                              style={{ backgroundColor: isExpanded ? '#fee2e2' : 'transparent' }}
                              onMouseOver={(e) => { if (!isExpanded) e.currentTarget.style.backgroundColor = '#fee2e2'; }}
                              onMouseOut={(e) => { if (!isExpanded) e.currentTarget.style.backgroundColor = 'transparent'; }}
                            >
                              <div className="flex items-center gap-4">
                                  <div className="text-2xl font-black text-red-600 w-8 text-center">#{idx + 1}</div>
                                  <div>
                                      <strong className="block text-base text-red-800">{item.agent.name}</strong>
                                      <span className="text-xs font-semibold text-red-700 opacity-80 uppercase tracking-wide">Sup: {item.agent.supervisor}</span>
                                  </div>
                              </div>
                              <div className="text-right">
                                  <strong className="block text-red-600 text-xl font-extrabold">{item.highMetricsCount}/4 Missed</strong>
                              </div>
                            </div>


                            {isExpanded && (
                              <div className="p-5 bg-white border-t border-dashed border-red-200">
                                <div className="grid grid-cols-auto-110 gap-3">
                                   {COL_DEFINITIONS.map(col => {
                                      const val = item.data[col.stateKey];
                                      const isMissing = val === null || val === undefined || isNaN(val) || val === '';
                                      let displayVal: string | number = '-';
                                      if (!isMissing) {
                                          if (['phoneAdds', 'vhi', 'aht', 'hold'].includes(col.stateKey)) displayVal = Math.round(val);
                                          else displayVal = Number(val).toFixed(2);
                                      }
                                      let valColor = '#0b0f19';
                                      const tgt = getDynamicTarget(col.stateKey, 1);
                                      if (!isMissing && tgt !== null && tgt !== undefined) {
                                          const isGood = col.reverse ? val <= tgt : val >= tgt;
                                          valColor = isGood ? '#10B981' : '#D52B1E';
                                      }
                                      return (
                                        <div key={col.key} className="bg-slate-50 border border-slate-200 p-3 rounded-md text-center shadow-sm">
                                          <div className="text-xs text-slate-500 uppercase font-extrabold mb-1">{col.label}</div>
                                          <div className="text-xl font-black" style={{ color: valColor }}>{displayVal}{!isMissing ? col.format : ''}</div>
                                        </div>
                                      )
                                   })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}


            {uiState.activeSupAiTool === 'report' && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                  <h3 className="text-xl font-extrabold flex items-center gap-2 mb-1 text-slate-900"><span>🤖</span> AI Supervisor Report</h3>
                  <p className="text-sm text-slate-500 m-0">Data-driven insights connecting the dots for this team.</p>
                </div>
                <div className="report-body mt-0 p-6 text-[1.05rem]">
                  {aiTools.loading ? (
                    <div className="flex justify-center p-6"><GeminiLoader message="Brewing up Trajectory Report..." /></div>
                  ) : <FormattedText text={aiTools.report} linkedEntities={uiState.linkedEntities} onEntityClick={uiHandlers.handleAiLinkClick} />}
                </div>
              </div>
            )}
          </div>
        </div>
      )}


    </div>
  );
};


// ==== Main modal shell ==== 
// Source: src/App.tsx -> MainModal
export const MainModal = React.memo(() => {
  const { aiTools, uiState, uiHandlers } = useDashboard();
  if (!uiState.activeModal) return null;


  return (
    <div className="modal-backdrop open" onClick={uiHandlers.closeModal}>
      <div className="main-modal" onClick={(e) => e.stopPropagation()}>
        <div className="main-modal-header">
          <h2 className="m-0 text-xl font-bold text-slate-900">
            {uiState.activeModal === 'askAi' ? 'Data Assistant' : 
             uiState.activeModal === 'supervisor' && uiState.selectedSupervisorObj ? `Supervisor Overview: ${uiState.selectedSupervisorObj.name}` : 'Details'}
          </h2>
          <button className="close-btn" onClick={uiHandlers.closeModal}>✕ Close</button>
        </div>
        
        {uiState.activeModal === 'supervisor' && (
          <div className="bg-slate-50 px-8 py-4 border-b border-slate-200 flex gap-2">
            {[
              { id: 'roster', label: '📋 Team Roster' },
              { id: 'outliers', label: '⚠️ Outliers' },
              { id: 'strategy', label: '⚡ AI Strategy Hub' }
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => uiHandlers.setSupTab(tab.id)}
                className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${uiState.supTab === tab.id ? 'bg-white shadow-sm border border-slate-200 text-slate-900' : 'text-slate-500 hover:bg-slate-200 border border-transparent'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}


        <div className="main-modal-content">
          {uiState.activeModal === 'askAi' && <AskAiContent aiTools={aiTools} uiState={uiState} uiHandlers={uiHandlers} />}
          {uiState.activeModal === 'supervisor' && <SupervisorModalContent />}
        </div>
      </div>
    </div>
  );
});


