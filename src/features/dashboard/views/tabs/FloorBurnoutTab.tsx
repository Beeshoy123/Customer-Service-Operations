// Extracted from App.tsx (Phase 3 move-only refactor) — behavior must stay identical.
import { COL_DEFINITIONS, getDynamicTarget } from '../../config';
import { useDashboard } from '../../hooks';

// ─── Burnout Tab ──────────────────────────────────────
export const FloorBurnoutTab = () => {
  const { metrics, uiState, uiHandlers } = useDashboard();
  return (
    <div className="flex flex-col gap-6 p-6 bg-slate-50 border-t border-slate-200 rounded-b-xl">
      <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
        <div className="mb-6 border-b border-slate-100 pb-4">
          <h3 className="text-xl font-extrabold flex items-center gap-2 mb-1 text-red-700"><span>🧠</span> Behavioral Scan Watchlist</h3>
          <p className="text-sm text-slate-500 m-0">Floor-wide agents flagged for extreme operational strain. Rank priority: AHT &gt; Net OCC &gt; DPC &gt; Hold.</p>
        </div>


        {metrics.orgBurnoutList.length === 0 ? (
          <div className="text-center p-5 text-slate-500 italic">No agents currently flagged for high behavioral risk on the floor.</div>
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
      </div>
    </div>
  );
};
