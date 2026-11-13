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
          <div className="scan-grid">
            {metrics.orgBurnoutList.map((item: any, idx: any) => {
              const isExpanded = uiState.expandedBurnoutAgentId === item.agent.ccms;
              const toggle = () => uiHandlers.setExpandedBurnoutAgentId(isExpanded ? null : item.agent.ccms);
              return (
                <div key={item.agent.ccms} className={`scan-card${isExpanded ? ' is-open' : ''}`}>
                  <div
                    className="scan-head"
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onClick={toggle}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
                  >
                    <span className="scan-rank">{idx + 1}</span>
                    <div className="scan-name">
                      <strong>{item.agent.name}</strong>
                      <small>Sup: {item.agent.supervisor}</small>
                    </div>
                    <span className="cso-pill is-bad">{item.highMetricsCount}/4 missed</span>
                  </div>
                  {isExpanded && (
                    <div className="scan-tiles">
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
                          <div key={col.key} className="scan-tile">
                            <small>{col.label}</small>
                            <b style={{ color: valColor }}>{displayVal}{!isMissing ? col.format : ''}</b>
                          </div>
                        );
                      })}
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
