// Extracted from App.tsx (Phase 3 move-only refactor) — behavior must stay identical.
import { ParetoColumn } from '../../../../components/shared';
import { useDashboard } from '../../hooks';

// ─── Floor Outliers Tab ──────────────────────────────────────
export const FloorOutliersTab = () => {
  const { metrics, uiState, uiHandlers, aiTools } = useDashboard();
  const handleOutlierClick = (item: any, sortKey: any, sortDir: any) => {
      const supName = uiState.outlierLevel === 'agent' ? item.agent.supervisor : item.agent.name;
      const supObj = metrics.supervisorStats.find((s: any) => s.name === supName);
      if (supObj) {
          uiHandlers.setSelectedSupervisorObj(supObj);
          uiHandlers.setActiveModal('supervisor');
          uiHandlers.setSupTab('roster');
          if (sortKey) {
              uiHandlers.setAgentSortConfig({ key: sortKey, direction: sortDir });
          }
          aiTools.generateExpertReport(supObj);
      }
  };


  return (
    <div className="flex flex-col gap-8 p-8 bg-slate-50 border-t border-slate-200">
      <div className="bg-white rounded-xl p-8 border border-slate-200 shadow-sm">
        <div className="flex justify-between items-center mb-6 gap-4 border-b border-slate-100 pb-4 overflow-x-auto">
          <h3 className="text-lg md:text-xl m-0 flex items-center gap-2 font-extrabold text-slate-900 whitespace-nowrap flex-shrink-0">
            <span>{uiState.outlierMode === 'offenders' ? '⚠️' : '🌟'}</span> Top 10 {uiState.outlierMode === 'offenders' ? 'Offenders' : 'Performers'} ({uiState.outlierLevel === 'agent' ? 'Agents' : 'Supervisors'})
          </h3>
          
          <div className="flex gap-4 items-center whitespace-nowrap flex-shrink-0 min-w-max">
            <div className="flex bg-slate-50 rounded-lg border border-slate-200 overflow-hidden shadow-sm p-1 gap-1">
              <button 
                onClick={() => uiHandlers.setOutlierLevel('agent')}
                className="px-4 py-2 border-none font-bold cursor-pointer text-sm transition-all rounded-md"
                style={{ background: uiState.outlierLevel === 'agent' ? '#ffffff' : 'transparent', color: uiState.outlierLevel === 'agent' ? '#0b0f19' : '#64748b', boxShadow: uiState.outlierLevel === 'agent' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >Agent</button>
              <button 
                onClick={() => uiHandlers.setOutlierLevel('supervisor')}
                className="px-4 py-2 border-none font-bold cursor-pointer text-sm transition-all rounded-md"
                style={{ background: uiState.outlierLevel === 'supervisor' ? '#ffffff' : 'transparent', color: uiState.outlierLevel === 'supervisor' ? '#0b0f19' : '#64748b', boxShadow: uiState.outlierLevel === 'supervisor' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >Supervisor</button>
            </div>
            
            <div className="flex bg-slate-50 rounded-lg border border-slate-200 overflow-hidden shadow-sm p-1 gap-1">
              <button 
                onClick={() => uiHandlers.setOutlierMode('offenders')}
                className="px-4 py-2 border-none font-bold cursor-pointer text-sm transition-all rounded-md"
                style={{ background: uiState.outlierMode === 'offenders' ? '#fee2e2' : 'transparent', color: uiState.outlierMode === 'offenders' ? '#991b1b' : '#64748b', boxShadow: uiState.outlierMode === 'offenders' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >Negative (Offenders)</button>
              <button 
                onClick={() => uiHandlers.setOutlierMode('performers')}
                className="px-4 py-2 border-none font-bold cursor-pointer text-sm transition-all rounded-md"
                style={{ background: uiState.outlierMode === 'performers' ? '#d1fae5' : 'transparent', color: uiState.outlierMode === 'performers' ? '#065f46' : '#64748b', boxShadow: uiState.outlierMode === 'performers' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >Positive (Performers)</button>
            </div>
          </div>
        </div>


        <p className="text-sm m-0 mb-6 leading-relaxed text-slate-500">
          {uiState.outlierMode === 'offenders' ? `Focus coaching and intervention on these specific ${uiState.outlierLevel}s.` : `Analyze and duplicate the successful behaviors of these top ${uiState.outlierLevel}s.`}
        </p>
        
        {uiState.outlierMode === 'offenders' ? (
          <div className="grid grid-cols-auto-300 gap-6">
             <ParetoColumn title="Top CSAT Detractor Drivers" icon="💔" data={metrics.paretoData[uiState.outlierLevel].offenders.byDetractors} colorObj={{ light: '#fecaca', dark: '#dc2626' }} valKey="detractors" labelFn={(i: any) => `${Math.round(i.data.detractors)} Detractors`} onItemClick={(item: any) => handleOutlierClick(item, 'vxs', 'asc')} />
             <ParetoColumn title="Top 3DR Repeat Drivers" icon="🔁" data={metrics.paretoData[uiState.outlierLevel].offenders.byRepeats} colorObj={{ light: '#fecaca', dark: '#dc2626' }} valKey="repeats3d" labelFn={(i: any) => i.data.resolve3d != null ? Number(i.data.resolve3d).toFixed(2) + '%' : '-'} onItemClick={(item: any) => handleOutlierClick(item, 'resolve3d', 'asc')} />
             <ParetoColumn title="Top Hand-off Drivers" icon="🤝" data={metrics.paretoData[uiState.outlierLevel].offenders.byHandoffs} colorObj={{ light: '#fecaca', dark: '#dc2626' }} valKey="handoffsCount" labelFn={(i: any) => `${Math.round(i.data.handoffsCount)} Hand-offs`} onItemClick={(item: any) => handleOutlierClick(item, 'handoffs', 'desc')} />
          </div>
        ) : (
          <div className="grid grid-cols-auto-300 gap-6">
             <ParetoColumn title={uiState.outlierLevel === 'agent' ? "Clean CSAT (100%)" : "Top CSAT Promoters"} icon="🌟" data={metrics.paretoData[uiState.outlierLevel].performers.byPromoters} colorObj={{ light: '#a7f3d0', dark: '#059669' }} valKey="promoters" labelFn={(i: any) => `${Math.round(i.data.promoters)} Promoters`} onItemClick={(item: any) => handleOutlierClick(item, 'vxs', 'desc')} />
             <ParetoColumn title="Top 3DR %" icon="✅" data={metrics.paretoData[uiState.outlierLevel].performers.byResolves} colorObj={{ light: '#a7f3d0', dark: '#059669' }} valKey="resolveTotalContacts3d" labelFn={(i: any) => `${Number(i.data.resolve3d).toFixed(2)}%`} onItemClick={(item: any) => handleOutlierClick(item, 'resolve3d', 'desc')} />
             <ParetoColumn title="Top Sellers (Sales)" icon="📱" data={metrics.paretoData[uiState.outlierLevel].performers.byPhoneAdds} colorObj={{ light: '#a7f3d0', dark: '#059669' }} valKey="phoneAdds" labelFn={(i: any) => `${Math.round(i.data.phoneAdds || 0)} Units`} onItemClick={(item: any) => handleOutlierClick(item, 'phoneAdds', 'desc')} />
          </div>
        )}
      </div>
    </div>
  );
};
