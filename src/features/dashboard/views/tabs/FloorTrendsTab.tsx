// Extracted from App.tsx (Phase 3 move-only refactor) — behavior must stay identical.
import { PerformanceHeatmap } from '../../../../components/shared';
import { METRIC_CONFIG, getDynamicTarget } from '../../config';
import { useDashboard } from '../../hooks';
import { TabFrame, Segmented } from '../chrome/TabFrame';

// ─── Trends Tab ──────────────────────────────────────
export const FloorTrendsTab = () => {
  const { dashData, metrics, aiTools, uiState, uiHandlers } = useDashboard();
  return (
    <TabFrame
      icon="trends"
      title="Trends"
      controls={
        <>
          <select
            value={uiState.runChartMetric}
            onChange={(e) => uiHandlers.setRunChartMetric(e.target.value)}
            className="cso-select"
            aria-label="Metric"
          >
            {Object.keys(METRIC_CONFIG).map(k => (
              <option key={k} value={k}>{(METRIC_CONFIG as Record<string, any>)[k].label}</option>
            ))}
          </select>
          <Segmented
            label="Chart mode"
            value={uiState.isCumulative ? 'cumulative' : 'standalone'}
            options={[{ value: 'standalone', label: 'Standalone' }, { value: 'cumulative', label: 'Cumulative' }]}
            onChange={(next) => uiHandlers.setIsCumulative(next === 'cumulative')}
          />
          <Segmented
            label="Heatmap view"
            value={uiState.heatmapViewType}
            options={[{ value: 'daily', label: 'Daily view' }, { value: 'weekly', label: 'Weekly view' }]}
            onChange={(next) => uiHandlers.setHeatmapViewType(next)}
          />
          <button
            type="button"
            className="cso-btn cso-btn-fill"
            onClick={aiTools.generateChartActionPlan}
            disabled={aiTools.loadingChartActionPlan || metrics.runChartData.length === 0}
          >
            {aiTools.loadingChartActionPlan ? 'Analyzing...' : 'Create action plan'}
          </button>
        </>
      }
    >
      <PerformanceHeatmap activeDates={metrics.allActiveDates} chartData={metrics.runChartData} metricConfig={(METRIC_CONFIG as Record<string, any>)[uiState.runChartMetric]} baseTarget={getDynamicTarget(uiState.runChartMetric, metrics.activeLeaderData.activeAgentCount || dashData.agents.length)} onCellClick={(date: any) => { dashData.setActiveTimeframe('daily'); dashData.setSelectedDate(date); uiHandlers.setMainTab('roster'); }} />
    </TabFrame>
  );
};
