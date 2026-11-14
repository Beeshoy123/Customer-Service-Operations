// Extracted from App.tsx (Phase 3 move-only refactor) — behavior must stay identical.
import { FormattedText, AiLoader, MetricCell, CopyReportButton } from '../../../../components/shared';
import { COL_DEFINITIONS, getDynamicTarget } from '../../config';
import { useDashboard } from '../../hooks';
import { TabFrame } from '../chrome/TabFrame';
import { useEffect } from 'react';

// ==== Day-of-week tab ==== 
// Source: src/App.tsx -> FloorDowTab
export const FloorDowTab = () => {
  const { dashData, metrics, aiTools, uiState, uiHandlers } = useDashboard();
  useEffect(() => {
    if(dashData.hasUploadedData && !aiTools.dowReport && !aiTools.loadingDow) aiTools.generateDowReport(metrics.dowData);
  }, [dashData.hasUploadedData, dashData.historicalData]);


  return (
    <TabFrame
      icon="dow"
      title="Day-of-week analysis"
      subtitle="Aggregate performance based on historical day to identify systemic vulnerabilities."
      controls={aiTools.dowReport ? <CopyReportButton text={aiTools.dowReport} /> : undefined}
    >
      <table className="cso-table">
        <thead>
          <tr>
            <th className="is-left">Day</th>
            <th>Calls Handled</th>
            {COL_DEFINITIONS.map(col => uiState.visibleCols[col.stateKey] && (
              <th key={col.key}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.dowData.summary.map((row: any, i: any) => (
            <tr
              key={row.day}
              className="is-clickable"
              title={`Click to drill down into ${row.day} Team Roster`}
              onClick={() => {
                dashData.setActiveTimeframe('dow');
                dashData.setSelectedDow(row.day);
                uiHandlers.setMainTab('roster');
              }}
            >
              <td className="is-left cso-cell-strong">
                {row.day}
                {metrics.dowData.worstIdx === i && <span className="cso-flag" title="Worst Performing Day">Worst day</span>}
              </td>
              <td>{row.data.calls || 0}</td>
              {COL_DEFINITIONS.map(col => uiState.visibleCols[col.stateKey] && (
                <td key={col.key}>
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
        <div className="cso-report cso-report-loading"><AiLoader message="Analyzing systemic day vulnerabilities..." color="#0d9488" icon="dow" /></div>
      ) : aiTools.dowReport && (
        <div className="cso-report">
          <div className="report-body cso-report-body">
            <FormattedText text={aiTools.dowReport} linkedEntities={uiState.linkedEntities} onEntityClick={uiHandlers.handleAiLinkClick} />
          </div>
        </div>
      )}
    </TabFrame>
  );
};
