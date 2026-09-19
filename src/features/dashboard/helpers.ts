// @ts-nocheck
// ============================================================================
// FILE STRUCTURE:
// ├── Agent Search Filter
// ├── Bonus Score Calculation
// ├── Record Aggregation
// ├── Team Metric Aggregation
// ├── Weighted Metric Calculation
// ├── Trend Calculation
// ├── Name Formatting Helpers
// └── Date & Calendar Helpers
// ============================================================================

// Calculation convention: new account-specific calculation styles are additive
// options selected by AccountProfile. Preserve existing branches for other accounts;
// never replace or delete an existing calculation unless explicitly requested.

import { METRIC_CONFIG, TARGETS } from './config';

// ─── Agent Search Filter ──────────────────────────────────────
export const agentMatchesSearch = (a, queries) => {
  if (queries.length === 0) return true;
  return queries.some((q) =>
    (a.supervisor && a.supervisor.toLowerCase().includes(q)) ||
    (a.oam && a.oam.toLowerCase().includes(q)) ||
    (a.name && a.name.toLowerCase().includes(q)) ||
    (a.coding && a.coding.toLowerCase().includes(q)) ||
    (a.phase && a.phase.toLowerCase().includes(q))
  );
};

// ─── Bonus Score Calculation ──────────────────────────────────────
export const calculateBonus = (vxs, r3d, handoffs) => {
  if (vxs == null || r3d == null || handoffs == null) return null;
  const vxsAttain = Math.min(1.2, vxs / TARGETS.vxs);
  const r3dAttain = Math.min(1.2, r3d / TARGETS.resolve3d);
  const handoffsAttain = handoffs === 0 ? 1.2 : Math.min(1.2, TARGETS.handoffs / handoffs);
  return vxsAttain * 50 + r3dAttain * 20 + handoffsAttain * 20 + 10;
};

// ─── Record Aggregation ──────────────────────────────────────
export const aggregateRecords = (records) => {
  let calls = 0, sumResolveTotalContacts = 0, sumTalkTime = 0, callsWithAht = 0, surveys = 0, promoters = 0;
  let totalResContacts3d = 0, totalRepeats3d = 0, totalResContacts2hr = 0, totalRepeats2hr = 0, ncwCount = 0;
  let sumHandoffsCount = 0, callsWithHandoffs = 0, sumHoldTime = 0, callsWithHold = 0, sumDpcTime = 0, callsWithDpc = 0;
  let sumVtt = 0, callsWithVtt = 0, sumVttSent = 0, sumVttTransacted = 0, sumNetOcc = 0, callsWithNetOcc = 0, sumCreditFreq = 0, callsWithCreditFreq = 0;
  let sumPhoneAdds = null, sumVhi = null, activeDays = 0;

  records.forEach((d) => {
    if (!d) return;

    if (d.phoneAdds != null) sumPhoneAdds = (sumPhoneAdds || 0) + d.phoneAdds;
    if (d.vhi != null) sumVhi = (sumVhi || 0) + d.vhi;

    if (d.isOff) return;
    activeDays++;

    const c = d.calls || 0;
    calls += c;

    sumResolveTotalContacts += d.resolveTotalContacts || 0;

    const resTotal = d.resolveTotalContacts != null ? d.resolveTotalContacts : c;
    ncwCount += Math.max(0, c - resTotal);

    if (d.aht != null) { sumTalkTime += d.aht * c; callsWithAht += c; }
    if (d.hold != null) { sumHoldTime += d.hold * c; callsWithHold += c; }
    if (d.dpc != null) { sumDpcTime += d.dpc * c; callsWithDpc += c; }
    if (d.netOcc != null) { sumNetOcc += d.netOcc * c; callsWithNetOcc += c; }
    if (d.creditFreq != null) { sumCreditFreq += d.creditFreq * c; callsWithCreditFreq += c; }
    if (d.viewTogether != null) { sumVtt += d.viewTogether * c; callsWithVtt += c; }
    if (d.vttSent != null) sumVttSent += d.vttSent;
    if (d.vttTransacted != null) sumVttTransacted += d.vttTransacted;

    if (d.handoffsCount != null) {
      sumHandoffsCount += d.handoffsCount;
      callsWithHandoffs += c;
    } else if (d.handoffs != null) {
      sumHandoffsCount += (d.handoffs / 100) * c;
      callsWithHandoffs += c;
    }

    if (d.surveys != null && d.promoters != null) {
      surveys += d.surveys;
      promoters += d.promoters;
    } else if (d.vxs != null) {
      const simulatedSurveys = Math.max(1, Math.round(c * 0.05));
      surveys += simulatedSurveys;
      promoters += simulatedSurveys * (d.vxs / 100);
    }

    const resContacts3d = d.resolveTotalContacts3d != null ? d.resolveTotalContacts3d : resTotal;
    const resContacts2hr = d.resolveTotalContacts2hr != null ? d.resolveTotalContacts2hr : resTotal;

    if (d.resolve3d != null) { totalResContacts3d += resContacts3d; totalRepeats3d += resContacts3d * ((100 - d.resolve3d) / 100); }
    if (d.resolve2hr != null) { totalResContacts2hr += resContacts2hr; totalRepeats2hr += resContacts2hr * ((100 - d.resolve2hr) / 100); }
  });

  if (activeDays === 0) {
    return {
      isOff: true, activeAgentCount: 0, calls: 0, vxs: null, resolve3d: null, handoffs: null, resolve2hr: null,
      aht: null, hold: null, dpc: null, viewTogether: null, vtt: null, netOcc: null, creditFreq: null,
      phoneAdds: sumPhoneAdds, vhi: sumVhi, ncw: null, ncwCount: 0, bonus: null,
    };
  }

  const vxs = surveys > 0 ? (promoters / surveys) * 100 : null;
  const resolve3d = totalResContacts3d > 0 ? (1 - totalRepeats3d / totalResContacts3d) * 100 : null;
  const resolve2hr = totalResContacts2hr > 0 ? (1 - totalRepeats2hr / totalResContacts2hr) * 100 : null;
  const handoffs = callsWithHandoffs > 0 ? (sumHandoffsCount / callsWithHandoffs) * 100 : null;
  const ncwPct = calls > 0 ? (ncwCount / calls) * 100 : null;

  let viewTogether = null;
  if (sumVttSent > 0) {
    viewTogether = (sumVttTransacted / sumVttSent) * 100;
  } else if (callsWithVtt > 0) {
    viewTogether = sumVtt / callsWithVtt;
  }

  return {
    isOff: false, activeAgentCount: 1, calls, resolveTotalContacts: sumResolveTotalContacts, resolveTotalContacts3d: totalResContacts3d, resolveTotalContacts2hr: totalResContacts2hr,
    surveys, promoters, handoffsCount: sumHandoffsCount, repeats3d: totalRepeats3d, repeats2hr: totalRepeats2hr, detractors: surveys > 0 ? surveys - promoters : 0,
    aht: callsWithAht > 0 ? sumTalkTime / callsWithAht : null, vxs, resolve3d, resolve2hr, handoffs,
    hold: callsWithHold > 0 ? sumHoldTime / callsWithHold : null, dpc: callsWithDpc > 0 ? sumDpcTime / callsWithDpc : null,
    viewTogether, vtt: viewTogether, vttSent: sumVttSent, vttTransacted: sumVttTransacted, netOcc: callsWithNetOcc > 0 ? sumNetOcc / callsWithNetOcc : null,
    creditFreq: callsWithCreditFreq > 0 ? sumCreditFreq / callsWithCreditFreq : null, phoneAdds: sumPhoneAdds, vhi: sumVhi, ncw: ncwPct, ncwCount, bonus: calculateBonus(vxs, resolve3d, handoffs),
  };
};

// ─── Team Metric Aggregation ──────────────────────────────────────
export const aggregateTeamMetrics = (agentDatas) => {
  let totalCalls = 0, totalCallsAht = 0, totalTalkTime = 0, totalPromoters = 0, totalSurveys = 0, sumHandoffs = 0, countHandoffs = 0, totalHandoffsCount = 0;
  let totalResContacts3d = 0, totalRepeats3d = 0, totalResContacts2hr = 0, totalRepeats2hr = 0, totalResolveContacts = 0, totalNcwCount = 0;
  let sumHold = 0, countHold = 0, sumDpc = 0, countDpc = 0, sumVtt = 0, countVtt = 0, sumVttSent = 0, sumVttTransacted = 0, sumNetOcc = 0, countNetOcc = 0, sumCreditFreq = 0, countCreditFreq = 0;
  let totalPhoneAdds = null, totalVhi = null, totalDetractors = 0, validCount = 0;

  agentDatas.forEach((aData) => {
    if (!aData) return;

    if (aData.phoneAdds != null) totalPhoneAdds = (totalPhoneAdds || 0) + aData.phoneAdds;
    if (aData.vhi != null) totalVhi = (totalVhi || 0) + aData.vhi;

    if (aData.isOff) return;
    validCount++;
    const calls = aData.calls || 0, surveys = aData.surveys || 0, promoters = aData.promoters || 0;

    totalCalls += calls;
    const rContacts = aData.resolveTotalContacts != null ? aData.resolveTotalContacts : calls;
    totalResolveContacts += rContacts;
    totalNcwCount += Math.max(0, calls - rContacts);

    if (aData.aht != null) { totalCallsAht += calls; totalTalkTime += aData.aht * calls; }
    if (aData.vxs != null) { totalSurveys += surveys; totalPromoters += promoters; }

    totalDetractors += aData.detractors || 0;
    totalHandoffsCount += aData.handoffsCount || 0;

    const resContacts3d = aData.resolveTotalContacts3d != null ? aData.resolveTotalContacts3d : rContacts;
    const resContacts2hr = aData.resolveTotalContacts2hr != null ? aData.resolveTotalContacts2hr : rContacts;

    if (aData.resolve3d != null) {
      totalResContacts3d += resContacts3d;
      totalRepeats3d += aData.repeats3d !== undefined ? aData.repeats3d : resContacts3d * ((100 - aData.resolve3d) / 100);
    }
    if (aData.resolve2hr != null) {
      totalResContacts2hr += resContacts2hr;
      totalRepeats2hr += aData.repeats2hr !== undefined ? aData.repeats2hr : resContacts2hr * ((100 - aData.resolve2hr) / 100);
    }
    if (aData.handoffs != null) { sumHandoffs += aData.handoffs; countHandoffs++; }
    if (aData.hold != null) { sumHold += aData.hold; countHold++; }
    if (aData.dpc != null) { sumDpc += aData.dpc; countDpc++; }
    if (aData.viewTogether != null) { sumVtt += aData.viewTogether; countVtt++; }
    if (aData.vttSent != null) sumVttSent += aData.vttSent;
    if (aData.vttTransacted != null) sumVttTransacted += aData.vttTransacted;
    if (aData.netOcc != null) { sumNetOcc += aData.netOcc; countNetOcc++; }
    if (aData.creditFreq != null) { sumCreditFreq += aData.creditFreq; countCreditFreq++; }
  });

  if (validCount === 0) {
    return { isOff: true, activeAgentCount: 0, calls: null, resolveTotalContacts: null, vxs: null, resolve3d: null, handoffs: null, resolve2hr: null, aht: null, hold: null, dpc: null, viewTogether: null, vtt: null, netOcc: null, creditFreq: null, phoneAdds: totalPhoneAdds, vhi: totalVhi, ncw: null, ncwCount: 0, bonus: null };
  }

  const vxs = totalSurveys > 0 ? (totalPromoters / totalSurveys) * 100 : null;
  const resolve3d = totalResContacts3d > 0 ? (1 - totalRepeats3d / totalResContacts3d) * 100 : null;
  const resolve2hr = totalResContacts2hr > 0 ? (1 - totalRepeats2hr / totalResContacts2hr) * 100 : null;
  const handoffs = countHandoffs > 0 ? sumHandoffs / countHandoffs : null;
  const ncwPct = totalCalls > 0 ? (totalNcwCount / totalCalls) * 100 : null;

  let viewTogether = null;
  if (sumVttSent > 0) {
    viewTogether = (sumVttTransacted / sumVttSent) * 100;
  } else if (countVtt > 0) {
    viewTogether = sumVtt / countVtt;
  }

  return {
    isOff: false, activeAgentCount: validCount, calls: totalCalls, surveys: totalSurveys, promoters: totalPromoters, repeats3d: totalRepeats3d, repeats2hr: totalRepeats2hr, detractors: totalDetractors,
    handoffsCount: totalHandoffsCount, resolveTotalContacts: totalResolveContacts, resolveTotalContacts3d: totalResContacts3d,
    aht: totalCallsAht > 0 ? totalTalkTime / totalCallsAht : null, vxs, resolve3d, resolve2hr, handoffs, hold: countHold > 0 ? sumHold / countHold : null,
    dpc: countDpc > 0 ? sumDpc / countDpc : null, viewTogether, vtt: viewTogether, vttSent: sumVttSent, vttTransacted: sumVttTransacted, netOcc: countNetOcc > 0 ? sumNetOcc / countNetOcc : null,
    creditFreq: countCreditFreq > 0 ? sumCreditFreq / countCreditFreq : null, phoneAdds: totalPhoneAdds, vhi: totalVhi, ncw: ncwPct, ncwCount: totalNcwCount, bonus: calculateBonus(vxs, resolve3d, handoffs),
  };
};

// ─── Weighted Metric Calculation ──────────────────────────────────────
export const calculateWeightedVSF = (agentsList, metricKey) => {
  if (!['vxs', 'resolve3d', 'resolve2hr'].includes(metricKey)) return null;

  const validAgents = agentsList.filter((a) => a && !a.isOff && a.data && a.data[metricKey] !== null && a.data[metricKey] !== undefined);
  if (validAgents.length < 2) return null;

  let totalWeight = 0;
  let totalDefects = 0;

  validAgents.forEach((a) => {
    let weight = 0;
    let defect = 0;

    if (metricKey === 'vxs') {
      weight = a.data.surveys || 0;
      defect = a.data.detractors || 0;
    } else if (metricKey === 'resolve3d') {
      weight = a.data.resolveTotalContacts3d || 0;
      defect = a.data.repeats3d || 0;
    } else if (metricKey === 'resolve2hr') {
      weight = a.data.resolveTotalContacts2hr || 0;
      defect = a.data.repeats2hr || 0;
    }

    totalWeight += weight;
    totalDefects += defect;
    a._vsfWeight = weight;
    a._vsfDefect = defect;
  });

  if (totalWeight === 0) return null;

  const weightedAveragePct = (1 - totalDefects / totalWeight) * 100;
  const targetIsReverse = METRIC_CONFIG[metricKey]?.reverse;

  let varianceSum = 0;
  validAgents.forEach((a) => {
    const diff = a.data[metricKey] - weightedAveragePct;
    varianceSum += diff * diff;
  });

  const stdDev = Math.sqrt(varianceSum / validAgents.length);
  const vsf = (6 * stdDev) / weightedAveragePct;

  validAgents.sort((a, b) => {
    if (targetIsReverse) return b.data[metricKey] - a.data[metricKey];
    return a.data[metricKey] - b.data[metricKey];
  });

  const worstOutliers = validAgents.slice(0, 3).map((a) => `[${a.agent.name} (Sup: ${a.agent.supervisor}) -> ${Math.round(a._vsfDefect)} Defects out of ${Math.round(a._vsfWeight)} Volume]`).join(', ');

  if (vsf > 1.0) {
    return `VSF is ${vsf.toFixed(2)}. This is an OUTLIER ISSUE. Your action plan MUST target specific bottom-performing individuals for 1-on-1 coaching. The process works, but specific agents are failing. Mathematical Proof: ${worstOutliers}. You must prove your point mathematically by quoting these exact numbers.`;
  }

  return `VSF is ${vsf.toFixed(2)}. This is a PROCESS ISSUE. Your action plan MUST NOT target individuals. Recommend floor-wide changes. Mathematical Proof: Despite top offenders like ${worstOutliers}, the variance is too tight. The entire team is failing the process together.`;
};

// ─── Trend Calculation ──────────────────────────────────────
export const calculateTrend = (currentData, baselineData) => {
  if (!currentData || currentData.isOff || typeof currentData.vxs !== 'number' || !baselineData || typeof baselineData.vxs !== 'number' || isNaN(currentData.vxs)) {
    return { direction: 'stable', label: 'OFF', diff: 0, diffStr: '-' };
  }
  const diff = currentData.vxs - baselineData.vxs;
  const diffStr = (diff >= 0 ? '+' : '') + diff.toFixed(2) + '%';
  if (diff >= 1.0) return { direction: 'up', label: '📈 UP', diff, diffStr };
  if (diff <= -1.0) return { direction: 'down', label: '📉 DOWN', diff, diffStr };
  return { direction: 'stable', label: '✊ STABLE', diff, diffStr };
};

// ─── Name Formatting Helpers ──────────────────────────────────────
export const formatName = (fullName) => {
  if (!fullName) return '';
  const parts = fullName.split(',');
  if (parts.length === 2) return `${parts[1].trim()} ${parts[0].trim()}`;
  return fullName.trim();
};

export const shortenManagerName = (fullName) => {
  if (!fullName) return fullName;
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 2) return fullName.trim();
  return `${words[0]} ${words[words.length - 1]}`;
};

// ─── Date & Calendar Helpers ──────────────────────────────────────
export const normalizeDate = (dStr) => {
  if (!dStr) return null;
  const datePart = dStr.split(' ')[0];
  const parts = datePart.split(/[-/]/);
  if (parts.length === 3) {
    let year, month, day;
    if (parts[2].length === 4) { month = parts[0]; day = parts[1]; year = parts[2]; }
    else if (parts[0].length === 4) { year = parts[0]; month = parts[1]; day = parts[2]; }
    else { return null; }
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return null;
};

export const getWeekNumber = (dateStr) => {
  if (!dateStr) return 'Week 1';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return 'Week 1';
  const day = parseInt(parts[2], 10);
  if (day <= 7) return 'Week 1';
  if (day <= 14) return 'Week 2';
  if (day <= 21) return 'Week 3';
  if (day <= 28) return 'Week 4';
  return 'Week 5';
};

export const dowFromDateStr = (d) => {
  const y = +d.slice(0, 4), m = +d.slice(5, 7), day = +d.slice(8, 10);
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const yr = m < 3 ? y - 1 : y;
  return (yr + Math.floor(yr / 4) - Math.floor(yr / 100) + Math.floor(yr / 400) + t[m - 1] + day) % 7;
};
