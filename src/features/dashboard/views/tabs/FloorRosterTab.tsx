// Extracted from App.tsx (Phase 3 move-only refactor) — behavior must stay identical.
import { DropZone } from '../../../../components/dropZone';
import { MetricCell } from '../../../../components/shared';
import { COL_DEFINITIONS, getDynamicTarget } from '../../config';
import { calculateTrend } from '../../helpers';
import { useDashboard } from '../../hooks';

// ─── Floor Roster Tab ──────────────────────────────────────
export const FloorRosterTab = () => {
  const { dashData, metrics, aiTools, uiState, uiHandlers } = useDashboard();
  return (
  <div className="table-scroll-area">
    <table className="roster-table" style={{ minWidth: '100%', margin: 0 }}>
      <thead className="bg-slate-50">
        <tr>
          <th className="bg-slate-50 text-slate-700 border-b border-slate-300 cursor-pointer select-none" onClick={() => uiHandlers.handleSortChange('name')}>
            Supervisor {(uiState.sortConfig.key === 'name' || uiState.sortConfig.key === 'outlier') && <span className="sort-icon">{uiState.sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
          </th>

          {COL_DEFINITIONS.map(col => uiState.visibleCols[col.stateKey] && (
            <th key={col.key} className="bg-slate-50 text-slate-700 border-b border-slate-300 text-center cursor-pointer select-none" onClick={() => uiHandlers.handleSortChange(col.key)}>
              {col.label} {uiState.sortConfig.key === col.key && <span className="sort-icon">{uiState.sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
            </th>
          ))}
          {uiState.visibleCols.trajectory && <th className="bg-slate-50 text-slate-700 border-b border-slate-300 text-center cursor-pointer select-none" onClick={() => uiHandlers.handleSortChange('trajectory')}>
            Trend {uiState.sortConfig.key === 'trajectory' && <span className="sort-icon">{uiState.sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
          </th>}
        </tr>
      </thead>
      <tbody>
        {(() => {
          const queries = uiState.searchQuery.toLowerCase().split(',').map((q: any) => q.trim()).filter((q: any) => q);
          let activeOamName: string | null = null;
          
          if (queries.length > 0) {
              const searchedOams = [...new Set(dashData.agents.map((a: any) => a.oam).filter((o: any) => o && queries.some((q: any) => o.toLowerCase().includes(q))))];
              if (searchedOams.length === 1) {
                  activeOamName = searchedOams[0] as string;
              }
          }


          const rollupRow = activeOamName ? (
            <tr key="oam-rollup-row" className="bg-slate-200 border-b-2 border-slate-300 font-extrabold cursor-default transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
              <td className="p-3 px-6 text-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🎯</span>
                  <div className="flex flex-col">
                     <span>{activeOamName} (OAM Overall)</span>
                     <span className="text-xs text-slate-500 font-normal mt-0.5">{metrics.sortedSupervisors.length} Supervisors</span>
                  </div>
                </div>
              </td>
              {COL_DEFINITIONS.map(col => uiState.visibleCols[col.stateKey] && (
                 <td key={`rollup-${col.key}`} className="p-3 px-6 text-center bg-slate-200">
                   <MetricCell 
                     value={metrics.activeLeaderData[col.key]} 
                     target={getDynamicTarget(col.stateKey, metrics.activeLeaderData.activeAgentCount || 1)} 
                     reverse={col.reverse} 
                     isOff={metrics.activeLeaderData.isOff} 
                     isInteger={col.isInteger} 
                   />
                 </td>
              ))}
              {uiState.visibleCols.trajectory && <td className="bg-slate-200">
                <div className="text-center w-full">
                  {metrics.activeLeaderData.isOff ? (
                    <span className="text-xs text-slate-500 italic">-</span>
                  ) : (
                    <span className="text-xs font-extrabold px-2 py-1 rounded whitespace-nowrap" 
                          style={{ 
                            color: calculateTrend(metrics.activeLeaderData, metrics.mtdLeaderData).direction === 'up' ? '#10B981' : calculateTrend(metrics.activeLeaderData, metrics.mtdLeaderData).direction === 'down' ? '#D52B1E' : '#64748b', 
                            background: calculateTrend(metrics.activeLeaderData, metrics.mtdLeaderData).direction === 'up' ? '#ecfdf5' : calculateTrend(metrics.activeLeaderData, metrics.mtdLeaderData).direction === 'down' ? '#fef2f2' : '#f1f5f9' 
                          }}>
                       {calculateTrend(metrics.activeLeaderData, metrics.mtdLeaderData).label} ({calculateTrend(metrics.activeLeaderData, metrics.mtdLeaderData).diffStr})
                    </span>
                  )}
                </div>
              </td>}
            </tr>
          ) : null;


          return (
             <>
                {rollupRow}
                {metrics.sortedSupervisors.map((supObj: any) => {
                  const supData = supObj.activeData;
                  const isOffToday = supObj.isOff;
                  const trendInfo = supObj.trend;
                  return (
                    <tr 
                      key={supObj.name} 
                      className={`roster-row transition-all duration-300 hover:-translate-y-1 hover:shadow-md relative z-10 ${uiState.selectedSupervisorObj?.name === supObj.name ? 'active' : ''}`}
                      style={{ opacity: isOffToday ? 0.6 : 1 }}
                      onClick={() => {
                          if (!isOffToday) {
                              uiHandlers.setSelectedSupervisorObj(supObj);
                              uiHandlers.setActiveModal('supervisor');
                              aiTools.generateExpertReport(supObj);
                          }
                      }}
                    >
                      <td className="font-semibold p-3 px-6">
                        <div className="flex items-center gap-1">
                          <span>{supObj.name}</span>
                          {supObj.isHighRisk && !isOffToday && (
                            <span className="text-base cursor-help" title="High Risk Trend">⚠️</span>
                          )}
                        </div>
                        <span className="block text-xs text-slate-500 font-normal">
                          {supObj.agentCount} Agents
                        </span>
                      </td>
                      {COL_DEFINITIONS.map(col => uiState.visibleCols[col.stateKey] && (
                         <td key={col.key} className="p-3 px-6 text-center">
                           <MetricCell value={supData[col.key]} target={getDynamicTarget(col.stateKey, supObj.agentCount)} reverse={col.reverse} isOff={isOffToday} isInteger={col.isInteger} />
                         </td>
                      ))}
                      {uiState.visibleCols.trajectory && <td>
                        <div className="text-center w-full">
                          {isOffToday ? (
                            <span className="text-xs text-slate-400 italic">-</span>
                          ) : (
                            <span className="text-xs font-extrabold px-2 py-1 rounded whitespace-nowrap" style={{ color: trendInfo.direction === 'up' ? '#10B981' : trendInfo.direction === 'down' ? '#D52B1E' : '#64748b', background: trendInfo.direction === 'up' ? '#ecfdf5' : trendInfo.direction === 'down' ? '#fef2f2' : '#f1f5f9' }}>
                               {trendInfo.label} ({trendInfo.diffStr})
                            </span>
                          )}
                        </div>
                      </td>}
                    </tr>
                  );
                })}
                {metrics.sortedSupervisors.length === 0 && (
                  <tr>
                    <td colSpan={COL_DEFINITIONS.length + 2} className="text-center p-0">
                      {dashData.hasUploadedData
                        ? <div className="p-10 text-slate-500">{`No supervisors found matching "${uiState.searchQuery}"`}</div>
                        : <DropZone />
                      }
                    </td>
                  </tr>
                )}
             </>
          );
        })()}
      </tbody>
    </table>
  </div>
);
};
