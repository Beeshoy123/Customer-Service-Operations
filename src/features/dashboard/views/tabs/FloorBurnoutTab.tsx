// Extracted from App.tsx (Phase 3 move-only refactor) — behavior must stay identical.
import { COL_DEFINITIONS, getDynamicTarget } from '../../config';
import { useDashboard } from '../../hooks';
import { TabFrame, EmptyState } from '../chrome/TabFrame';

// ─── Burnout Tab ──────────────────────────────────────
export const FloorBurnoutTab = () => {
  const { metrics, uiState, uiHandlers } = useDashboard();
  return (
    <TabFrame
      icon="pulse"
      title="Behavioral scan watchlist"
      subtitle="Floor-wide agents flagged for extreme operational strain. Rank priority: AHT > Net OCC > DPC > Hold."
    >
        {metrics.orgBurnoutList.length === 0 ? (
          <EmptyState icon="pulse" title="No agents flagged" hint="Nobody is currently flagged for high behavioral risk on the floor." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {metrics.orgBurnoutList.map((item: any, idx: any) => {
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
    </TabFrame>
  );
};
