// ==== Derived dashboard metrics + summaries ==== 
// Quick scan: src/dashboard/metrics.ts for rolled-up KPI, leader, heatmap, and burnout logic

import { useMemo } from 'react';
import { CHART_COLORS, COL_DEFINITIONS, DAYS_OF_WEEK, TARGETS } from './config';
import {
  agentMatchesSearch,
  aggregateRecords,
  aggregateTeamMetrics,
  calculateTrend,
  dowFromDateStr,
  getWeekNumber,
} from './helpers';

export const useDashboardMetrics = ({
  agents,
  supervisors,
  historicalData,
  hasUploadedData,
  oamName,
  activeTimeframe,
  selectedDate,
  selectedWeek,
  selectedDow,
  getAgentDataForTimeframe,
  searchQuery,
  sortConfig,
  runChartMetric,
  isCumulative,
  heatmapViewType,
}) => {
  const parsedQueries = useMemo(
    () => searchQuery.toLowerCase().split(',').map((q) => q.trim()).filter((q) => q),
    [searchQuery]
  );

  const filteredAgents = useMemo(
    () => agents.filter((a) => agentMatchesSearch(a, parsedQueries)),
    [agents, parsedQueries]
  );

  const mtdLeaderData = useMemo(() => {
    const allAgentData = filteredAgents.map((a) => getAgentDataForTimeframe(a, 'monthly'));
    return aggregateTeamMetrics(allAgentData);
  }, [filteredAgents, historicalData, hasUploadedData, activeTimeframe, getAgentDataForTimeframe]);

  const activeLeaderData = useMemo(() => {
    const allAgentData = filteredAgents.map((a) => getAgentDataForTimeframe(a, activeTimeframe));
    return aggregateTeamMetrics(allAgentData);
  }, [filteredAgents, historicalData, activeTimeframe, selectedDate, selectedWeek, selectedDow, hasUploadedData, getAgentDataForTimeframe]);

  const supervisorStats = useMemo(() => {
    return supervisors.map((supName) => {
      const supAgents = filteredAgents.filter((a) => a.supervisor === supName);
      const activeData = aggregateTeamMetrics(supAgents.map((a) => getAgentDataForTimeframe(a, activeTimeframe)));
      const mtdData = aggregateTeamMetrics(supAgents.map((a) => getAgentDataForTimeframe(a, 'monthly')));
      const primaryOam = supAgents.length > 0 ? supAgents[0].oam : 'Unknown';
      const trend = calculateTrend(activeData, mtdData);

      return {
        name: supName,
        oam: primaryOam,
        activeData,
        mtdData,
        trend,
        isOff: activeData.isOff,
        agentCount: supAgents.length,
        isHighRisk: !activeData.isOff && trend.direction === 'down' && trend.diff <= -3.0,
      };
    });
  }, [filteredAgents, supervisors, historicalData, activeTimeframe, selectedDate, selectedWeek, selectedDow, hasUploadedData, getAgentDataForTimeframe]);

  const paretoData = useMemo(() => {
    const active = filteredAgents
      .map((a) => ({ agent: a, data: getAgentDataForTimeframe(a, activeTimeframe) }))
      .filter((item) => !item.data.isOff);

    const agentByDetractors = [...active]
      .sort((a, b) => (b.data.detractors || 0) - (a.data.detractors || 0))
      .filter((a) => a.data.detractors >= 1)
      .slice(0, 10);
    const agentByRepeats = [...active]
      .sort((a, b) => (b.data.repeats3d || 0) - (a.data.repeats3d || 0))
      .filter((a) => a.data.repeats3d >= 1)
      .slice(0, 10);
    const agentByHandoffs = [...active]
      .sort((a, b) => (b.data.handoffsCount || 0) - (a.data.handoffsCount || 0))
      .filter((a) => a.data.handoffsCount >= 1)
      .slice(0, 10);
    const agentByPromoters = [...active]
      .filter((a) => a.data.vxs === 100 && a.data.promoters >= 1)
      .sort((a, b) => (b.data.promoters || 0) - (a.data.promoters || 0))
      .slice(0, 10);
    const agentByResolves = [...active]
      .filter((a) => a.data.resolve3d != null)
      .sort((a, b) => {
        if (b.data.resolve3d !== a.data.resolve3d) return b.data.resolve3d - a.data.resolve3d;
        return (b.data.resolveTotalContacts3d || 0) - (a.data.resolveTotalContacts3d || 0);
      })
      .slice(0, 10);
    const agentByPhoneAdds = [...active]
      .sort((a, b) => (b.data.phoneAdds || 0) - (a.data.phoneAdds || 0))
      .filter((a) => (a.data.phoneAdds || 0) >= 1)
      .slice(0, 10);

    const agentOffenders = { byDetractors: agentByDetractors, byRepeats: agentByRepeats, byHandoffs: agentByHandoffs };
    const agentPerformers = { byPromoters: agentByPromoters, byResolves: agentByResolves, byPhoneAdds: agentByPhoneAdds };

    const activeSups = supervisorStats
      .filter((s) => !s.isOff && s.agentCount > 0)
      .map((s) => ({ agent: { name: s.name, supervisor: 'Floor Rollup', oam: s.oam, ccms: s.name }, data: s.activeData }));

    const supByDetractors = [...activeSups]
      .sort((a, b) => (b.data.detractors || 0) - (a.data.detractors || 0))
      .filter((a) => a.data.detractors >= 1)
      .slice(0, 10);
    const supByRepeats = [...activeSups]
      .sort((a, b) => (b.data.repeats3d || 0) - (a.data.repeats3d || 0))
      .filter((a) => a.data.repeats3d >= 1)
      .slice(0, 10);
    const supByHandoffs = [...activeSups]
      .sort((a, b) => (b.data.handoffsCount || 0) - (a.data.handoffsCount || 0))
      .filter((a) => a.data.handoffsCount >= 1)
      .slice(0, 10);
    const supByPromoters = [...activeSups]
      .sort((a, b) => (b.data.promoters || 0) - (a.data.promoters || 0))
      .filter((a) => a.data.promoters >= 1)
      .slice(0, 10);
    const supByResolves = [...activeSups]
      .filter((a) => a.data.resolve3d != null)
      .sort((a, b) => {
        if (b.data.resolve3d !== a.data.resolve3d) return b.data.resolve3d - a.data.resolve3d;
        return (b.data.resolveTotalContacts3d || 0) - (a.data.resolveTotalContacts3d || 0);
      })
      .slice(0, 10);
    const supByPhoneAdds = [...activeSups]
      .sort((a, b) => (b.data.phoneAdds || 0) - (a.data.phoneAdds || 0))
      .filter((a) => (a.data.phoneAdds || 0) >= 1)
      .slice(0, 10);

    const supOffenders = { byDetractors: supByDetractors, byRepeats: supByRepeats, byHandoffs: supByHandoffs };
    const supPerformers = { byPromoters: supByPromoters, byResolves: supByResolves, byPhoneAdds: supByPhoneAdds };

    return {
      agent: { offenders: agentOffenders, performers: agentPerformers },
      supervisor: { offenders: supOffenders, performers: supPerformers },
    };
  }, [filteredAgents, historicalData, activeTimeframe, selectedDate, selectedWeek, selectedDow, hasUploadedData, supervisorStats, getAgentDataForTimeframe]);

  const dowData = useMemo(() => {
    if (!hasUploadedData) return { summary: [], worstIdx: -1 };

    const buckets = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    const activeAgentsPerDay = { 0: new Set(), 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set(), 6: new Set() };

    filteredAgents.forEach((a) => {
      const hist = historicalData[a.ccms] || {};
      Object.keys(hist).forEach((dateStr) => {
        const d = new Date(dateStr + 'T00:00:00');
        const dayIdx = d.getDay();
        if (!isNaN(dayIdx)) {
          buckets[dayIdx].push(hist[dateStr]);
          activeAgentsPerDay[dayIdx].add(a.ccms);
        }
      });
    });

    const result = DAYS_OF_WEEK.map((day, idx) => {
      const agg = aggregateTeamMetrics(buckets[idx]);
      const uniqueAgents = activeAgentsPerDay[idx].size;
      const avgAgents = Math.max(1, uniqueAgents / 4);
      return { day, idx, data: agg, isOff: agg.calls === 0, avgAgents };
    });

    let maxMisses = -1;
    let worstIdx = -1;

    result.forEach((item, idx) => {
      if (item.isOff) return;
      let misses = 0;
      if (item.data.vxs < TARGETS.vxs) misses++;
      if (item.data.resolve3d < TARGETS.resolve3d) misses++;
      if (item.data.handoffs > TARGETS.handoffs) misses++;

      const score = misses + (100 - (item.data.vxs || 0)) * 0.01;
      if (score > maxMisses) {
        maxMisses = score;
        worstIdx = idx;
      }
    });

    return { summary: result, worstIdx };
  }, [filteredAgents, historicalData, hasUploadedData]);

  const orgBurnoutList = useMemo(() => {
    if (!hasUploadedData) return [];

    let active = filteredAgents
      .map((a) => ({ agent: a, data: getAgentDataForTimeframe(a, 'monthly') }))
      .filter((item) => !item.data.isOff && item.data.calls > 3);

    const assignRank = (arr, metric, lowerIsWorse = false) => {
      arr.sort((a, b) => {
        const valA = a.data[metric] || 0;
        const valB = b.data[metric] || 0;
        return lowerIsWorse ? valA - valB : valB - valA;
      });
      arr.forEach((item, index) => {
        if (!item.ranks) item.ranks = {};
        item.ranks[metric] = index + 1;
      });
    };

    assignRank(active, 'aht', false);
    assignRank(active, 'hold', false);
    assignRank(active, 'dpc', false);
    assignRank(active, 'netOcc', true);

    active.forEach((item) => {
      item.burnoutScore = (item.ranks.aht * 4) + (item.ranks.netOcc * 3) + (item.ranks.dpc * 2) + (item.ranks.hold * 1);
      let highCount = 0;
      if ((item.data.aht || 0) > TARGETS.aht) highCount++;
      if ((item.data.hold || 0) > TARGETS.hold) highCount++;
      if ((item.data.dpc || 0) > TARGETS.dpc) highCount++;
      if ((item.data.netOcc || 0) < TARGETS.netOcc) highCount++;
      item.highMetricsCount = highCount;
    });

    return active.sort((a, b) => a.burnoutScore - b.burnoutScore).slice(0, 10);
  }, [filteredAgents, historicalData, hasUploadedData, getAgentDataForTimeframe]);

  const { allActiveDates, runChartData } = useMemo(() => {
    if (!hasUploadedData) return { allActiveDates: [], runChartData: [] };
    const currentMonthPrefix = selectedDate.substring(0, 7);

    const datesSet = new Set();
    Object.values(historicalData).forEach((agentDates) => {
      Object.keys(agentDates).forEach((d) => {
        if (d.startsWith(currentMonthPrefix)) datesSet.add(d);
      });
    });
    const dates = Array.from(datesSet).sort();

    const queries = parsedQueries;
    const isSearchEmpty = queries.length === 0;

    let overallName = `${oamName} (Manager Overall)`;
    if (!isSearchEmpty) {
      const searchedOams = [...new Set(agents.map((a) => a.oam).filter((o) => o && queries.some((q) => o.toLowerCase().includes(q))))];
      if (searchedOams.length === 1) {
        overallName = `${searchedOams[0]} (OAM Overall)`;
      } else if (queries.length === 1) {
        overallName = `Search: ${queries[0].toUpperCase()}`;
      }
    }

    const chartData = [];
    let finalDates = dates;
    if (heatmapViewType === 'weekly') {
      finalDates = ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'];
    }

    const buildSeries = (agentList) => {
      const series = {};
      let cumulativeRecords = [];

      if (heatmapViewType === 'daily') {
        dates.forEach((date) => {
          let currentDayRecords = [];
          agentList.forEach((a) => {
            const hist = historicalData[a.ccms] || {};
            if (hist[date]) currentDayRecords.push(hist[date]);
          });

          if (isCumulative) {
            cumulativeRecords = cumulativeRecords.concat(currentDayRecords);
            const aggregated = aggregateTeamMetrics(cumulativeRecords);
            const score = aggregated[runChartMetric];
            if (score !== null && score !== undefined && !isNaN(score)) series[date] = score;
          } else {
            const aggregated = aggregateTeamMetrics(currentDayRecords);
            const score = aggregated[runChartMetric];
            if (score !== null && score !== undefined && !isNaN(score)) series[date] = score;
          }
        });
      } else {
        finalDates.forEach((week) => {
          let currentWeekRecords = [];
          dates.forEach((date) => {
            if (getWeekNumber(date) === week) {
              agentList.forEach((a) => {
                const hist = historicalData[a.ccms] || {};
                if (hist[date]) currentWeekRecords.push(hist[date]);
              });
            }
          });

          if (isCumulative) {
            cumulativeRecords = cumulativeRecords.concat(currentWeekRecords);
            const aggregated = aggregateTeamMetrics(cumulativeRecords);
            const score = aggregated[runChartMetric];
            if (score !== null && score !== undefined && !isNaN(score)) series[week] = score;
          } else {
            const aggregated = aggregateTeamMetrics(currentWeekRecords);
            const score = aggregated[runChartMetric];
            if (score !== null && score !== undefined && !isNaN(score)) series[week] = score;
          }
        });
      }
      return series;
    };

    chartData.push({ name: overallName, color: '#0b0f19', series: buildSeries(filteredAgents) });

    if (!isSearchEmpty) {
      const activeSups = supervisorStats.filter((s) => !s.isOff && s.agentCount > 0);
      activeSups.forEach((sup, idx) => {
        let supAgents = agents.filter((a) => a.supervisor === sup.name);
        supAgents = supAgents.filter((a) => agentMatchesSearch(a, queries));
        chartData.push({ name: sup.name, color: CHART_COLORS[idx % CHART_COLORS.length], series: buildSeries(supAgents) });
      });
    }

    const validDates = finalDates.filter((d) => chartData.some((c) => c.series[d] !== undefined));
    return { allActiveDates: validDates, runChartData: chartData };
  }, [supervisorStats, filteredAgents, parsedQueries, historicalData, selectedDate, hasUploadedData, runChartMetric, oamName, isCumulative, heatmapViewType]);

  const sortedSupervisors = useMemo(() => {
    let result = [...supervisorStats];

    if (parsedQueries.length > 0) {
      result = result.filter((s) => s.agentCount > 0);
    }

    result.sort((a, b) => {
      const isOffA = a.isOff;
      const isOffB = b.isOff;
      if (isOffA && !isOffB) return 1;
      if (!isOffA && isOffB) return -1;
      if (isOffA && isOffB) return a.name.localeCompare(b.name);

      if (sortConfig.key === 'outlier') {
        if (a.isHighRisk && !b.isHighRisk) return -1;
        if (!a.isHighRisk && b.isHighRisk) return 1;
        if (activeTimeframe === 'dow') {
          const valA = a.activeData.vxs ?? Infinity;
          const valB = b.activeData.vxs ?? Infinity;
          if (valA !== valB) return valA - valB;
        }
        return a.name.localeCompare(b.name);
      }

      let valA, valB;
      if (sortConfig.key === 'name') {
        valA = a.name;
        valB = b.name;
      } else if (sortConfig.key === 'trajectory') {
        valA = a.trend.diff;
        valB = b.trend.diff;
      } else {
        valA = a.activeData[sortConfig.key];
        valB = b.activeData[sortConfig.key];
      }

      valA = valA === null || valA === undefined ? -Infinity : valA;
      valB = valB === null || valB === undefined ? -Infinity : valB;
      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [supervisorStats, parsedQueries, sortConfig]);

  return {
    mtdLeaderData,
    activeLeaderData,
    supervisorStats,
    paretoData,
    orgBurnoutList,
    dowData,
    allActiveDates,
    runChartData,
    sortedSupervisors,
  };
};
