// Extracted from App.tsx (Phase 3 move-only refactor) — behavior must stay identical.
import { PerformanceHeatmap } from '../../../../components/shared';
import { METRIC_CONFIG, getDynamicTarget } from '../../config';
import { useDashboard } from '../../hooks';

// ─── Trends Tab ──────────────────────────────────────
export const FloorTrendsTab = () => {
  const { dashData, metrics, aiTools, uiState, uiHandlers } = useDashboard();
  return (
    <div className="flex flex-col gap-6 p-6 bg-slate-50 border-t border-slate-200 rounded-b-xl">
      <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
        <div className="mb-6 border-b border-slate-100 pb-4 flex justify-between items-end flex-wrap gap-4">
          <div>
            <h3 className="text-xl font-extrabold flex items-center gap-2 mb-1 text-slate-900"><span>📈</span> Trends</h3>
          </div>
          
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
               <select value={uiState.runChartMetric} onChange={(e) => uiHandlers.setRunChartMetric(e.target.value)} className="py-1.5 px-3 rounded-md border border-slate-300 outline-none bg-slate-50 text-slate-900 font-semibold cursor-pointer text-sm">
                {Object.keys(METRIC_CONFIG).map(k => (
                  <option key={k} value={k}>{(METRIC_CONFIG as Record<string, any>)[k].label}</option>
                ))}
              </select>
            </div>
            
            <div className="flex bg-slate-50 rounded-lg border border-slate-200 overflow-hidden shadow-sm p-1 gap-1">
              <button 
                onClick={() => uiHandlers.setIsCumulative(false)}
                className="px-4 py-1.5 border-none font-bold cursor-pointer text-sm transition-all rounded-md"
                style={{ background: !uiState.isCumulative ? '#ffffff' : 'transparent', color: !uiState.isCumulative ? '#0b0f19' : '#64748b', boxShadow: !uiState.isCumulative ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >Standalone</button>
              <button 
                onClick={() => uiHandlers.setIsCumulative(true)}
                className="px-4 py-1.5 border-none font-bold cursor-pointer text-sm transition-all rounded-md"
                style={{ background: uiState.isCumulative ? '#ffffff' : 'transparent', color: uiState.isCumulative ? '#0b0f19' : '#64748b', boxShadow: uiState.isCumulative ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >Cumulative</button>
            </div>


            <div className="flex bg-slate-50 rounded-lg border border-slate-200 overflow-hidden shadow-sm p-1 gap-1">
              <button 
                onClick={() => uiHandlers.setHeatmapViewType('daily')}
                className="px-4 py-1.5 border-none font-bold cursor-pointer text-sm transition-all rounded-md"
                style={{ background: uiState.heatmapViewType === 'daily' ? '#ffffff' : 'transparent', color: uiState.heatmapViewType === 'daily' ? '#0b0f19' : '#64748b', boxShadow: uiState.heatmapViewType === 'daily' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >Daily View</button>
              <button 
                onClick={() => uiHandlers.setHeatmapViewType('weekly')}
                className="px-4 py-1.5 border-none font-bold cursor-pointer text-sm transition-all rounded-md"
                style={{ background: uiState.heatmapViewType === 'weekly' ? '#ffffff' : 'transparent', color: uiState.heatmapViewType === 'weekly' ? '#0b0f19' : '#64748b', boxShadow: uiState.heatmapViewType === 'weekly' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >Weekly View</button>
            </div>


            <button className="gemini-btn text-xs py-1.5 px-3 ml-2" onClick={aiTools.generateChartActionPlan} disabled={aiTools.loadingChartActionPlan || metrics.runChartData.length === 0} style={{ background: 'linear-gradient(135deg, #0b0f19 0%, #111827 100%)', boxShadow: '0 4px 12px rgba(11, 15, 25, 0.2)' }}>
              {aiTools.loadingChartActionPlan ? '✨ Analyzing...' : '✨ Create Action Plan'}
            </button>
          </div>
        </div>
        <PerformanceHeatmap activeDates={metrics.allActiveDates} chartData={metrics.runChartData} metricConfig={(METRIC_CONFIG as Record<string, any>)[uiState.runChartMetric]} baseTarget={getDynamicTarget(uiState.runChartMetric, metrics.activeLeaderData.activeAgentCount || dashData.agents.length)} onCellClick={(date: any) => { dashData.setActiveTimeframe('daily'); dashData.setSelectedDate(date); uiHandlers.setMainTab('roster'); }} />
      </div>
    </div>
);
};
