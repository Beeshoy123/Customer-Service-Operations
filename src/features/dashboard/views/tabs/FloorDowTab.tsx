// Extracted from App.tsx (Phase 3 move-only refactor) — behavior must stay identical.
import { FormattedText, GeminiLoader, MetricCell } from '../../../../components/shared';
import { COL_DEFINITIONS, getDynamicTarget } from '../../config';
import { useDashboard } from '../../hooks';
import { useEffect } from 'react';

// ==== Day-of-week tab ==== 
// Source: src/App.tsx -> FloorDowTab
export const FloorDowTab = () => {
  const { dashData, metrics, aiTools, uiState, uiHandlers } = useDashboard();
  useEffect(() => {
    if(dashData.hasUploadedData && !aiTools.dowReport && !aiTools.loadingDow) aiTools.generateDowReport(metrics.dowData);
  }, [dashData.hasUploadedData, dashData.historicalData]);


  return (
    <div className="flex flex-col gap-6 p-6 bg-slate-50 border-t border-slate-200 rounded-b-xl">
      <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
        <div className="mb-6 border-b border-slate-100 pb-4 flex justify-between items-end flex-wrap gap-4">
          <div>
            <h3 className="text-xl font-extrabold flex items-center gap-2 mb-1 text-slate-900"><span>📅</span> Day-of-the-Week (DoW) Analysis</h3>
            <p className="text-sm text-slate-500 m-0">Aggregate performance based on historical day to identify systemic vulnerabilities.</p>
          </div>
          {aiTools.dowReport && <button className="gemini-btn btn-alt px-3 py-1.5 text-xs" onClick={() => navigator.clipboard.writeText(aiTools.dowReport)}>Copy</button>}
        </div>


        <table className="w-full text-left border-collapse mt-4 shadow-sm border border-slate-200 rounded-lg overflow-hidden">
          <thead className="bg-slate-50">
             <tr className="border-b border-slate-200">
               <th className="p-3 px-6 font-bold text-slate-700 text-sm">Day</th>
               <th className="p-3 px-6 text-center font-bold text-slate-700 text-sm">Calls Handled</th>
               {COL_DEFINITIONS.map(col => uiState.visibleCols[col.stateKey] && (
                 <th key={col.key} className="p-3 px-6 text-center font-bold text-slate-700 text-sm">{col.label}</th>
               ))}
             </tr>
          </thead>
          <tbody>
             {metrics.dowData.summary.map((row: any, i: any) => (
                <tr 
                  key={row.day} 
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-100 cursor-pointer transition-colors"
                  title={`Click to drill down into ${row.day} Team Roster`}
                  onClick={() => {
                      dashData.setActiveTimeframe('dow');
                      dashData.setSelectedDow(row.day);
                      uiHandlers.setMainTab('roster');
                  }}
                >
                  <td className="p-3 px-6 font-bold text-slate-800 flex items-center">
                     {row.day} 
                     {metrics.dowData.worstIdx === i && <span className="ml-2 text-lg animate-pulse" title="Worst Performing Day">⚠️</span>}
                  </td>
                  <td className="p-3 px-6 text-center text-slate-600 font-semibold">{row.data.calls || 0}</td>
                  
                  {COL_DEFINITIONS.map(col => uiState.visibleCols[col.stateKey] && (
                    <td key={col.key} className="p-3 px-6 text-center">
                      <MetricCell 
                        value={row.data[col.stateKey]} 
                        target={getDynamicTarget(col.stateKey, row.avgAgents)} 
                        reverse={col.reverse} 
                        isOff={row.isOff} 
                        format={col.format} 
                        isInteger={col.isInteger} 
                      />
                    </td>
                  ))}
                </tr>
             ))}
          </tbody>
        </table>


        {aiTools.loadingDow ? (
           <div className="mt-8 flex justify-center"><GeminiLoader message="Analyzing systemic day vulnerabilities..." color="#0d9488" icon="📅" /></div>
        ) : aiTools.dowReport && (
           <div className="bg-[#fff1f2] border border-[#fecdd3] rounded-xl p-8 mt-8 shadow-sm">
              <div className="report-body text-[1.05rem] leading-relaxed text-red-950 mt-0">
                <FormattedText text={aiTools.dowReport} linkedEntities={uiState.linkedEntities} onEntityClick={uiHandlers.handleAiLinkClick} />
              </div>
           </div>
        )}
      </div>
    </div>
  );
};
