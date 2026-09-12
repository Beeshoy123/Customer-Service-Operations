import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  CHART_COLORS,
  DAYS_OF_WEEK,
  DEFAULT_DATE,
  DEFAULT_MANAGER_NAME,
  METRIC_CONFIG,
  PERSONA,
  TARGETS,
} from './config';
import {
  agentMatchesSearch,
  aggregateRecords,
  aggregateTeamMetrics,
  calculateTrend,
  calculateWeightedVSF,
  detectColumns,
  dowFromDateStr,
  formatName,
  getWeekNumber,
  isRawGranularFormat,
  normalizeDate,
  parseCSVLine,
  shortenManagerName,
} from './helpers';

export const DashboardContext = createContext(null);
export const useDashboard = () => useContext(DashboardContext);

export const useDashboardData = (onDataReset = null) => {
  const [activeTimeframe, setActiveTimeframe] = useState('monthly');
  const [selectedWeek, setSelectedWeek] = useState('Week 1');
  const [selectedDate, setSelectedDate] = useState(DEFAULT_DATE);
  const [selectedDow, setSelectedDow] = useState('Monday');

  const [agents, setAgents] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [oamName, setOamName] = useState(DEFAULT_MANAGER_NAME);
  const [historicalData, setHistoricalData] = useState({});
  const [hasUploadedData, setHasUploadedData] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    processFile(file);
  };

  const handleFileDrop = (file) => {
    processFile(file);
  };

  const processFile = (file) => {
    if (!file) return;
    setUploadStatus({ type: 'info', message: 'Building OAM Database from file...' });

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
        if (lines.length < 2) {
          setUploadStatus({ type: 'error', message: 'File is empty or missing data rows.' });
          return;
        }

        const delimiter = lines[0].includes('\t') ? '\t' : ',';
        const headers = parseCSVLine(lines[0], delimiter).map((h) => h.toLowerCase().trim());

        const cols = detectColumns(headers);
        const nameKey = cols.name;
        const supKey = cols.supervisor;
        const oamKey = cols.oam;
        const dateKey = cols.date;
        const locationKey = cols.location;
        const idKey = cols.employeeId;

        if (nameKey === -1) {
          setUploadStatus({ type: 'error', message: 'Could not find an "Agent Name" or "Name" column.' });
          return;
        }

        const rawFormat = isRawGranularFormat(cols);

        const getFloat = (row, index, treatAsPercent = false) => {
          if (index === -1 || !row[index] || row[index].trim() === '') return null;
          let strVal = row[index].trim();
          const hasPct = strVal.includes('%');
          let parsed = parseFloat(strVal.replace(/,/g, '').replace(/%/g, '').replace(/\$/g, ''));
          if (isNaN(parsed)) return null;
          if (treatAsPercent && !hasPct && parsed <= 1.0 && parsed >= 0) { parsed = parsed * 100; }
          return parsed;
        };

        const getRowDate = (row) => {
          if (dateKey !== -1 && row[dateKey]) return normalizeDate(row[dateKey]);
          const rawDateCell = row.find((c) => c && typeof c === 'string' && (c.includes('/20') || c.includes(' AM') || c.includes(' PM')));
          return rawDateCell ? normalizeDate(rawDateCell) : null;
        };

        const getRowKey = (row) => {
          if (idKey !== -1 && row[idKey]) return 'ID_' + row[idKey].trim();
          return 'NAME_' + formatName(row[nameKey] || '').toLowerCase();
        };

        let rollups = null;
        if (rawFormat) {
          rollups = {};
          for (let i = 1; i < lines.length; i++) {
            const row = parseCSVLine(lines[i], delimiter);
            if (!row[nameKey]) continue;
            const rowDate = getRowDate(row);
            if (!rowDate) continue;
            const rowKey = getRowKey(row);
            const groupKey = `${rowKey}|${rowDate}`;

            if (!rollups[groupKey]) {
              rollups[groupKey] = {
                rowKey, rowDate, rowRef: row,
                callsRaw: 0, handleTimeRaw: 0, vxsPassRaw: 0, vxsTotalRaw: 0,
                resolve2hrFlag: 0, resolve3dFlag: 0, transferFlag: 0,
                detractors: 0, promoters: 0, satisfactionSum: 0, satisfactionCount: 0,
                knowledgeSum: 0, knowledgeCount: 0, rowCount: 0,
              };
            }
            const acc = rollups[groupKey];
            acc.rowCount += 1;
            if (cols.callsRaw !== -1) acc.callsRaw += getFloat(row, cols.callsRaw) || 0;
            if (cols.handleTimeRaw !== -1) acc.handleTimeRaw += getFloat(row, cols.handleTimeRaw) || 0;
            if (cols.vxsPassRaw !== -1) acc.vxsPassRaw += getFloat(row, cols.vxsPassRaw) || 0;
            if (cols.vxsTotalRaw !== -1) acc.vxsTotalRaw += getFloat(row, cols.vxsTotalRaw) || 0;
            const r2hr = cols.resolve2hrFlag !== -1 ? (getFloat(row, cols.resolve2hrFlag) || 0) : 0;
            const r3d = cols.resolve3dFlag !== -1 ? (getFloat(row, cols.resolve3dFlag) || 0) : 0;
            acc.resolve2hrFlag += r2hr;
            acc.resolve3dFlag += (r2hr > 0 ? 1 : r3d);
            if (cols.transferFlag !== -1) acc.transferFlag += getFloat(row, cols.transferFlag) || 0;
            if (cols.vxsTotalRaw !== -1) {
              const promoterVal = cols.promoters !== -1 ? (getFloat(row, cols.promoters) || 0) : 0;
              acc.promoters += promoterVal;
            }
            if (cols.detractors !== -1) acc.detractors += getFloat(row, cols.detractors) || 0;
            const satVal = cols.satisfaction !== -1 ? getFloat(row, cols.satisfaction) : null;
            if (satVal !== null) { acc.satisfactionSum += satVal; acc.satisfactionCount += 1; }
            const knowVal = cols.knowledge !== -1 ? getFloat(row, cols.knowledge) : null;
            if (knowVal !== null) { acc.knowledgeSum += knowVal; acc.knowledgeCount += 1; }
          }
        }

        let rowsParsed = 0;
        let latestFoundDate = null;
        const newHistory = { ...historicalData };
        const updatedAgents = [...agents];
        let foundSupervisors = new Set();
        let foundOam = null;

        const resolveAgentForRow = (row, joinKeyOverride) => {
          const rawAgentName = row[nameKey];
          const rawSupName = supKey !== -1 && row[supKey] ? row[supKey].trim() : 'Unknown';
          const rawOamName = oamKey !== -1 && row[oamKey] ? row[oamKey].trim() : null;
          const locationVal = locationKey !== -1 && row[locationKey] ? row[locationKey].trim() : 'Unknown';

          const agentName = formatName(rawAgentName);
          const supName = rawSupName !== 'Unknown' ? shortenManagerName(formatName(rawSupName)) : 'Unknown';
          const oamNameFormatted = rawOamName ? shortenManagerName(formatName(rawOamName)) : 'Unknown';

          if (supName !== 'Unknown') foundSupervisors.add(supName);
          if (rawOamName && !foundOam) foundOam = shortenManagerName(formatName(rawOamName));

          let coding = 'Unknown';
          if (locationVal.toLowerCase().includes('new hire')) coding = 'New Hire';
          else if (locationVal.toLowerCase().includes('transition')) coding = 'Transition';

          let phase = 'Unknown';
          if (rawOamName) {
            const mgr2 = rawOamName.toLowerCase();
            if (mgr2.includes('abdelazim') || mgr2.includes('ziad') || mgr2.includes('mohsen') || mgr2.includes('youssef')) {
              phase = 'OJT';
            } else if (mgr2.includes('mohamed') || mgr2.includes('seifeldin') || mgr2.includes('shahat') || mgr2.includes('ali') || mgr2.includes('khaled') || mgr2.includes('manar')) {
              phase = 'Nesting';
            }
          }

          const idVal = idKey !== -1 && row[idKey] ? row[idKey].trim() : null;
          let targetAgent = idVal
            ? updatedAgents.find((a) => a.sourceId === idVal)
            : updatedAgents.find((a) => a.name.toLowerCase() === agentName.toLowerCase());
          if (!targetAgent && idVal) {
            targetAgent = updatedAgents.find((a) => a.name.toLowerCase() === agentName.toLowerCase() && !a.sourceId);
          }

          if (!targetAgent) {
            targetAgent = {
              ccms: idVal ? ('ID_' + idVal) : ('AUTO_' + Math.random().toString(36).substr(2, 8)),
              sourceId: idVal,
              name: agentName,
              supervisor: supName,
              oam: oamNameFormatted,
              coding,
              phase,
            };
            updatedAgents.push(targetAgent);
          } else {
            targetAgent.supervisor = supName;
            targetAgent.oam = oamNameFormatted;
            if (coding !== 'Unknown') targetAgent.coding = coding;
            if (phase !== 'Unknown') targetAgent.phase = phase;
            if (idVal && !targetAgent.sourceId) targetAgent.sourceId = idVal;
          }
          return targetAgent;
        };

        if (rawFormat) {
          for (const groupKey in rollups) {
            const acc = rollups[groupKey];
            const row = acc.rowRef;
            const targetAgent = resolveAgentForRow(row);
            if (!targetAgent) continue;

            rowsParsed++;
            const rowDate = acc.rowDate;
            if (!latestFoundDate || rowDate > latestFoundDate) latestFoundDate = rowDate;

            const callsHandled = acc.callsRaw || acc.rowCount || 0;
            const isOff = callsHandled === 0;

            const vxsRate = acc.vxsTotalRaw > 0
              ? (acc.vxsPassRaw > 0 ? (acc.vxsPassRaw / acc.vxsTotalRaw) * 100 : (acc.promoters / acc.vxsTotalRaw) * 100)
              : null;
            const resolve2hrRate = callsHandled > 0 && cols.resolve2hrFlag !== -1 ? (1 - acc.resolve2hrFlag / callsHandled) * 100 : null;
            const resolve3dRate = callsHandled > 0 && (cols.resolve3dFlag !== -1 || cols.resolve2hrFlag !== -1) ? (1 - acc.resolve3dFlag / callsHandled) * 100 : null;
            const handoffsRate = callsHandled > 0 && cols.transferFlag !== -1 ? (acc.transferFlag / callsHandled) * 100 : null;
            const ahtVal = callsHandled > 0 && acc.handleTimeRaw > 0 ? acc.handleTimeRaw / callsHandled : null;

            if (!newHistory[targetAgent.ccms]) newHistory[targetAgent.ccms] = {};
            newHistory[targetAgent.ccms][rowDate] = {
              isOff, calls: callsHandled,
              resolveTotalContacts3d: null, resolveTotalContacts2hr: null,
              resolveTotalContacts: callsHandled,
              surveys: acc.vxsTotalRaw || null, promoters: acc.promoters || null, vxs: vxsRate,
              resolve3d: resolve3dRate, handoffs: handoffsRate, handoffsCount: acc.transferFlag || null,
              resolve2hr: resolve2hrRate, aht: ahtVal, hold: null,
              dpc: null, viewTogether: null, vtt: null, vttSent: null, vttTransacted: null, netOcc: null,
              creditFreq: null, phoneAdds: null, vhi: null,
            };
          }
        } else {
          const vxsIdx = cols.vxs;
          const resolve3dIdx = cols.resolve3d;
          const handoffsIdx = cols.handoffsPct;
          const handoffsCountIdx = cols.handoffsCount;
          const resolve2hrIdx = cols.resolve2hr;
          const ahtIdx = cols.aht;
          const resolve3dContactsIdx = cols.resolve3dContacts;
          const resolve2hrContactsIdx = cols.resolve2hrContacts;
          const fallbackResolveContactsIdx = cols.resolveContactsFallback;
          const holdIdx = cols.hold;
          const dpcIdx = cols.dpc;
          const vttIdx = cols.vtt;
          const vttSentIdx = cols.vttSent;
          const vttTransactedIdx = cols.vttTransacted;
          const netOccIdx = cols.netOcc;
          const creditFreqIdx = cols.creditFreq;
          const phoneAddsIdx = cols.phoneAdds;
          const vhiIdx = cols.vhi;
          const callsIdx = cols.calls;
          const surveysIdx = cols.surveys;
          const promotersIdx = cols.promoters;

          for (let i = 1; i < lines.length; i++) {
            const row = parseCSVLine(lines[i], delimiter);
            if (!row[nameKey]) continue;

            const rowDate = getRowDate(row);
            if (!rowDate) continue;
            if (!latestFoundDate || rowDate > latestFoundDate) latestFoundDate = rowDate;

            const targetAgent = resolveAgentForRow(row);
            if (!targetAgent) continue;

            rowsParsed++;
            const callsHandled = getFloat(row, callsIdx) || 0;
            const isOff = callsHandled === 0;

            const parsed3drContacts = getFloat(row, resolve3dContactsIdx);
            const parsedFallback = getFloat(row, fallbackResolveContactsIdx);
            const parsedVttSent = getFloat(row, vttSentIdx, false);
            const parsedVttTransacted = getFloat(row, vttTransactedIdx, false);
            let parsedVttRate = getFloat(row, vttIdx, true);
            if (parsedVttSent != null && parsedVttTransacted != null && parsedVttSent > 0) {
              parsedVttRate = (parsedVttTransacted / parsedVttSent) * 100;
            }

            if (!newHistory[targetAgent.ccms]) newHistory[targetAgent.ccms] = {};
            newHistory[targetAgent.ccms][rowDate] = {
              isOff,
              calls: callsHandled,
              resolveTotalContacts3d: parsed3drContacts,
              resolveTotalContacts2hr: getFloat(row, resolve2hrContactsIdx),
              resolveTotalContacts: parsedFallback !== null ? parsedFallback : (parsed3drContacts !== null ? parsed3drContacts : callsHandled),
              surveys: getFloat(row, surveysIdx),
              promoters: getFloat(row, promotersIdx),
              vxs: getFloat(row, vxsIdx, true),
              resolve3d: getFloat(row, resolve3dIdx, true),
              handoffs: getFloat(row, handoffsIdx, true),
              handoffsCount: getFloat(row, handoffsCountIdx, false),
              resolve2hr: getFloat(row, resolve2hrIdx, true),
              aht: getFloat(row, ahtIdx, false),
              hold: getFloat(row, holdIdx, false),
              dpc: getFloat(row, dpcIdx, false),
              viewTogether: parsedVttRate,
              vtt: parsedVttRate,
              vttSent: parsedVttSent,
              vttTransacted: parsedVttTransacted,
              netOcc: getFloat(row, netOccIdx, false),
              creditFreq: getFloat(row, creditFreqIdx, false),
              phoneAdds: getFloat(row, phoneAddsIdx, false),
              vhi: getFloat(row, vhiIdx, false),
            };
          }
        }

        if (rowsParsed > 0) {
          setHistoricalData(newHistory);
          setAgents(updatedAgents);
          setSupervisors(Array.from(foundSupervisors).sort());
          if (foundOam) setOamName(foundOam);
          setHasUploadedData(true);
          if (onDataReset) onDataReset();

          if (latestFoundDate) setSelectedDate(latestFoundDate);
          setActiveTimeframe('monthly');
          setUploadStatus({ type: 'success', message: `Database Built! Tracked ${Array.from(foundSupervisors).length} Supervisors & ${rowsParsed} records.` });
        } else {
          setUploadStatus({ type: 'error', message: 'No active records matched your Members.' });
        }
        setTimeout(() => setUploadStatus(null), 6000);
      } catch (err) {
        setUploadStatus({ type: 'error', message: 'Failed to process file format. Please check the data.' });
        setTimeout(() => setUploadStatus(null), 5000);
      }
    };
    reader.readAsText(file);
    if (event && event.target) event.target.value = '';
  };

  const agentDataCache = useMemo(() => {
    const cache = {};
    if (!hasUploadedData) return cache;

    const OFF = { isOff: true, calls: 0 };
    const daysMap = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
    const targetDow = daysMap[selectedDow];
    const weekNum = parseInt(selectedWeek.replace('Week ', ''));
    const startDay = (weekNum - 1) * 7 + 1;
    const endDay = weekNum >= 5 ? 31 : startDay + 6;

    Object.keys(historicalData).forEach((ccms) => {
      const agentHistory = historicalData[ccms];
      const allDates = Object.keys(agentHistory);

      cache[`${ccms}|monthly`] = allDates.length > 0 ? aggregateRecords(allDates.map((d) => agentHistory[d])) : OFF;
      cache[`${ccms}|daily`] = agentHistory[selectedDate] ? { ...agentHistory[selectedDate] } : OFF;

      const weekDates = allDates.filter((d) => {
        const parts = d.split('-');
        if (parts.length !== 3) return false;
        const day = parseInt(parts[2], 10);
        return day >= startDay && day <= endDay;
      });
      cache[`${ccms}|weekly`] = weekDates.length > 0 ? aggregateRecords(weekDates.map((d) => agentHistory[d])) : OFF;

      const dowDates = allDates.filter((d) => dowFromDateStr(d) === targetDow);
      cache[`${ccms}|dow`] = dowDates.length > 0 ? aggregateRecords(dowDates.map((d) => agentHistory[d])) : OFF;
    });

    return cache;
  }, [historicalData, hasUploadedData, selectedDate, selectedWeek, selectedDow]);

  const getAgentDataForTimeframe = (agent, timeframe) => {
    if (!hasUploadedData) return { isOff: true, calls: 0 };
    return agentDataCache[`${agent.ccms}|${timeframe}`] || { isOff: true, calls: 0 };
  };

  const handleDateChange = (daysToAdd) => {
    if (!hasUploadedData) return;
    const current = new Date(selectedDate + 'T00:00:00');
    const year = current.getFullYear();
    const month = current.getMonth();
    const day = current.getDate();

    if (activeTimeframe === 'dow') {
      let idx = DAYS_OF_WEEK.indexOf(selectedDow) + daysToAdd;
      if (idx < 0) idx = 6;
      if (idx > 6) idx = 0;
      setSelectedDow(DAYS_OF_WEEK[idx]);
      return;
    }

    if (activeTimeframe !== 'daily') {
      if (daysToAdd < 0) return;
      setActiveTimeframe('daily');
      const firstDay = new Date(year, month, 1);
      setSelectedDate(`${firstDay.getFullYear()}-${String(firstDay.getMonth() + 1).padStart(2, '0')}-${String(firstDay.getDate()).padStart(2, '0')}`);
      return;
    }

    if (daysToAdd < 0) {
      if (day === 1) { setActiveTimeframe('monthly'); return; }
      const prevDay = new Date(year, month, day - 1);
      setSelectedDate(`${prevDay.getFullYear()}-${String(prevDay.getMonth() + 1).padStart(2, '0')}-${String(prevDay.getDate()).padStart(2, '0')}`);
      return;
    }

    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    if (day >= lastDayOfMonth) return;
    const nextDay = new Date(year, month, day + 1);
    setSelectedDate(`${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`);
  };

  const getCurrentMonthName = () => {
    const parts = selectedDate.split('-');
    if (parts.length !== 3) return 'Current Month';
    const localDate = new Date(parts[0], parseInt(parts[1]) - 1, parts[2]);
    return localDate.toLocaleString('en-US', { month: 'long' });
  };

  const getTopHeadlineMonth = () => {
    if (activeTimeframe === 'monthly') return getCurrentMonthName();
    if (activeTimeframe === 'weekly') return selectedWeek;
    return getCurrentMonthName();
  };

  return {
    agents, supervisors, oamName, historicalData, hasUploadedData, uploadStatus, handleFileUpload, handleFileDrop,
    activeTimeframe, setActiveTimeframe, selectedWeek, setSelectedWeek, selectedDate, setSelectedDate,
    selectedDow, setSelectedDow,
    getAgentDataForTimeframe, handleDateChange, getTopHeadlineMonth,
  };
};

const _aiControllers = new Map();

const executeGeminiAction = async (context, systemPrompt, setStatusFn, setLoadingFn, errorMsg) => {
  const slotKey = setLoadingFn;
  if (_aiControllers.get(slotKey)?.active) return;

  const prevController = _aiControllers.get(slotKey);
  if (prevController) prevController.controller.abort();

  const controller = new AbortController();
  _aiControllers.set(slotKey, { controller, active: true });

  const timeoutId = setTimeout(() => controller.abort(), 30000);

  setLoadingFn(true);
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: 'user', content: context }],
      }),
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const result = await response.json();
    const text = result.content?.map((b) => b.text || '').join('') || '';
    if (text) { setStatusFn(text); setLoadingFn(false); return; }
    throw new Error('Empty response');
  } catch (e) {
    if (e.name !== 'AbortError') {
      const isTimeout = e.message?.includes('abort') || e.name === 'TimeoutError';
      setStatusFn(isTimeout ? 'Request timed out. Please try again.' : (errorMsg || 'An error occurred while generating content.'));
      setLoadingFn(false);
    }
  } finally {
    clearTimeout(timeoutId);
    const current = _aiControllers.get(slotKey);
    if (current?.controller === controller) {
      _aiControllers.set(slotKey, { controller, active: false });
    }
  }
};

export const AI_INITIAL = {
  report: null,
  loading: false,
  teamReport: null,
  loadingTeam: false,
  chartActionPlan: null,
  loadingChartActionPlan: false,
  correlationReport: null,
  loadingCorrelation: false,
  apprenticeReport: null,
  loadingApprentice: false,
  dowReport: null,
  loadingDow: false,
};

export const useAiTools = ({
  agents,
  supervisors,
  oamName,
  historicalData,
  selectedDate,
  activeTimeframe,
  selectedWeek,
  selectedDow,
  getAgentDataForTimeframe,
  activeLeaderData,
  mtdLeaderData,
  supervisorStats,
  runChartMetric,
  runChartData,
  allActiveDates,
  searchQuery,
  visibleCols,
}) => {
  const [aiState, dispatchAi] = React.useReducer((s, a) => ({ ...s, ...a }), AI_INITIAL);
  const { report, loading, teamReport, loadingTeam, chartActionPlan, loadingChartActionPlan,
    correlationReport, loadingCorrelation, apprenticeReport, loadingApprentice,
    dowReport, loadingDow } = aiState;
  const setReport = (v) => dispatchAi({ report: v });
  const setLoading = (v) => dispatchAi({ loading: v });
  const setTeamReport = (v) => dispatchAi({ teamReport: v });
  const setLoadingTeam = (v) => dispatchAi({ loadingTeam: v });
  const setChartActionPlan = (v) => dispatchAi({ chartActionPlan: v });
  const setLoadingChartActionPlan = (v) => dispatchAi({ loadingChartActionPlan: v });
  const setCorrelationReport = (v) => dispatchAi({ correlationReport: v });
  const setLoadingCorrelation = (v) => dispatchAi({ loadingCorrelation: v });
  const setApprenticeReport = (v) => dispatchAi({ apprenticeReport: v });
  const setLoadingApprentice = (v) => dispatchAi({ loadingApprentice: v });
  const setDowReport = (v) => dispatchAi({ dowReport: v });
  const setLoadingDow = (v) => dispatchAi({ loadingDow: v });

  const [askAiQuery, setAskAiQuery] = useState('');
  const [askAiResponse, setAskAiResponse] = useState(null);
  const [askAiLoading, setAskAiLoading] = useState(false);

  const resetAiStates = () => {
    dispatchAi(AI_INITIAL);
    setAskAiQuery('');
    setAskAiResponse(null);
  };

  const spotterDate = activeTimeframe === 'monthly' ? 'MTD' : activeTimeframe === 'weekly' ? selectedWeek : activeTimeframe === 'dow' ? selectedDow : selectedDate;

  const getVsfContext = (agentsList, metricKey) => {
    const vsfString = calculateWeightedVSF(agentsList, metricKey);
    return vsfString ? `\n--- LEAN SIX SIGMA COPC DIRECTIVE ---\n${vsfString}\n--------------------------------------\n` : '';
  };

  const generateExpertReport = async (supervisorObj) => {
    setReport(null);
    const aData = supervisorObj.activeData;
    const trend = supervisorObj.trend;

    const supAgentsRaw = agents.filter((a) => a.supervisor === supervisorObj.name);
    const supAgents = supAgentsRaw.map((a) => {
      const d = getAgentDataForTimeframe(a, activeTimeframe);
      const aWow = {};
      ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'].forEach((w) => {
        const recs = Object.keys(historicalData[a.ccms] || {}).filter((dt) => getWeekNumber(dt) === w).map((dt) => historicalData[a.ccms][dt]);
        if (recs.length > 0) {
          const agg = aggregateRecords(recs);
          aWow[w] = { calls: agg.calls, vxs: agg.vxs, resolve3d: agg.resolve3d, handoffs: agg.handoffs, dpc: agg.dpc, vtt: agg.vtt, phoneAdds: agg.phoneAdds, vhi: agg.vhi };
        }
      });

      return { name: a.name, vxs: d.vxs, resolve3d: d.resolve3d, aht: d.aht, hold: d.hold, handoffs: d.handoffs, ncw: d.ncw, dpc: d.dpc, vhi: d.vhi, phoneAdds: d.phoneAdds, vtt: d.vtt, weeklyHistory: aWow };
    });

    const agentsWithData = supAgentsRaw.map((a) => ({ agent: a, data: getAgentDataForTimeframe(a, activeTimeframe) }));
    let worstMetric = 'vxs';
    if (aData.resolve3d < aData.vxs) worstMetric = 'resolve3d';
    const vsfDirective = getVsfContext(agentsWithData, worstMetric);

    const agentContext = supAgents.map((a) => `${a.name} (Current -> CSAT: ${a.vxs !== null ? Number(a.vxs).toFixed(0) : '-'}%, 3DR: ${a.resolve3d !== null ? Number(a.resolve3d).toFixed(0) : '-'}%, NCW%: ${a.ncw !== null ? Number(a.ncw).toFixed(1) : '-'}%, Hand-offs: ${a.handoffs !== null ? Number(a.handoffs).toFixed(1) : '-'}%, Weekly History: ${JSON.stringify(a.weeklyHistory)})`).join(' | ');

    const context = `
      OAM LEADER: ${oamName}
      OAM SELECTED FRAME (${spotterDate}): 3DR ${activeLeaderData.resolve3d}, C-Sat ${activeLeaderData.vxs}
      OAM MTD: 3DR ${mtdLeaderData.resolve3d}, C-Sat ${mtdLeaderData.vxs}
      SUBJECT SUPERVISOR: ${supervisorObj.name}
      SUPERVISOR CURRENT TEAM FRAME: 2HR ${aData.resolve2hr}, 3DR ${aData.resolve3d}, C-Sat ${aData.vxs}, AHT ${aData.aht}, Hold ${aData.hold}, Hand-offs ${aData.handoffs}, DPC ${aData.dpc}, VTT ${aData.viewTogether}, VHI ${aData.vhi}, NCW% ${aData.ncw}
      SUPERVISOR TREND: ${trend.label} (${trend.diffStr} vs MTD)
      AGENT OUTLIERS & WEEKLY HISTORY: ${agentContext}
      ${vsfDirective}
    `;

    const systemPrompt = `
      ${PERSONA}
      
      CRITICAL INSTRUCTIONS:
      - DO NOT explain what the metrics mean. We already know. Just say "3DR", "VXS", "VHI", "VTT", "DPC", "Hand-offs", etc.
      - Use "transferring" for the verb and "Hand-offs" for the noun.
      - Always check VTT alongside sales (VHI/Phone Lines) to ensure sales are valid and maintain integrity.
      - CRITICAL: Always cross-reference Sales with DPC (Disconnects Per Call). If Sales are high but DPC is high (Target: 3), they are losing net additions by disconnecting lines. This is a negative behavior!
      - Compare Percentage of Non-Call Windows against Hand-offs to identify if agents are transferring calls just to avoid work.
      - Hunt for the hidden details: look for quiet bleeders or unsung wins. Use the Agent Outliers to connect the dots. You now have access to each agent's individual weekly history.
      - Presentable Judgments: You must prove your point mathematically. You have been provided with raw volume breakdowns and exact numbers in the mathematical proof. You MUST explicitly quote these exact numbers and explain why they hurt the team score to ensure a robust and analytical output.
      - NEVER use the word "task". Use "calls" or "issues".
      - NEVER use dramatic words like "plummet".
      
      Format exactly like this (with blank lines between sections):
      
      **🕵️ What You Might Be Missing:**
      - (Write exactly ONE bullet point pointing out the biggest hidden issue or win—like high sales but low VTT, or good CSAT but bad repeat callers).
      
      **🔎 AI Root Cause Hypothesis:**
      - (Provide a short, 2-sentence guess on what behavior or technical issue is causing the team's main problem).
      
      **🎯 Your #1 Move Today:**
      - (Give one clear, simple action for the leader to take today to fix the main issue, adhering perfectly to the Lean Six Sigma Directive provided).
    `;

    executeGeminiAction(context, systemPrompt, setReport, setLoading, 'Error loading report.');
  };

  const generateApprenticeReport = async (mode, dataA, dataB, titleA, titleB) => {
    setApprenticeReport(null);
    const context = `
      Comparing Mode: ${mode === 'coding' ? 'New Hires vs Transitions' : 'OJT vs Nesting'}
      Group A (${titleA}): Volume ${dataA.calls}, CSAT ${dataA.vxs}, 2HR ${dataA.resolve2hr}, 3DR ${dataA.resolve3d}, Hand-offs ${dataA.handoffs}, Phones ${dataA.phoneAdds}, VHI ${dataA.vhi}, VTT ${dataA.vtt}, DPC ${dataA.dpc}
      Group B (${titleB}): Volume ${dataB.calls}, CSAT ${dataB.vxs}, 2HR ${dataB.resolve2hr}, 3DR ${dataB.resolve3d}, Hand-offs ${dataB.handoffs}, Phones ${dataB.phoneAdds}, VHI ${dataB.vhi}, VTT ${dataB.vtt}, DPC ${dataB.dpc}
    `;

    const systemPrompt = `
      ${PERSONA} Your job is to analyze the performance gap between these two specific cohorts of agents.
      
      CRITICAL INSTRUCTIONS:
      - DO NOT explain what the metrics mean. Just say "3DR", "VXS", "VHI", "VTT", "Hand-offs", "2HR", "DPC".
      - DO NOT use the word "task" or "plummet".
      - Use "transferring" for the verb and "Hand-offs" for the noun.
      - Evaluate speed-to-resolve (2HR/3DR).
      - Evaluate Sales Integrity and Net Additions: Cross-reference Sales (Phones/VHI) against VTT (Integrity) and DPC (Disconnects Per Call). High Sales + High DPC is a massive negative behavior (they are disconnecting lines to get sales).
      
      Format exactly like this (with blank lines between sections):
      
      **⚖️ The Weight:**
      - (Write ONE bullet point explicitly stating who is carrying the positive operational weight based on Volume vs Resolve metrics).
      
      **🩸 The Bleed:**
      - (Write ONE bullet point pointing out the biggest hidden issue or bleed—like high sales but low VTT, or high Hand-offs for one group).
      
      **🎯 AI Verdict:**
      - (Provide a 1-sentence conclusive summary of whether the Transition/Nesting group is actually surviving the harder work, or if New Hires/OJT are artificially keeping the floor afloat).
    `;

    executeGeminiAction(context, systemPrompt, setApprenticeReport, setLoadingApprentice, 'Error generating impact report.');
  };

  const generateDowReport = async (dowDataObj) => {
    setDowReport(null);
    if (!dowDataObj || dowDataObj.worstIdx === -1) {
      setDowReport('Not enough historical data to map Day-of-the-Week trends.');
      return;
    }

    const worstDay = dowDataObj.summary[dowDataObj.worstIdx];
    const agentDayStats = agents.map((a) => {
      const hist = historicalData[a.ccms] || {};
      const dayRecords = Object.keys(hist)
        .filter((d) => dowFromDateStr(d) === worstDay.idx)
        .map((d) => hist[d]);
      return { agent: a, data: aggregateTeamMetrics(dayRecords) };
    }).filter((item) => !item.data.isOff);

    agentDayStats.sort((a, b) => {
      const scoreA = (a.data.vxs || 0) - (a.data.handoffs || 0);
      const scoreB = (b.data.vxs || 0) - (b.data.handoffs || 0);
      return scoreA - scoreB;
    });

    const bottomAgents = agentDayStats.slice(0, 2).map((x) => `${x.agent.name} (Sup: ${x.agent.supervisor}) -> CSAT: ${Number(x.data.vxs).toFixed(1)}%, Handoffs: ${Number(x.data.handoffs).toFixed(1)}%`);

    const context = `
        Worst Day: ${worstDay.day}
        Day Stats: Calls ${worstDay.data.calls}, C-Sat ${Number(worstDay.data.vxs).toFixed(2)}%, 3DR ${Number(worstDay.data.resolve3d).toFixed(2)}%, Handoffs ${Number(worstDay.data.handoffs).toFixed(2)}%, Phone Adds ${worstDay.data.phoneAdds}
        Bottom 2 Agents dragging this day down: ${bottomAgents.join(' | ')}
        Targets: C-Sat ${TARGETS.vxs}%, 3DR ${TARGETS.resolve3d}%, Handoffs ${TARGETS.handoffs}%
    `;

    const systemPrompt = `${PERSONA} 
    You are analyzing the worst performing day of the week for a call center. 
    Format your exact output as requested:
    
    ### ⚠️ Action Required: ${worstDay.day} Vulnerability
    
    **Why:** [Write 2 sentences explaining why this day is missing its targets based on the stats provided. Mention the specific metrics missed vs the targets.]
    
    **Primary Impact:** [Write 2 sentences identifying the bottom 2 agents dragging the day down, explicitly quoting their CSAT and Handoff numbers].`;

    executeGeminiAction(context, systemPrompt, setDowReport, setLoadingDow, 'Error generating day-of-week report.');
  };

  return {
    report,
    loading,
    teamReport,
    loadingTeam,
    chartActionPlan,
    loadingChartActionPlan,
    correlationReport,
    loadingCorrelation,
    apprenticeReport,
    loadingApprentice,
    dowReport,
    loadingDow,
    askAiQuery,
    setAskAiQuery,
    askAiResponse,
    setAskAiResponse,
    askAiLoading,
    setAskAiLoading,
    resetAiStates,
    generateExpertReport,
    generateApprenticeReport,
    generateDowReport,
    getVsfContext,
  };
};
