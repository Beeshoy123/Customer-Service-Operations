// Extracted from App.tsx (Phase 3 move-only refactor) — behavior must stay identical.
import { ParetoColumn } from '../../../../components/shared';
import { useDashboard } from '../../hooks';
import { TabFrame, Segmented } from '../chrome/TabFrame';

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
    <TabFrame
      icon="outliers"
      title="Floor outliers / performers"
      subtitle={`Top 10 ${uiState.outlierMode === 'offenders' ? 'offenders' : 'performers'} (${uiState.outlierLevel === 'agent' ? 'agents' : 'supervisors'}). ${uiState.outlierMode === 'offenders' ? `Focus coaching and intervention on these specific ${uiState.outlierLevel}s.` : `Analyze and duplicate the successful behaviors of these top ${uiState.outlierLevel}s.`}`}
      controls={
        <>
          <Segmented
            label="Level"
            value={uiState.outlierLevel}
            options={[{ value: 'agent', label: 'Agent' }, { value: 'supervisor', label: 'Supervisor' }]}
            onChange={(next) => uiHandlers.setOutlierLevel(next)}
          />
          <Segmented
            label="Show"
            value={uiState.outlierMode}
            options={[{ value: 'offenders', label: 'Below performers' }, { value: 'performers', label: 'Top performers' }]}
            onChange={(next) => uiHandlers.setOutlierMode(next)}
          />
        </>
      }
    >
        {uiState.outlierMode === 'offenders' ? (
          <div className="outliers-grid is-offenders">
             <ParetoColumn title="Top CSAT Detractor Drivers" data={metrics.paretoData[uiState.outlierLevel].offenders.byDetractors} colorObj={{ light: '#fecaca', dark: '#dc2626' }} valKey="detractors" labelFn={(i: any) => `${Math.round(i.data.detractors)} Detractors`} onItemClick={(item: any) => handleOutlierClick(item, 'vxs', 'asc')} />
             <ParetoColumn title="Top 3DR Repeat Drivers" data={metrics.paretoData[uiState.outlierLevel].offenders.byRepeats} colorObj={{ light: '#fecaca', dark: '#dc2626' }} valKey="repeats3d" labelFn={(i: any) => i.data.resolve3d != null ? Number(i.data.resolve3d).toFixed(2) + '%' : '-'} onItemClick={(item: any) => handleOutlierClick(item, 'resolve3d', 'asc')} />
             <ParetoColumn title="Top Hand-off Drivers" data={metrics.paretoData[uiState.outlierLevel].offenders.byHandoffs} colorObj={{ light: '#fecaca', dark: '#dc2626' }} valKey="handoffsCount" labelFn={(i: any) => `${Math.round(i.data.handoffsCount)} Hand-offs`} onItemClick={(item: any) => handleOutlierClick(item, 'handoffs', 'desc')} />
          </div>
        ) : (
          <div className="outliers-grid is-performers">
             <ParetoColumn title={uiState.outlierLevel === 'agent' ? "Clean CSAT (100%)" : "Top CSAT Promoters"} data={metrics.paretoData[uiState.outlierLevel].performers.byPromoters} colorObj={{ light: '#a7f3d0', dark: '#059669' }} valKey="promoters" labelFn={(i: any) => `${Math.round(i.data.promoters)} Promoters`} onItemClick={(item: any) => handleOutlierClick(item, 'vxs', 'desc')} />
             <ParetoColumn title="Top 3DR %" data={metrics.paretoData[uiState.outlierLevel].performers.byResolves} colorObj={{ light: '#a7f3d0', dark: '#059669' }} valKey="resolveTotalContacts3d" labelFn={(i: any) => `${Number(i.data.resolve3d).toFixed(2)}%`} onItemClick={(item: any) => handleOutlierClick(item, 'resolve3d', 'desc')} />
             <ParetoColumn title="Top Sellers (Sales)" data={metrics.paretoData[uiState.outlierLevel].performers.byPhoneAdds} colorObj={{ light: '#a7f3d0', dark: '#059669' }} valKey="phoneAdds" labelFn={(i: any) => `${Math.round(i.data.phoneAdds || 0)} Units`} onItemClick={(item: any) => handleOutlierClick(item, 'phoneAdds', 'desc')} />
          </div>
        )}
    </TabFrame>
  );
};
