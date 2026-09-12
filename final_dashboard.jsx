import React, { useState, useEffect, useRef, useMemo, useCallback, createContext, useContext } from 'react';

// ── Dashboard Context ─────────────────────────────────────────────────────────
// Single shared context so components subscribe only to what they read,
// instead of receiving all 5 prop bundles on every render.
const DashboardContext = createContext(null);
const useDashboard = () => useContext(DashboardContext);


if (typeof window !== 'undefined') {
  window.tailwind = window.tailwind || { config: {} };
}
var tailwind = typeof window !== 'undefined' ? window.tailwind : { config: {} };


const getYesterdayDateString = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};


const DEFAULT_MANAGER_NAME = "Department Manager";
const DEFAULT_DATE = getYesterdayDateString();
const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const CHART_COLORS = ['#D52B1E', '#10B981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#6366f1', '#64748b', '#0b0f19'];


const TARGETS = {
  resolve2hr: 92,
  resolve3d: 80,
  vxs: 88,
  handoffs: 10,
  phoneAdds: 1.3,
  grossAddsFwa: 1,
  aht: 1100,
  hold: 130,
  netOcc: 80,
  creditFreq: 5,
  dpc: 3,
  viewTogether: 93,
  ncw: 10
};


const METRIC_CONFIG = {
  bonus: { label: 'Bonus Score', target: 100, format: '', reverse: false, max: 120 },
  vxs: { label: 'C-Sat', target: TARGETS.vxs, format: '', reverse: false, max: 100 },
  resolve2hr: { label: '2HR', target: TARGETS.resolve2hr, format: '', reverse: false, max: 100 },
  phoneAdds: { label: 'Phone Lines', target: TARGETS.phoneAdds, format: '', reverse: false, max: 20, isInteger: true },
  handoffs: { label: 'Hand-offs', target: TARGETS.handoffs, format: '', reverse: true, max: 25 },
  resolve3d: { label: '3DR', target: TARGETS.resolve3d, format: '', reverse: false, max: 100 },
  aht: { label: 'AHT', target: TARGETS.aht, format: '', reverse: true, max: 1500 },
  hold: { label: 'Hold', target: TARGETS.hold, reverse: true, max: 300 },
  dpc: { label: 'DPC', target: TARGETS.dpc, format: '', reverse: true, max: 10 },
  vtt: { label: 'VTT', target: TARGETS.viewTogether, format: '', reverse: false, max: 100 },
  netOcc: { label: 'Net OCC', target: TARGETS.netOcc, format: '', reverse: false, max: 100 },
  creditFreq: { label: 'Credit Freq', target: TARGETS.creditFreq, format: '', reverse: true, max: 20 },
  vhi: { label: 'VHI', target: TARGETS.grossAddsFwa, format: '', reverse: false, max: 20, isInteger: true },
  ncw: { label: 'NCW %', target: TARGETS.ncw, format: '%', reverse: true, max: 100 }
};


const getDynamicTarget = (key, count = 1) => {
  const validCount = Math.max(1, count || 1);
  if (key === 'phoneAdds') return Math.ceil(validCount * 1.3);
  return METRIC_CONFIG[key]?.target;
};


const getDynamicMax = (key, count = 1) => {
  const validCount = Math.max(1, count || 1);
  if (key === 'phoneAdds') return Math.max(20, Math.ceil(validCount * 1.3) * 1.5);
  return METRIC_CONFIG[key]?.max || 100;
};


const COL_DEFINITIONS = [
  { key: 'vxs', stateKey: 'vxs', label: 'C-Sat', format: '', reverse: false },
  { key: 'resolve2hr', stateKey: 'resolve2hr', label: '2HR', format: '', reverse: false },
  { key: 'phoneAdds', stateKey: 'phoneAdds', label: 'Phone Lines', format: '', reverse: false, isInteger: true },
  { key: 'handoffs', stateKey: 'handoffs', label: 'Hand-offs', format: '', reverse: true },
  { key: 'resolve3d', stateKey: 'resolve3d', label: '3DR', format: '', reverse: false },
  { key: 'aht', stateKey: 'aht', label: 'AHT', format: '', reverse: true },
  { key: 'hold', stateKey: 'hold', label: 'Hold', format: '', reverse: true },
  { key: 'dpc', stateKey: 'dpc', label: 'DPC', format: '', reverse: true },
  { key: 'viewTogether', stateKey: 'vtt', label: 'VTT', format: '', reverse: false },
  { key: 'netOcc', stateKey: 'netOcc', label: 'Net OCC', format: '', reverse: false },
  { key: 'creditFreq', stateKey: 'creditFreq', label: 'Credit Freq', format: '', reverse: true },
  { key: 'vhi', stateKey: 'vhi', label: 'VHI', format: '', reverse: false, isInteger: true },
  { key: 'ncw', stateKey: 'ncw', label: 'NCW %', format: '%', reverse: true }
];


const PERSONA = `You are a data-driven, direct, and results-oriented performance improvement consultant. Use simple, everyday English.`;


// Single shared search filter — used across hooks and components.
// Checks agent name, supervisor, OAM, coding track, and phase against all query terms.
const agentMatchesSearch = (a, queries) => {
  if (queries.length === 0) return true;
  return queries.some(q =>
    (a.supervisor && a.supervisor.toLowerCase().includes(q)) ||
    (a.oam && a.oam.toLowerCase().includes(q)) ||
    (a.name && a.name.toLowerCase().includes(q)) ||
    (a.coding && a.coding.toLowerCase().includes(q)) ||
    (a.phase && a.phase.toLowerCase().includes(q))
  );
};


const GeminiLoader = ({ message = "Cooking it up...", color = "#3b82f6", icon = "✨" }) => (
  <div className="flex flex-col items-center justify-center p-8 gap-4">
    <div className="flex items-center justify-center">
        <div className="loader-spin rounded-full w-12 h-12 relative flex items-center justify-center" style={{
          border: `4px solid ${color}33`,
          borderTop: `4px solid ${color}`
        }}>
           <span className="absolute text-sm" style={{ animation: 'none' }}>{icon}</span>
        </div>
    </div>
    <span className="font-bold text-lg tracking-wide" style={{ color }}>
      {message}
    </span>
  </div>
);


const FormattedText = ({ text, linkedEntities, onEntityClick }) => {
  if (!text || typeof text !== 'string') return null;


  const parseForEntities = (textStr) => {
    if (!linkedEntities || linkedEntities.length === 0 || !onEntityClick) return textStr;
    
    let segments = [{ text: textStr, isLink: false }];
    
    linkedEntities.forEach(entity => {
        if (!entity.name || entity.name.length < 4) return; 
        const escapedName = entity.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b(${escapedName})\\b`, 'gi');
        
        const newSegments = [];
        segments.forEach(seg => {
            if (!seg.isLink && typeof seg.text === 'string') {
                const chunks = seg.text.split(regex);
                chunks.forEach(chunk => {
                    if (chunk.toLowerCase() === entity.name.toLowerCase()) {
                        newSegments.push({ text: chunk, isLink: true, type: entity.type });
                    } else if (chunk) {
                        newSegments.push({ text: chunk, isLink: false });
                    }
                });
            } else {
                newSegments.push(seg);
            }
        });
        segments = newSegments;
    });
    
    return segments.map((seg, i) => {
        if (seg.isLink) {
            return (
                <span 
                    key={i} 
                    className="text-blue-600 font-bold cursor-pointer hover:underline border-b border-dashed border-blue-400 mx-0.5 px-1 bg-blue-50 rounded transition-colors inline-block leading-none"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEntityClick(seg.text, seg.type); }}
                    title={`Click to view ${seg.type} details`}
                >
                    {seg.text}
                </span>
            );
        }
        return seg.text;
    });
  };


  return (
    <>
      {text.split('\n').map((line, lineIdx) => {
        if (line.trim() === '') return <div key={lineIdx} className="h-4"></div>;
        let isChecklist = false; let isBullet = false; let cleanLine = line;
        
        if (/^\s*---\s*$/.test(line)) {
            return <hr key={lineIdx} className="my-8 border-t-2 border-slate-100" />;
        }
        else if (/^\s*###\s+/.test(line)) {
            cleanLine = line.replace(/^\s*###\s+/, '');
            return <h3 key={lineIdx} className="text-xl font-black text-slate-800 mt-6 mb-3">{parseForEntities(cleanLine)}</h3>;
        }
        else if (/^\s*[-*]\s*\[\s*\]\s*/.test(line)) { isChecklist = true; cleanLine = line.replace(/^\s*[-*]\s*\[\s*\]\s*/, ''); } 
        else if (/^\s*\[\s*\]\s*/.test(line)) { isChecklist = true; cleanLine = line.replace(/^\s*\[\s*\]\s*/, ''); } 
        else if (/^\s*[-*]\s+/.test(line)) { isBullet = true; cleanLine = line.replace(/^\s*[-*]\s+/, ''); }


        const formattedLine = cleanLine.split(/(\*\*.*?\*\*)/g).map((part, index) => {
          if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={index} className="font-extrabold text-slate-900">{parseForEntities(part.slice(2, -2))}</strong>;
          }
          return <React.Fragment key={index}>{parseForEntities(part)}</React.Fragment>;
        });


        if (isChecklist) {
            return (
              <label key={lineIdx} className="flex items-start gap-3 my-2 ml-2 cursor-pointer group">
                <input type="checkbox" className="mt-1 w-4 h-4 accent-blue-600 cursor-pointer shadow-sm" />
                <span className="flex-1 group-hover:text-slate-900 transition-colors leading-relaxed text-[0.95rem]">{formattedLine}</span>
              </label>
            );
        } else if (isBullet) {
            return (
              <div key={lineIdx} className="flex items-start gap-3 my-1.5 ml-2">
                <span className="text-blue-500 font-bold mt-0.5">•</span><span className="flex-1 leading-relaxed">{formattedLine}</span>
              </div>
            );
        }
        return <div key={lineIdx} className="my-1 leading-relaxed">{formattedLine}</div>;
      })}
    </>
  );
};


const SubMetricCard = ({ label, val, metricKey, agentCount, decimals = 2, prefix = '', suffix = '' }) => {
  const isMissing = val === null || val === undefined || isNaN(val) || val === '';
  const tgt = getDynamicTarget(metricKey, agentCount);
  const isReverse = METRIC_CONFIG[metricKey]?.reverse;
  let color = '#0b0f19';
  if (!isMissing && tgt !== undefined && tgt !== null) {
     color = isReverse ? (val <= tgt ? '#10B981' : '#dc2626') : (val >= tgt ? '#10B981' : '#dc2626');
  }
  
  let displayVal = '-';
  if (!isMissing) {
      if (['phoneAdds', 'vhi', 'aht', 'hold'].includes(metricKey)) displayVal = Math.round(val);
      else displayVal = Number(val).toFixed(decimals);
  }


  return (
    <div className="flex flex-col items-center bg-white p-3 px-2 rounded-lg border border-slate-300 shadow-sm transition-transform duration-300 hover:-translate-y-1 hover:shadow-md cursor-default">
      <div className="text-xs text-slate-500 font-bold uppercase whitespace-nowrap mb-1">{label}</div>
      <div className="text-xl font-extrabold" style={{ color }}>{displayVal === '-' ? '-' : `${prefix}${displayVal}${suffix}`}</div>
    </div>
  );
};


const DonutChart = ({ value, target, label, format = '', reverse = false, max = 100, isInteger = false }) => {
  const isMissing = value === null || value === undefined || value === '' || isNaN(value);
  const isGood = reverse ? value <= target : value >= target;
  const displayValue = isMissing ? '-' : (isInteger ? Math.round(Number(value)) : Number(value).toFixed(2));
  const color = isMissing ? '#334155' : (isGood ? '#10B981' : '#ef4444');
  const pct = isMissing ? 0 : Math.min(100, Math.max(0, (value / max) * 100));


  return (
    <div className="flex flex-col items-center gap-2 transition-transform duration-300 hover:scale-105 cursor-default">
      <div className="relative w-16 h-16">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" className="fill-none stroke-slate-800 stroke-3" />
          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" className="fill-none stroke-3 rounded-stroke transition-stroke" stroke={color} strokeDasharray={`${pct}, 100`} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-extrabold leading-none text-base" style={{ color: isMissing ? '#94a3b8' : '#ffffff' }}>{displayValue}</span>
          {!isMissing && <span className="text-xs text-slate-400">{format}</span>}
        </div>
      </div>
      <div className="text-center">
        <span className="text-xs text-slate-300 uppercase font-bold tracking-wide block max-w-80 whitespace-nowrap overflow-hidden text-ellipsis">{label}</span>
        <span className="text-xs text-slate-500 font-semibold">TGT: {target}{format}</span>
      </div>
    </div>
  );
};


const MetricCell = ({ value, target, format = '', reverse = false, isOff = false, isInteger = false }) => {
  const isMissing = value === null || value === undefined || value === '' || isNaN(value);
  if (isOff || isMissing) return <div className="text-center w-full"><span className="font-medium italic text-slate-500">-</span></div>;
  const isGood = reverse ? value <= target : value >= target;
  return (
    <div className="text-center w-full">
      <span className="font-semibold" style={{ color: isGood ? '#10B981' : '#ef4444' }}>
        {isInteger ? Math.round(Number(value)) : Number(value).toFixed(2)}{format}
      </span>
    </div>
  );
};


const ParetoColumn = ({ title, icon, data, colorObj, valKey, labelFn, onItemClick }) => (
  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3 transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
    <div className="text-sm font-extrabold uppercase mb-2 flex items-center gap-2" style={{ color: colorObj.dark }}>
      <span className="text-lg">{icon}</span> {title}
    </div>
    <div className="flex flex-col gap-2">
      {data && data.length > 0 ? data.map((item, idx) => (
        <div 
          key={item.agent.ccms || idx} 
          className={`flex justify-between items-center text-sm border-b border-slate-100 pb-2 last:border-0 last:pb-0 ${onItemClick ? 'cursor-pointer hover:bg-slate-50 transition-colors rounded p-1 -mx-1 px-2' : ''}`}
          onClick={() => onItemClick && onItemClick(item)}
          title={onItemClick ? "Click to drill down into Supervisor overview" : ""}
        >
          <div className="flex flex-col pointer-events-none">
            <span className="font-bold text-slate-800">{item.agent.name}</span>
            <span className="text-xs text-slate-500">Sup: {item.agent.supervisor}</span>
          </div>
          <span className="font-extrabold text-lg pointer-events-none" style={{ color: colorObj.dark }}>
            {labelFn(item)}
          </span>
        </div>
      )) : (
        <div className="text-sm text-slate-400 italic py-4 text-center border border-dashed border-slate-200 rounded-lg">No outliers found</div>
      )}
    </div>
  </div>
);


const PerformanceHeatmap = ({ activeDates, chartData, metricConfig, baseTarget, onCellClick }) => {
  if (!chartData || chartData.length === 0) return <div className="text-slate-500 text-sm mt-4">No data available for trend chart.</div>;
  
  return (
    <div className="mt-4 overflow-x-auto border border-slate-200 rounded-lg shadow-sm">
      <table className="heatmap-table w-full text-left bg-white">
        <thead>
          <tr>
            <th className="bg-slate-50 p-3 border-b border-r border-slate-200 font-bold text-slate-700 w-1/4">Entity Name</th>
            {activeDates.map(d => (
              <th key={d} className="bg-slate-50 p-3 border-b border-slate-200 font-bold text-slate-700 text-center whitespace-nowrap">{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {chartData.map((row, idx) => (
            <tr key={idx} className="hover:bg-slate-50 transition-colors">
              <td className="p-3 border-b border-r border-slate-200 font-semibold text-slate-800 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: row.color }}></span>
                {row.name}
              </td>
              {activeDates.map(d => {
                const val = row.series[d];
                const isMissing = val === undefined || val === null || isNaN(val);
                let color = '#64748b';
                
                if (!isMissing && baseTarget !== undefined && baseTarget !== null && metricConfig) {
                  const isGood = metricConfig.reverse ? val <= baseTarget : val >= baseTarget;
                  color = isGood ? '#10B981' : '#ef4444';
                }
                
                return (
                  <td 
                    key={d} 
                    className={`p-3 border-b border-slate-200 text-center font-bold ${!isMissing && onCellClick ? 'cursor-pointer hover:bg-slate-100 transition-colors' : ''}`} 
                    style={{ color }}
                    onClick={() => onCellClick && !isMissing && onCellClick(d)}
                    title={!isMissing && onCellClick ? `Click to view Floor Roster for ${d}` : ''}
                  >
                    {isMissing ? '-' : `${Number(val).toFixed(2)}${metricConfig?.format || ''}`}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};


const calculateBonus = (vxs, r3d, handoffs) => {
    if (vxs == null || r3d == null || handoffs == null) return null;
    const vxsAttain = Math.min(1.2, vxs / TARGETS.vxs);
    const r3dAttain = Math.min(1.2, r3d / TARGETS.resolve3d);
    const handoffsAttain = handoffs === 0 ? 1.2 : Math.min(1.2, TARGETS.handoffs / handoffs);
    return (vxsAttain * 50) + (r3dAttain * 20) + (handoffsAttain * 20) + 10;
};


const aggregateRecords = (records) => {
    let calls = 0, sumResolveTotalContacts = 0, sumTalkTime = 0, callsWithAht = 0, surveys = 0, promoters = 0;
    let totalResContacts3d = 0, totalRepeats3d = 0, totalResContacts2hr = 0, totalRepeats2hr = 0, ncwCount = 0;
    let sumHandoffsCount = 0, callsWithHandoffs = 0, sumHoldTime = 0, callsWithHold = 0, sumDpcTime = 0, callsWithDpc = 0;
    let sumVtt = 0, callsWithVtt = 0, sumVttSent = 0, sumVttTransacted = 0, sumNetOcc = 0, callsWithNetOcc = 0, sumCreditFreq = 0, callsWithCreditFreq = 0;
    let sumPhoneAdds = null, sumVhi = null, activeDays = 0;


    records.forEach(d => {
        if (!d) return;


        if (d.phoneAdds != null) { sumPhoneAdds = (sumPhoneAdds || 0) + d.phoneAdds; }
        if (d.vhi != null) { sumVhi = (sumVhi || 0) + d.vhi; }


        if (d.isOff) return;
        activeDays++;


        const c = d.calls || 0;
        calls += c;
        
        sumResolveTotalContacts += (d.resolveTotalContacts || 0);
        
        const resTotal = d.resolveTotalContacts != null ? d.resolveTotalContacts : c;
        ncwCount += Math.max(0, c - resTotal);


        if (d.aht != null) { sumTalkTime += (d.aht * c); callsWithAht += c; }
        if (d.hold != null) { sumHoldTime += (d.hold * c); callsWithHold += c; }
        if (d.dpc != null) { sumDpcTime += (d.dpc * c); callsWithDpc += c; }
        if (d.netOcc != null) { sumNetOcc += (d.netOcc * c); callsWithNetOcc += c; }
        if (d.creditFreq != null) { sumCreditFreq += (d.creditFreq * c); callsWithCreditFreq += c; }
        if (d.viewTogether != null) { sumVtt += (d.viewTogether * c); callsWithVtt += c; }
        if (d.vttSent != null) { sumVttSent += d.vttSent; }
        if (d.vttTransacted != null) { sumVttTransacted += d.vttTransacted; }


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
            surveys += simulatedSurveys; promoters += simulatedSurveys * (d.vxs / 100);
        }


        const resContacts3d = d.resolveTotalContacts3d != null ? d.resolveTotalContacts3d : resTotal;
        const resContacts2hr = d.resolveTotalContacts2hr != null ? d.resolveTotalContacts2hr : resTotal;


        if (d.resolve3d != null) { totalResContacts3d += resContacts3d; totalRepeats3d += resContacts3d * ((100 - d.resolve3d) / 100); }
        if (d.resolve2hr != null) { totalResContacts2hr += resContacts2hr; totalRepeats2hr += resContacts2hr * ((100 - d.resolve2hr) / 100); }
    });


    if (activeDays === 0) return { isOff: true, activeAgentCount: 0, calls: 0, vxs: null, resolve3d: null, handoffs: null, resolve2hr: null, aht: null, hold: null, dpc: null, viewTogether: null, vtt: null, netOcc: null, creditFreq: null, phoneAdds: sumPhoneAdds, vhi: sumVhi, ncw: null, ncwCount: 0, bonus: null };


    const vxs = surveys > 0 ? (promoters / surveys) * 100 : null;
    const resolve3d = totalResContacts3d > 0 ? (1 - (totalRepeats3d / totalResContacts3d)) * 100 : null;
    const resolve2hr = totalResContacts2hr > 0 ? (1 - (totalRepeats2hr / totalResContacts2hr)) * 100 : null;
    const handoffs = callsWithHandoffs > 0 ? (sumHandoffsCount / callsWithHandoffs) * 100 : null;
    const ncwPct = calls > 0 ? (ncwCount / calls) * 100 : null;


    let viewTogether = null;
    if (sumVttSent > 0) {
        viewTogether = (sumVttTransacted / sumVttSent) * 100;
    } else if (callsWithVtt > 0) {
        viewTogether = (sumVtt / callsWithVtt);
    }


    return {
        isOff: false, activeAgentCount: 1, calls, resolveTotalContacts: sumResolveTotalContacts, resolveTotalContacts3d: totalResContacts3d, resolveTotalContacts2hr: totalResContacts2hr,
        surveys, promoters, handoffsCount: sumHandoffsCount, repeats3d: totalRepeats3d, repeats2hr: totalRepeats2hr, detractors: surveys > 0 ? (surveys - promoters) : 0,
        aht: callsWithAht > 0 ? (sumTalkTime / callsWithAht) : null, vxs, resolve3d, resolve2hr, handoffs,
        hold: callsWithHold > 0 ? (sumHoldTime / callsWithHold) : null, dpc: callsWithDpc > 0 ? (sumDpcTime / callsWithDpc) : null,
        viewTogether, vtt: viewTogether, vttSent: sumVttSent, vttTransacted: sumVttTransacted, netOcc: callsWithNetOcc > 0 ? (sumNetOcc / callsWithNetOcc) : null,
        creditFreq: callsWithCreditFreq > 0 ? (sumCreditFreq / callsWithCreditFreq) : null, phoneAdds: sumPhoneAdds, vhi: sumVhi, ncw: ncwPct, ncwCount, bonus: calculateBonus(vxs, resolve3d, handoffs)
    };
};


const aggregateTeamMetrics = (agentDatas) => {
  let totalCalls = 0, totalCallsAht = 0, totalTalkTime = 0, totalPromoters = 0, totalSurveys = 0, sumHandoffs = 0, countHandoffs = 0, totalHandoffsCount = 0;
  let totalResContacts3d = 0, totalRepeats3d = 0, totalResContacts2hr = 0, totalRepeats2hr = 0, totalResolveContacts = 0, totalNcwCount = 0;
  let sumHold = 0, countHold = 0, sumDpc = 0, countDpc = 0, sumVtt = 0, countVtt = 0, sumVttSent = 0, sumVttTransacted = 0, sumNetOcc = 0, countNetOcc = 0, sumCreditFreq = 0, countCreditFreq = 0;
  let totalPhoneAdds = null, totalVhi = null, totalDetractors = 0, validCount = 0;


  agentDatas.forEach(aData => {
    if (!aData) return;


    if (aData.phoneAdds != null) { totalPhoneAdds = (totalPhoneAdds || 0) + aData.phoneAdds; }
    if (aData.vhi != null) { totalVhi = (totalVhi || 0) + aData.vhi; }


    if (aData.isOff) return;
    validCount++;
    const calls = aData.calls || 0, surveys = aData.surveys || 0, promoters = aData.promoters || 0;


    totalCalls += calls; 
    const rContacts = aData.resolveTotalContacts != null ? aData.resolveTotalContacts : calls;
    totalResolveContacts += rContacts;
    totalNcwCount += Math.max(0, calls - rContacts);


    if (aData.aht != null) { totalCallsAht += calls; totalTalkTime += (aData.aht * calls); }
    
    if (aData.vxs != null) { totalSurveys += surveys; totalPromoters += promoters; }
    
    totalDetractors += (aData.detractors || 0); totalHandoffsCount += (aData.handoffsCount || 0);


    const resContacts3d = aData.resolveTotalContacts3d != null ? aData.resolveTotalContacts3d : rContacts;
    const resContacts2hr = aData.resolveTotalContacts2hr != null ? aData.resolveTotalContacts2hr : rContacts;


    if (aData.resolve3d != null) { totalResContacts3d += resContacts3d; totalRepeats3d += aData.repeats3d !== undefined ? aData.repeats3d : (resContacts3d * ((100 - aData.resolve3d) / 100)); }
    if (aData.resolve2hr != null) { totalResContacts2hr += resContacts2hr; totalRepeats2hr += aData.repeats2hr !== undefined ? aData.repeats2hr : (resContacts2hr * ((100 - aData.resolve2hr) / 100)); }
    if (aData.handoffs != null) { sumHandoffs += aData.handoffs; countHandoffs++; }
    if (aData.hold != null) { sumHold += aData.hold; countHold++; }
    if (aData.dpc != null) { sumDpc += aData.dpc; countDpc++; }
    if (aData.viewTogether != null) { sumVtt += aData.viewTogether; countVtt++; }
    if (aData.vttSent != null) { sumVttSent += aData.vttSent; }
    if (aData.vttTransacted != null) { sumVttTransacted += aData.vttTransacted; }
    if (aData.netOcc != null) { sumNetOcc += aData.netOcc; countNetOcc++; }
    if (aData.creditFreq != null) { sumCreditFreq += aData.creditFreq; countCreditFreq++; }
  });


  if (validCount === 0) return { isOff: true, activeAgentCount: 0, calls: null, resolveTotalContacts: null, vxs: null, resolve3d: null, handoffs: null, resolve2hr: null, aht: null, hold: null, dpc: null, viewTogether: null, vtt: null, netOcc: null, creditFreq: null, phoneAdds: totalPhoneAdds, vhi: totalVhi, ncw: null, ncwCount: 0, bonus: null };


  const vxs = totalSurveys > 0 ? (totalPromoters / totalSurveys) * 100 : null;
  const resolve3d = totalResContacts3d > 0 ? (1 - (totalRepeats3d / totalResContacts3d)) * 100 : null;
  const resolve2hr = totalResContacts2hr > 0 ? (1 - (totalRepeats2hr / totalResContacts2hr)) * 100 : null;
  const handoffs = countHandoffs > 0 ? (sumHandoffs / countHandoffs) : null;
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
    aht: totalCallsAht > 0 ? (totalTalkTime / totalCallsAht) : null, vxs, resolve3d, resolve2hr, handoffs, hold: countHold > 0 ? (sumHold / countHold) : null,
    dpc: countDpc > 0 ? (sumDpc / countDpc) : null, viewTogether, vtt: viewTogether, vttSent: sumVttSent, vttTransacted: sumVttTransacted, netOcc: countNetOcc > 0 ? (sumNetOcc / countNetOcc) : null,
    creditFreq: countCreditFreq > 0 ? (sumCreditFreq / countCreditFreq) : null, phoneAdds: totalPhoneAdds, vhi: totalVhi, ncw: ncwPct, ncwCount: totalNcwCount, bonus: calculateBonus(vxs, resolve3d, handoffs)
  };
};


const calculateWeightedVSF = (agentsList, metricKey) => {
    if (!['vxs', 'resolve3d', 'resolve2hr'].includes(metricKey)) return null;


    const validAgents = agentsList.filter(a => a && !a.isOff && a.data && a.data[metricKey] !== null && a.data[metricKey] !== undefined);
    if (validAgents.length < 2) return null;


    let totalWeight = 0;
    let totalDefects = 0;


    validAgents.forEach(a => {
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


    const weightedAveragePct = (1 - (totalDefects / totalWeight)) * 100;
    const targetIsReverse = METRIC_CONFIG[metricKey]?.reverse;


    let varianceSum = 0;
    validAgents.forEach(a => {
        const diff = a.data[metricKey] - weightedAveragePct;
        varianceSum += (diff * diff);
    });


    const stdDev = Math.sqrt(varianceSum / validAgents.length);
    const vsf = (6 * stdDev) / weightedAveragePct;


    validAgents.sort((a, b) => {
        if (targetIsReverse) return b.data[metricKey] - a.data[metricKey];
        return a.data[metricKey] - b.data[metricKey];
    });
    
    const worstOutliers = validAgents.slice(0, 3).map(a => {
        return `[${a.agent.name} (Sup: ${a.agent.supervisor}) -> ${Math.round(a._vsfDefect)} Defects out of ${Math.round(a._vsfWeight)} Volume]`;
    }).join(", ");


    if (vsf > 1.0) {
        return `VSF is ${vsf.toFixed(2)}. This is an OUTLIER ISSUE. Your action plan MUST target specific bottom-performing individuals for 1-on-1 coaching. The process works, but specific agents are failing. Mathematical Proof: ${worstOutliers}. You must prove your point mathematically by quoting these exact numbers.`;
    } else {
        return `VSF is ${vsf.toFixed(2)}. This is a PROCESS ISSUE. Your action plan MUST NOT target individuals. Recommend floor-wide changes. Mathematical Proof: Despite top offenders like ${worstOutliers}, the variance is too tight. The entire team is failing the process together. You must prove your point mathematically by quoting the overall volume vs defects.`;
    }
};


const calculateTrend = (currentData, baselineData) => {
  if (!currentData || currentData.isOff || typeof currentData.vxs !== 'number' || !baselineData || typeof baselineData.vxs !== 'number' || isNaN(currentData.vxs)) {
    return { direction: 'stable', label: 'OFF', diff: 0, diffStr: '-' };
  }
  const diff = currentData.vxs - baselineData.vxs;
  const diffStr = (diff >= 0 ? '+' : '') + diff.toFixed(2) + '%';
  if (diff >= 1.0) return { direction: 'up', label: '📈 UP', diff, diffStr };
  if (diff <= -1.0) return { direction: 'down', label: '📉 DOWN', diff, diffStr };
  return { direction: 'stable', label: '✊ STABLE', diff, diffStr };
};


const formatName = (fullName) => {
    if (!fullName) return '';
    const parts = fullName.split(',');
    if (parts.length === 2) return `${parts[1].trim()} ${parts[0].trim()}`;
    return fullName.trim();
};

// For supervisor/OAM display names specifically: long multi-word names
// (common in Arabic-style full names, e.g. "Ahmed Mohamed Elsayed Mohamed
// Elshebiny") are shortened to First + Last word only ("Ahmed Elshebiny")
// for readability in tables and cards. Short names (<=2 words) pass through.
const shortenManagerName = (fullName) => {
    if (!fullName) return fullName;
    const words = fullName.trim().split(/\s+/).filter(Boolean);
    if (words.length <= 2) return fullName.trim();
    return `${words[0]} ${words[words.length - 1]}`;
};


const normalizeDate = (dStr) => {
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


const parseCSVLine = (line, delimiter) => {
  if (delimiter === '\t') return line.split('\t').map(c => c.trim().replace(/^"|"$/g, ''));
  const result = [];
  let current = '';
  let inQuotes = false;
  const cleanLine = line.replace(/&amp;/g, '&');
  for(let i=0; i<cleanLine.length; i++) {
    if (cleanLine[i] === '"') { inQuotes = !inQuotes; } 
    else if (cleanLine[i] === ',' && !inQuotes) { result.push(current.trim()); current = ''; } 
    else { current += cleanLine[i]; }
  }
  result.push(current.trim());
  return result.map(s => s.replace(/^"|"$/g, ''));
};


const getWeekNumber = (dateStr) => {
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


// Returns day-of-week (0=Sun … 6=Sat) from a YYYY-MM-DD string using pure
// integer arithmetic (Tomohiko Sakamoto's algorithm). Verified against
// Date.getDay() including leap years and year boundaries. Zero Date objects
// constructed — eliminates 1,500+ per-render allocations in the DOW cache.
const dowFromDateStr = (d) => {
  const y = +d.slice(0, 4), m = +d.slice(5, 7), day = +d.slice(8, 10);
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const yr = m < 3 ? y - 1 : y;
  return (yr + Math.floor(yr / 4) - Math.floor(yr / 100) + Math.floor(yr / 400) + t[m - 1] + day) % 7;
};

// ════════════════════════════════════════════════════════════════════════════
// CONCEPT-BASED CSV FORMAT DETECTION
// ────────────────────────────────────────────────────────────────────────────
// Instead of hardcoding one fixed report layout, every metric is described as
// a "concept" with several possible representations across different source
// systems (Verizon vs AT&T vs other vendors, pre-aggregated vs raw call-level
// exports, etc). At upload time we scan the headers once, detect which mode
// each concept is in, and parse accordingly. Adding support for a new export
// format later just means adding new header matchers below — no new parser.
//
// MODES:
//   'rate'             - column is already a final percentage/value (today's
//                         original format, e.g. "VXS Combined %"). Used as-is.
//   'flag_sum'         - column is a 0/1 flag per raw row (e.g. Resolve_2Hr_Count).
//                         Summed across all rows for the same agent+day, then
//                         divided by the row count (or call count) to get a rate.
//   'count_sum'        - column is a raw numeric count per row (e.g. Handle_Tm_Seconds,
//                         CallsAnswered). Summed across rows for the same agent+day.
//   'promoter_total'    - paired columns (promoters, total) summed separately,
//                         then divided: promoters / total * 100.
// ════════════════════════════════════════════════════════════════════════════

const COLUMN_PATTERNS = {
  // ── Identity / join keys ───────────────────────────────────────────────
  // Uses both the raw header (h) and a punctuation-stripped version (hn) so
  // "Employee Name", "EmployeeName", and "employee_name" all match the same way.
  name:        { match: (h, hn) => h === 'name' || h === 'agent name' || h === 'rep name' || h === 'employee name' || hn === 'employeename' || hn === 'repname' || hn === 'agentname' },
  // CCMS-style IDs are preferred (more reliable join key) over generic vendor IDs like ATTUID/SID.
  employeeId:  { match: (h, hn) => hn === 'employeeid' || h === 'ccms' || h === 'ccms ident' || h.includes('ccms ident') || hn.includes('ccmsident') },
  employeeIdFallback: { match: (h, hn) => h === 'attuid' || h === 'sid' },
  // Supervisor = the agent's direct manager (full name), never a short alias/ID code
  // like "Team Manager" or "ATTUID" which are internal codes, not display names.
  supervisor:  { match: (h, hn) => h === 'manager 1' || h === 'supervisor name' || h === 'supervisor' || h === 'sup name' || h === 'spv' || hn === 'spv' || h.includes('direct manager name') },
  // OAM = ACM (Assistant Call center Manager) = the level above supervisor, full name.
  oam:         { match: (h, hn) => h === 'manager 2' || h === 'oam' || h === 'manager' || h.includes('acm name') },
  date:        { match: (h, hn) => h === 'startdate' || h === 'start date' || h === 'date' || h === 'reportdate' || h === 'survey date' },
  location:    { match: (h, hn) => h === 'location' || h === 'site' || hn === 'geographiclocationdescription' },

  // ── Volume / calls handled ──────────────────────────────────────────────
  calls:       { match: (h) => h === 'calls handled' || h === 'total contacts', mode: 'rate' },
  callsRaw:    { match: (h, hn) => hn === 'callsanswered', mode: 'count_sum' },

  // ── AHT (handle time) ───────────────────────────────────────────────────
  aht:         { match: (h) => h === 'aht', mode: 'rate' },
  handleTimeRaw: { match: (h, hn) => hn === 'handletmseconds', mode: 'count_sum' },

  // ── VXS / CSAT ───────────────────────────────────────────────────────────
  vxs:         { match: (h) => h.includes('vxs combined overall rep success') || h === 'csat %' || h === 'csat' || h === 'vxs combined %', mode: 'rate' },
  surveys:     { match: (h) => h === 'vxs combined overall count' || h === 'surveys answered', mode: 'rate' },
  promoters:   { match: (h, hn) => h === 'vxs combined overall top box' || h === 'promoters' || hn === "peromters" || hn === "promoters", mode: 'rate_or_sum' },
  vxsTotalRaw: { match: (h, hn) => h === 'total' || hn === 'vxsoverallrepcnt', mode: 'count_sum' },
  vxsPassRaw:  { match: (h, hn) => hn === 'vxsoverallreppass', mode: 'flag_sum' },
  detractors:  { match: (h) => h === 'detractors', mode: 'count_sum' },
  satisfaction:{ match: (h) => h === 'satisfaction', mode: 'avg' },
  knowledge:   { match: (h) => h === 'knowledge', mode: 'avg' },

  // ── Resolve windows ──────────────────────────────────────────────────────
  resolve2hr:        { match: (h) => h === '2 hour resolve' || h === '2hr', mode: 'rate' },
  resolve2hrFlag:     { match: (h, hn) => hn === 'resolve2hrcount', mode: 'flag_sum' },
  resolve3d:         { match: (h) => h === '3 day resolve' || h === '3dr', mode: 'rate' },
  resolve3dFlag:      { match: (h, hn) => hn === 'resolve3daycount', mode: 'flag_sum' },
  resolve3dContacts: { match: (h) => h === '3 day resolve contacts' || h === '3dr contacts' || (h.includes('3') && h.includes('resolve') && h.includes('contact')) },
  resolve2hrContacts:{ match: (h) => h === '2 hour resolve contacts' || h === '2hr contacts' || (h.includes('2') && h.includes('resolve') && h.includes('contact')) },
  resolveContactsFallback: { match: (h) => h === 'resolve total contacts' || (h.includes('resolve') && h.includes('contact') && !h.includes('2') && !h.includes('3')) },
  resolveContactsRaw: { match: (h, hn) => hn === 'resolvetotalcontacts', mode: 'count_sum' },

  // ── Transfer / Hand-offs ─────────────────────────────────────────────────
  handoffsPct:    { match: (h) => h === 'net handoffs %' || h === 'hand offs %', mode: 'rate' },
  handoffsCount:  { match: (h) => h === 'net handoffs', mode: 'rate' },
  transferFlag:   { match: (h, hn) => hn === 'transferflag', mode: 'flag_sum' },

  // ── Hold / DPC / VTT / Net OCC / Credit / Phone Adds / VHI (unchanged) ──
  hold:        { match: (h) => h === 'hold time avg' || h === 'hold', mode: 'rate' },
  dpc:         { match: (h) => h === 'real time agent dpc' || h === 'dpc', mode: 'rate' },
  vtt:         { match: (h) => h.includes('view together attach') || h === 'vtt' || (h.includes('view together') && !h.includes('sent') && !h.includes('transacted')), mode: 'rate' },
  vttSent:     { match: (h) => h.includes('view together sent') },
  vttTransacted: { match: (h) => h.includes('view together transacted') },
  netOcc:      { match: (h) => h.includes('net occ per call') || h === 'net occ', mode: 'rate' },
  creditFreq:  { match: (h) => h.includes('credit frequency'), mode: 'rate' },
  phoneAdds:   { match: (h) => h === 'phone adds' || h === 'total phone adds' || h === 'phones', mode: 'rate' },
  vhi:         { match: (h) => h.includes('gross adds fwa') || h === 'vhi' || h.includes('fwa') || h.includes('fixed wireless access') || h.includes('home internet'), mode: 'rate' },

  // ── Resolved / Not resolved (book_2_ style) ─────────────────────────────
  requestResolved: { match: (h) => h === 'request resolved' || h === 'not resolved' },
};

// Scans normalized (lowercased/trimmed) headers once and returns the column
// index detected for every known concept, or -1 if not present in this file.
// Each header is checked both in raw form and with all non-alphanumeric
// characters stripped, so "Employee Name" / "EmployeeName" / "employee_name"
// all resolve to the same concept regardless of source-system formatting.
const detectColumns = (headers) => {
  const normalized = headers.map(h => h.replace(/[^a-z0-9]/g, ''));
  const found = {};
  for (const key in COLUMN_PATTERNS) {
    found[key] = headers.findIndex((h, i) => COLUMN_PATTERNS[key].match(h, normalized[i]));
  }
  // CCMS-style ID is preferred; only fall back to ATTUID/SID-style IDs if no CCMS ID was found.
  if (found.employeeId === -1 && found.employeeIdFallback !== -1) {
    found.employeeId = found.employeeIdFallback;
  }
  return found;
};

// A file is "raw/granular" (needs rollup before use) if it has flag_sum or
// count_sum columns for core metrics but NO ready-made rate column for them.
// Otherwise it's treated as already-aggregated (today's original format).
const isRawGranularFormat = (cols) => {
  const hasRawSignals = cols.vxsPassRaw !== -1 || cols.resolve2hrFlag !== -1 || cols.resolve3dFlag !== -1 || cols.handleTimeRaw !== -1 || cols.detractors !== -1;
  const hasReadyRates = cols.vxs !== -1 && cols.resolve2hr !== -1;
  return hasRawSignals && !hasReadyRates;
};


const useDashboardData = (onDataReset = null) => {
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

  // Shared by both <input type="file"> (click-to-upload) and drag-and-drop.
  // Accepts a raw File object directly instead of requiring a real DOM event.
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
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length < 2) {
          setUploadStatus({ type: 'error', message: 'File is empty or missing data rows.' });
          return;
        }


        const delimiter = lines[0].includes('\t') ? '\t' : ',';
        const headers = parseCSVLine(lines[0], delimiter).map(h => h.toLowerCase().trim());


        // ── Concept-based detection: works across any source system's column naming ──
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

        // Resolves a raw row's date cell, falling back to scanning for any
        // date-shaped value if no explicit date column was detected.
        const getRowDate = (row) => {
          if (dateKey !== -1 && row[dateKey]) return normalizeDate(row[dateKey]);
          const rawDateCell = row.find(c => c && typeof c === 'string' && (c.includes('/20') || c.includes(' AM') || c.includes(' PM')));
          return rawDateCell ? normalizeDate(rawDateCell) : null;
        };

        // Stable per-row identity for grouping: prefer the source system's own
        // ID column (most reliable within that system), fall back to name.
        // IDs from DIFFERENT source systems are never assumed to be the same
        // person — only used as a grouping key within a single uploaded file.
        const getRowKey = (row) => {
          if (idKey !== -1 && row[idKey]) return 'ID_' + row[idKey].trim();
          return 'NAME_' + formatName(row[nameKey] || '').toLowerCase();
        };


        // ── ROLLUP PRE-PASS (only for raw/granular call-level or survey-level files) ──
        // Groups every raw row by (agent, date) and accumulates sums for whichever
        // flag/count concepts were detected, then computes final rates per group.
        // Pre-aggregated files (today's original format) skip this entirely.
        let rollups = null;
        if (rawFormat) {
          rollups = {}; // key: `${rowKey}|${date}` -> accumulator
          for (let i = 1; i < lines.length; i++) {
            const row = parseCSVLine(lines[i], delimiter);
            if (!row[nameKey]) continue;
            const rowDate = getRowDate(row);
            if (!rowDate) continue;
            const rowKey = getRowKey(row);
            const groupKey = `${rowKey}|${rowDate}`;

            if (!rollups[groupKey]) {
              rollups[groupKey] = {
                rowKey, rowDate, rowRef: row, // keep one raw row for name/supervisor/oam lookups
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
            // 0/1 flags cascade upward: a 2hr resolve also counts toward 3-day.
            const r2hr = cols.resolve2hrFlag !== -1 ? (getFloat(row, cols.resolve2hrFlag) || 0) : 0;
            const r3d = cols.resolve3dFlag !== -1 ? (getFloat(row, cols.resolve3dFlag) || 0) : 0;
            acc.resolve2hrFlag += r2hr;
            acc.resolve3dFlag += (r2hr > 0 ? 1 : r3d); // cascade: 2hr resolve implies 3day resolve too
            if (cols.transferFlag !== -1) acc.transferFlag += getFloat(row, cols.transferFlag) || 0;
            // promoter/detractor (book_2_ style): Total=1 per survey row, Peromter's=1 if promoter
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

        // Resolves supervisor/oam/coding/phase/agent-record fields from a raw row
        // (shared by both the pre-aggregated path and the rollup path).
        const resolveAgentForRow = (row, joinKeyOverride) => {
          const rawAgentName = row[nameKey];
          const rawSupName = supKey !== -1 && row[supKey] ? row[supKey].trim() : "Unknown";
          const rawOamName = oamKey !== -1 && row[oamKey] ? row[oamKey].trim() : null;
          const locationVal = locationKey !== -1 && row[locationKey] ? row[locationKey].trim() : "Unknown";

          const agentName = formatName(rawAgentName);
          const supName = rawSupName !== "Unknown" ? shortenManagerName(formatName(rawSupName)) : "Unknown";
          const oamNameFormatted = rawOamName ? shortenManagerName(formatName(rawOamName)) : "Unknown";

          if (supName !== "Unknown") foundSupervisors.add(supName);
          if (rawOamName && !foundOam) foundOam = shortenManagerName(formatName(rawOamName));

          let coding = "Unknown";
          if (locationVal.toLowerCase().includes("new hire")) coding = "New Hire";
          else if (locationVal.toLowerCase().includes("transition")) coding = "Transition";

          let phase = "Unknown";
          if (rawOamName) {
            const mgr2 = rawOamName.toLowerCase();
            if (mgr2.includes('abdelazim') || mgr2.includes('ziad') || mgr2.includes('mohsen') || mgr2.includes('youssef')) {
              phase = "OJT";
            } else if (mgr2.includes('mohamed') || mgr2.includes('seifeldin') || mgr2.includes('shahat') || mgr2.includes('ali') || mgr2.includes('khaled') || mgr2.includes('manar')) {
              phase = "Nesting";
            }
          }

          // Join by source-system ID when available (most reliable), else by name.
          // IDs are namespaced per-upload-source via getRowKey, so an ID from one
          // system is never confused with an ID from a different system.
          const idVal = idKey !== -1 && row[idKey] ? row[idKey].trim() : null;
          let targetAgent = idVal
            ? updatedAgents.find(a => a.sourceId === idVal)
            : updatedAgents.find(a => a.name.toLowerCase() === agentName.toLowerCase());
          if (!targetAgent && idVal) {
            // also try matching an existing agent by name in case it was created without an ID
            targetAgent = updatedAgents.find(a => a.name.toLowerCase() === agentName.toLowerCase() && !a.sourceId);
          }

          if (!targetAgent) {
              targetAgent = { ccms: idVal ? ('ID_' + idVal) : ('AUTO_' + Math.random().toString(36).substr(2, 8)), sourceId: idVal, name: agentName, supervisor: supName, oam: oamNameFormatted, coding, phase };
              updatedAgents.push(targetAgent);
          } else {
              targetAgent.supervisor = supName;
              targetAgent.oam = oamNameFormatted;
              if (coding !== "Unknown") targetAgent.coding = coding;
              if (phase !== "Unknown") targetAgent.phase = phase;
              if (idVal && !targetAgent.sourceId) targetAgent.sourceId = idVal;
          }
          return targetAgent;
        };


        if (rawFormat) {
          // ── Write one history record per (agent, date) group, computed from sums ──
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

            // Rates computed AFTER summing, never averaged per-row.
            const vxsRate = acc.vxsTotalRaw > 0
              ? (acc.vxsPassRaw > 0 ? (acc.vxsPassRaw / acc.vxsTotalRaw) * 100 : (acc.promoters / acc.vxsTotalRaw) * 100)
              : null;
            // Resolve flags are 0/1 per call where 1 = call WAS repeated (unresolved).
            // So resolve rate = percentage of NON-repeated calls:
            //   (1 - sum_of_repeat_flags / calls_handled) × 100
            const resolve2hrRate = callsHandled > 0 && cols.resolve2hrFlag !== -1 ? (1 - acc.resolve2hrFlag / callsHandled) * 100 : null;
            const resolve3dRate  = callsHandled > 0 && (cols.resolve3dFlag !== -1 || cols.resolve2hrFlag !== -1) ? (1 - acc.resolve3dFlag  / callsHandled) * 100 : null;
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
          // ── Original pre-aggregated path: one CSV row IS one final daily record ──
          const vxsIdx = cols.vxs, resolve3dIdx = cols.resolve3d, handoffsIdx = cols.handoffsPct,
                handoffsCountIdx = cols.handoffsCount, resolve2hrIdx = cols.resolve2hr, ahtIdx = cols.aht,
                resolve3dContactsIdx = cols.resolve3dContacts, resolve2hrContactsIdx = cols.resolve2hrContacts,
                fallbackResolveContactsIdx = cols.resolveContactsFallback, holdIdx = cols.hold, dpcIdx = cols.dpc,
                vttIdx = cols.vtt, vttSentIdx = cols.vttSent, vttTransactedIdx = cols.vttTransacted,
                netOccIdx = cols.netOcc, creditFreqIdx = cols.creditFreq, phoneAddsIdx = cols.phoneAdds,
                vhiIdx = cols.vhi, callsIdx = cols.calls, surveysIdx = cols.surveys, promotersIdx = cols.promoters;

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
               isOff: isOff, calls: callsHandled, resolveTotalContacts3d: parsed3drContacts, resolveTotalContacts2hr: getFloat(row, resolve2hrContactsIdx),
               resolveTotalContacts: parsedFallback !== null ? parsedFallback : (parsed3drContacts !== null ? parsed3drContacts : callsHandled),
               surveys: getFloat(row, surveysIdx), promoters: getFloat(row, promotersIdx), vxs: getFloat(row, vxsIdx, true),
               resolve3d: getFloat(row, resolve3dIdx, true), handoffs: getFloat(row, handoffsIdx, true), handoffsCount: getFloat(row, handoffsCountIdx, false),
               resolve2hr: getFloat(row, resolve2hrIdx, true), aht: getFloat(row, ahtIdx, false), hold: getFloat(row, holdIdx, false),
               dpc: getFloat(row, dpcIdx, false), viewTogether: parsedVttRate, vtt: parsedVttRate, vttSent: parsedVttSent, vttTransacted: parsedVttTransacted, netOcc: getFloat(row, netOccIdx, false),
               creditFreq: getFloat(row, creditFreqIdx, false), phoneAdds: getFloat(row, phoneAddsIdx, false), vhi: getFloat(row, vhiIdx, false)
            };
          }
        }
        
        if (rowsParsed > 0) {
          setHistoricalData(newHistory);
          setAgents(updatedAgents); 
          setSupervisors(Array.from(foundSupervisors).sort());
          if (foundOam) setOamName(foundOam);
          setHasUploadedData(true);
          if (onDataReset) onDataReset(); // clear stale AI reports so tabs re-trigger fresh analysis
          
          if (latestFoundDate) setSelectedDate(latestFoundDate);
          setActiveTimeframe('monthly');
          setUploadStatus({ type: 'success', message: `Database Built! Tracked ${Array.from(foundSupervisors).length} Supervisors & ${rowsParsed} records.` });
        } else {
          setUploadStatus({ type: 'error', message: `No active records matched your Members.` });
        }
        setTimeout(() => setUploadStatus(null), 6000);


      } catch (err) {
        setUploadStatus({ type: 'error', message: 'Failed to process file format. Please check the data.' });
        setTimeout(() => setUploadStatus(null), 5000);
      }
    };
    reader.readAsText(file);
    event.target.value = ''; 
  };


  // Memoized cache: builds every unique agent+timeframe result once per dependency change.
  // Key format: "ccms|timeframe|discriminator" — avoids recalculating the same slice on every call.
  const agentDataCache = useMemo(() => {
    const cache = {};
    if (!hasUploadedData) return cache;

    const OFF = { isOff: true, calls: 0 };
    const daysMap = { 'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6 };
    const targetDow = daysMap[selectedDow];
    const weekNum = parseInt(selectedWeek.replace('Week ', ''));
    const startDay = (weekNum - 1) * 7 + 1;
    const endDay = weekNum >= 5 ? 31 : startDay + 6;

    Object.keys(historicalData).forEach(ccms => {
      const agentHistory = historicalData[ccms];
      const allDates = Object.keys(agentHistory);

      // monthly
      cache[`${ccms}|monthly`] = allDates.length > 0
        ? aggregateRecords(allDates.map(d => agentHistory[d]))
        : OFF;

      // daily
      cache[`${ccms}|daily`] = agentHistory[selectedDate]
        ? { ...agentHistory[selectedDate] }
        : OFF;

      // weekly
      const weekDates = allDates.filter(d => {
        const parts = d.split('-');
        if (parts.length !== 3) return false;
        const day = parseInt(parts[2], 10);
        return day >= startDay && day <= endDay;
      });
      cache[`${ccms}|weekly`] = weekDates.length > 0
        ? aggregateRecords(weekDates.map(d => agentHistory[d]))
        : OFF;

      // dow
      const dowDates = allDates.filter(d => dowFromDateStr(d) === targetDow);
      cache[`${ccms}|dow`] = dowDates.length > 0
        ? aggregateRecords(dowDates.map(d => agentHistory[d]))
        : OFF;
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
    const year = current.getFullYear(), month = current.getMonth(), day = current.getDate();


    if (activeTimeframe === 'dow') {
        let idx = DAYS_OF_WEEK.indexOf(selectedDow) + daysToAdd;
        if (idx < 0) idx = 6;
        if (idx > 6) idx = 0;
        setSelectedDow(DAYS_OF_WEEK[idx]);
        return;
    }


    if (activeTimeframe !== 'daily') {
      if (daysToAdd < 0) return;
      else {
        setActiveTimeframe('daily');
        const firstDay = new Date(year, month, 1);
        setSelectedDate(`${firstDay.getFullYear()}-${String(firstDay.getMonth() + 1).padStart(2, '0')}-${String(firstDay.getDate()).padStart(2, '0')}`);
        return;
      }
    }


    if (daysToAdd < 0) {
      if (day === 1) { setActiveTimeframe('monthly'); return; } 
      else {
        const prevDay = new Date(year, month, day - 1);
        setSelectedDate(`${prevDay.getFullYear()}-${String(prevDay.getMonth() + 1).padStart(2, '0')}-${String(prevDay.getDate()).padStart(2, '0')}`);
        return;
      }
    } else {
      const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
      if (day >= lastDayOfMonth) return;
      else {
        const nextDay = new Date(year, month, day + 1);
        setSelectedDate(`${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`);
        return;
      }
    }
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
    getAgentDataForTimeframe, handleDateChange, getTopHeadlineMonth
  };
};


// Active request controllers keyed by setLoadingFn identity (one slot per AI report type).
// When a new request fires for the same slot, the previous one is aborted first.
const _aiControllers = new Map();

const executeGeminiAction = async (context, systemPrompt, setStatusFn, setLoadingFn, errorMsg) => {
  // ── De-duplication: if this slot is already loading, ignore the second click ──
  // We use setLoadingFn as the slot key since it's unique per report type.
  const slotKey = setLoadingFn;
  if (_aiControllers.get(slotKey)?.active) return;

  // ── Abort any previous in-flight request for this slot ──
  const prevController = _aiControllers.get(slotKey);
  if (prevController) prevController.controller.abort();

  const controller = new AbortController();
  _aiControllers.set(slotKey, { controller, active: true });

  // ── 30-second timeout via a parallel timer race ──
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  setLoadingFn(true);
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: context }]
      })
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const result = await response.json();
    const text = result.content?.map(b => b.text || "").join("") || "";
    if (text) { setStatusFn(text); setLoadingFn(false); return; }
    throw new Error("Empty response");
  } catch (e) {
    // Silently ignore aborted requests — user cancelled or a newer request took over.
    if (e.name !== "AbortError") {
      const isTimeout = e.message?.includes("abort") || e.name === "TimeoutError";
      setStatusFn(isTimeout ? "Request timed out. Please try again." : (errorMsg || "An error occurred while generating content."));
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


const AI_INITIAL = {
  report: null, loading: false,
  teamReport: null, loadingTeam: false,
  chartActionPlan: null, loadingChartActionPlan: false,
  correlationReport: null, loadingCorrelation: false,
  apprenticeReport: null, loadingApprentice: false,
  dowReport: null, loadingDow: false,
};

const useAiTools = ({
  agents, supervisors, oamName, historicalData, selectedDate, activeTimeframe, selectedWeek, selectedDow, getAgentDataForTimeframe,
  activeLeaderData, mtdLeaderData, supervisorStats, runChartMetric, runChartData, allActiveDates, searchQuery, visibleCols
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


  const [askAiQuery, setAskAiQuery] = useState("");
  const [askAiResponse, setAskAiResponse] = useState(null);
  const [askAiLoading, setAskAiLoading] = useState(false);


  const resetAiStates = () => {
    dispatchAi(AI_INITIAL);       // single dispatch — one re-render
    setAskAiQuery("");
    setAskAiResponse(null);
  };


  const spotterDate = activeTimeframe === 'monthly' ? 'MTD' : activeTimeframe === 'weekly' ? selectedWeek : activeTimeframe === 'dow' ? selectedDow : selectedDate;


  // The VSF Engine - Provides mathematical proof for AI context
  const getVsfContext = (agentsList, metricKey) => {
    const vsfString = calculateWeightedVSF(agentsList, metricKey);
    return vsfString ? `\n--- LEAN SIX SIGMA COPC DIRECTIVE ---\n${vsfString}\n--------------------------------------\n` : '';
  };


  const generateExpertReport = async (supervisorObj) => {
    setReport(null); 
    const aData = supervisorObj.activeData;
    const trend = supervisorObj.trend;


    const supAgentsRaw = agents.filter(a => a.supervisor === supervisorObj.name);
    const supAgents = supAgentsRaw.map(a => {
        const d = getAgentDataForTimeframe(a, activeTimeframe);
        
        const aWow = {};
        ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'].forEach(w => {
            const recs = Object.keys(historicalData[a.ccms]||{}).filter(dt => getWeekNumber(dt)===w).map(dt => historicalData[a.ccms][dt]);
            if(recs.length > 0) {
                 const agg = aggregateRecords(recs);
                 aWow[w] = { calls: agg.calls, vxs: agg.vxs, resolve3d: agg.resolve3d, handoffs: agg.handoffs, dpc: agg.dpc, vtt: agg.vtt, phoneAdds: agg.phoneAdds, vhi: agg.vhi };
            }
        });


        return { name: a.name, vxs: d.vxs, resolve3d: d.resolve3d, aht: d.aht, hold: d.hold, handoffs: d.handoffs, ncw: d.ncw, dpc: d.dpc, vhi: d.vhi, phoneAdds: d.phoneAdds, vtt: d.vtt, weeklyHistory: aWow };
    });


    // Run VSF on the worst metric for this supervisor
    const agentsWithData = supAgentsRaw.map(a => ({ agent: a, data: getAgentDataForTimeframe(a, activeTimeframe) }));
    let worstMetric = 'vxs';
    if (aData.resolve3d < aData.vxs) worstMetric = 'resolve3d';
    const vsfDirective = getVsfContext(agentsWithData, worstMetric);


    const agentContext = supAgents.map(a => `${a.name} (Current -> CSAT: ${a.vxs !== null ? Number(a.vxs).toFixed(0) : '-'}%, 3DR: ${a.resolve3d !== null ? Number(a.resolve3d).toFixed(0) : '-'}%, NCW%: ${a.ncw !== null ? Number(a.ncw).toFixed(1) : '-'}%, Hand-offs: ${a.handoffs !== null ? Number(a.handoffs).toFixed(1) : '-'}%, Weekly History: ${JSON.stringify(a.weeklyHistory)})`).join(' | ');


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


    executeGeminiAction(context, systemPrompt, setReport, setLoading, "Error loading report.");
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


    executeGeminiAction(context, systemPrompt, setApprenticeReport, setLoadingApprentice, "Error generating impact report.");
  };


  const generateDowReport = async (dowDataObj) => {
    setDowReport(null);
    if (!dowDataObj || dowDataObj.worstIdx === -1) {
        setDowReport("Not enough historical data to map Day-of-the-Week trends.");
        return;
    }


    const worstDay = dowDataObj.summary[dowDataObj.worstIdx];
    
    const agentDayStats = agents.map(a => {
        const hist = historicalData[a.ccms] || {};
        const dayRecords = Object.keys(hist)
            .filter(d => dowFromDateStr(d) === worstDay.idx)
            .map(d => hist[d]);
        return { agent: a, data: aggregateTeamMetrics(dayRecords) };
    }).filter(item => !item.data.isOff);


    agentDayStats.sort((a, b) => {
        const scoreA = (a.data.vxs || 0) - (a.data.handoffs || 0);
        const scoreB = (b.data.vxs || 0) - (b.data.handoffs || 0);
        return scoreA - scoreB;
    });
    
    const bottomAgents = agentDayStats.slice(0, 2).map(x => `${x.agent.name} (Sup: ${x.agent.supervisor}) -> CSAT: ${Number(x.data.vxs).toFixed(1)}%, Handoffs: ${Number(x.data.handoffs).toFixed(1)}%`);


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
    
    **Primary Impact:** [Write 2 sentences identifying the bottom 2 agents dragging the day down, explicitly quoting their CSAT and Handoff numbers].
    
    **Proactive Insights to Limit It:**
    - **Targeted Scheduling:** [1 actionable scheduling tip]
    - **Targeted Pre-Shift:** [1 actionable huddle topic]
    - **Real-Time Support:** [1 actionable floor-walking tip]
    `;


    executeGeminiAction(context, systemPrompt, setDowReport, setLoadingDow, "Error analyzing DOW trends.");
  };


  const generateTeamReport = async () => {
    setTeamReport(null);
    const activeMetricKeys = COL_DEFINITIONS.filter(c => visibleCols[c.stateKey]).map(c => c.stateKey);
    const activeMetricLabels = COL_DEFINITIONS.filter(c => visibleCols[c.stateKey]).map(c => c.label);


    const mappedData = supervisorStats.filter(s => !s.isOff).map(s => {
        const calls = s.activeData.calls || 0;
        const totalSales = (s.activeData.phoneAdds || 0) + (s.activeData.vhi || 0);
        const supObj = { 
            name: s.name,
            callsHandled: calls,
            promoters: Math.round(s.activeData.promoters || 0),
            detractors: Math.round(s.activeData.detractors || 0),
            totalSales: Math.round(totalSales),
            salesConversionRate: calls > 0 ? ((totalSales / calls) * 100).toFixed(1) + '%' : '0%',
            dpc: s.activeData.dpc,
            vtt: s.activeData.vtt
        };
        activeMetricKeys.forEach(k => { supObj[k] = s.activeData[k] !== undefined ? s.activeData[k] : s.mtdData[k]; });
        return supObj;
    });


    const weeklyFloorData = {};
    ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'].forEach(week => {
        const weekRecords = agents.flatMap(a => {
            return Object.keys(historicalData[a.ccms] || {})
                .filter(d => getWeekNumber(d) === week)
                .map(d => historicalData[a.ccms][d]);
        }).filter(Boolean);
        if (weekRecords.length > 0) {
            const agg = aggregateTeamMetrics(weekRecords);
            weeklyFloorData[week] = {
                calls: agg.calls, vxs: agg.vxs, resolve3d: agg.resolve3d, 
                resolve2hr: agg.resolve2hr, handoffs: agg.handoffs, 
                aht: agg.aht, vtt: agg.vtt, phoneAdds: agg.phoneAdds, ncw: agg.ncw
            };
        }
    });
    const wowAnalysis = JSON.stringify(weeklyFloorData);


    const managerCalls = mtdLeaderData.calls || 0;
    const managerTotalSales = (mtdLeaderData.phoneAdds || 0) + (mtdLeaderData.vhi || 0);
    const managerMtdObj = {
        callsHandled: managerCalls,
        promoters: Math.round(mtdLeaderData.promoters || 0),
        detractors: Math.round(mtdLeaderData.detractors || 0),
        totalSales: Math.round(managerTotalSales),
        salesConversionRate: managerCalls > 0 ? ((managerTotalSales / managerCalls) * 100).toFixed(1) + '%' : '0%'
    };
    activeMetricKeys.forEach(k => { managerMtdObj[k] = Number(mtdLeaderData[k]).toFixed(2); });


    // --- DAILY GAME PLAN DATA ---
    let targetDateStr = selectedDate;
    if (allActiveDates && allActiveDates.length > 0) {
        const previousDates = allActiveDates.filter(d => d < selectedDate);
        if (previousDates.length > 0) {
            targetDateStr = previousDates[previousDates.length - 1];
        } else {
            targetDateStr = allActiveDates[allActiveDates.length - 1];
        }
    } else {
        const currentDateObj = new Date(selectedDate + 'T00:00:00');
        const yesterdayObj = new Date(currentDateObj);
        yesterdayObj.setDate(currentDateObj.getDate() - 1);
        targetDateStr = `${yesterdayObj.getFullYear()}-${String(yesterdayObj.getMonth() + 1).padStart(2, '0')}-${String(yesterdayObj.getDate()).padStart(2, '0')}`;
    }


    const yesterdayStats = supervisors.map(supName => {
      const supAgents = agents.filter(a => a.supervisor === supName);
      const dailyAgentData = supAgents.map(a => {
         const hist = historicalData[a.ccms] || {};
         return hist[targetDateStr] ? { ...hist[targetDateStr] } : { isOff: true, calls: 0 };
      });
      const dailyData = aggregateTeamMetrics(dailyAgentData);
      return { name: supName, data: dailyData, isOff: dailyData.isOff };
    });


    const simplifiedDailyData = yesterdayStats.filter(s => !s.isOff).map(s => ({
        name: s.name, resolve3d: s.data.resolve3d, vxs: s.data.vxs, handoffs: s.data.handoffs, aht: s.data.aht, bonus: s.data.bonus
    }));


    // Find the primary metric failing on the floor right now to run VSF
    let worstFloorMetric = 'vxs';
    if (activeLeaderData.resolve3d < activeLeaderData.vxs) worstFloorMetric = 'resolve3d';
    
    // Filter agents for the currently searched context
    const queries = searchQuery.toLowerCase().split(',').map(q => q.trim()).filter(q => q);
    const activeAgentsForVsf = agents
      .filter(a => agentMatchesSearch(a, queries))
      .map(a => ({ agent: a, data: getAgentDataForTimeframe(a, activeTimeframe) }));


    const vsfDirective = getVsfContext(activeAgentsForVsf, worstFloorMetric);


    const context = `
      Metrics to Analyze: ${activeMetricLabels.join(', ')}
      Manager MTD Overall: ${JSON.stringify(managerMtdObj)}
      Manager Past Week Changes: ${wowAnalysis}
      Supervisor Data: ${JSON.stringify(mappedData)}
      
      --- DAILY DIPS CONTEXT (${targetDateStr}) ---
      Latest Day Supervisor Standings: ${JSON.stringify(simplifiedDailyData)}


      ${vsfDirective}
    `;


    const systemPrompt = `
      ${PERSONA} Your job is to provide a sharp, easy-to-read analysis of the Floor that mixes hard numbers with hidden insights, and concludes with a targeted daily game plan.
      
      CRITICAL INSTRUCTIONS:
      - DO NOT explain what the metrics mean. We already know. Just say "3DR", "VXS", "VHI", "VTT", "DPC", "Hand-offs", etc.
      - Focus heavily on these core metrics: CSAT (VXS), Resolve (2HR or 3DR), Sales (VHI/Phone Lines), and Hand-offs.
      - When talking about sending calls to other departments, use the verb "transferring" or "transfer". Use "Hand-offs" only as a noun.
      - Always check VTT alongside sales (VHI/Phone Lines) to ensure sales are valid and maintain integrity.
      - CRITICAL: Always cross-reference Sales (and Sales Conversion Rate) with DPC (Disconnects Per Call). If Sales are high but DPC is high (Target: 3), they are losing net additions by disconnecting lines. This is a negative behavior!
      - Compare Percentage of Non-Call Windows against Hand-offs to identify if agents are transferring calls just to avoid work.
      - Presentable Judgments: You must prove your point mathematically. You have been provided with raw volume breakdowns and exact numbers in the mathematical proof. You MUST explicitly quote these exact numbers and explain why they hurt the team score to ensure a robust and analytical output.
      - NEVER use the word "task". Use "calls" or "issues".
      - NEVER use dramatic words like "plummet".
      - CRITICAL: In the Game Plan section, formulate a hypothesis specifically linking the transfer/handoff rate to the 2HR metric drop.
      - CRITICAL: You must adhere perfectly to the Lean Six Sigma Directive provided when assigning Priority Leadership Targets.
      
      Format your unified response EXACTLY like this (with blank lines between sections):
      
      ### 🤖 Floor Analysis
      
      **📊 By the Numbers:**
      - (Summarize the Floor's total volume, CSAT, Resolve, Sales, and Hand-offs using real numbers).
      
      **📅 Week-over-Week (WoW) Shift:**
      - (State exactly how the Floor evolved from Week 1 to current week, specifically highlighting dips or improvements using the weekly trend data).
      
      **🕵️ What You Might Be Missing:**
      - (Call out a specific supervisor with a hidden risk using their numbers. Example: high sales but low VTT, or high Hand-offs vs high NCW%).
      - (Point out another quiet metric or trend that is secretly hurting the Floor's overall performance).
      
      **🔎 AI Root Cause Hypothesis:**
      - (Provide a 1-2 sentence guess on the underlying behavioral or process issue driving the Floor's biggest current challenge).
      
      **🌟 Quiet Wins to Clone:**
      - (Name one specific supervisor doing something highly effective in a tough metric that the rest of the Floor should copy, using their real numbers).
      
      ---
      
      ### 📋 Daily Game Plan
      
      **📢 Daily Huddle Focus**
      - (1-2 bullet points reviewing hidden insights and results based on yesterday's dips).
      
      **🎯 Priority Leadership Targets**
      - **[Target]** - [Leadership Action]: [Brief reason using exact numbers. Ensure this perfectly matches the OUTLIER vs PROCESS directive]
      
      **🤝 Strategic Mentor Match**
      - (Suggest 1 pair of Supervisors to shadow each other).
      
      **☑️ Action Inbox**
      - [ ] (Provide a 3-bullet checklist).
    `;


    executeGeminiAction(context, systemPrompt, setTeamReport, setLoadingTeam, "Error generating unified team report.");
  };


  const generateCorrelationReport = async () => {
    setCorrelationReport(null);
    
    const activeAgentsData = agents.map(a => {
        const d = getAgentDataForTimeframe(a, activeTimeframe);
        return { name: a.name, calls: d.calls, vxs: d.vxs, resolve3d: d.resolve3d, handoffs: d.handoffs, aht: d.aht, hold: d.hold, ncw: d.ncw, vtt: d.vtt, phoneAdds: d.phoneAdds, vhi: d.vhi, dpc: d.dpc };
    }).filter(d => !d.isOff && d.calls > 0);


    const context = `Agent Data Snapshot: ${JSON.stringify(activeAgentsData)}`;
    
    const systemPrompt = `${PERSONA} Scan the provided agent performance data and mathematically evaluate if there is a correlation for these three specific risk profiles:
    
    1. Speed vs Quality (AHT / Hold vs CSAT / VXS)
    2. Sales vs Integrity & Net Additions (Phone Adds & VHI vs VTT and DPC). High Sales with high DPC is bad (disconnecting lines to get sales).
    3. Avoidance vs Resolution (Hand-offs vs 3DR / FCR)
    
    For each profile, tell me the final outcome: is there a correlation or not? Support your answer by sharing 1-2 specific agent examples with their exact numbers.
    
    Format strictly as 3 bullet points using the 🎯 emoji.
    
    CRITICAL: 
    - DO NOT explain what metrics mean. 
    - DO NOT output introductory or concluding text. 
    - Keep it direct and data-focused.`;


    executeGeminiAction(context, systemPrompt, setCorrelationReport, setLoadingCorrelation, "Error analyzing correlations.");
  };


  const generateChartActionPlan = async () => {
    setChartActionPlan(null);
    const currentMetricLabel = METRIC_CONFIG[runChartMetric].label;
    const target = METRIC_CONFIG[runChartMetric].target;
    const entityName = searchQuery.trim() ? searchQuery : `${oamName} (Manager Overall)`;
    const isReverse = METRIC_CONFIG[runChartMetric].reverse;
    
    const summaryData = runChartData.map(d => {
        const dates = Object.keys(d.series).sort();
        const recent = dates.slice(-3).map(date => `${date}: ${Number(d.series[date]).toFixed(2)}`);
        return `${d.name} recent trend: ${recent.join(', ')}`;
    }).join('\n');


    const queries2 = searchQuery.toLowerCase().split(',').map(q => q.trim()).filter(q => q);
    const activeAgents = agents.filter(a => agentMatchesSearch(a, queries2));


    const agentsWithData = activeAgents.map(a => {
        return { agent: a, data: getAgentDataForTimeframe(a, 'monthly') };
    }).filter(item => !item.data.isOff && item.data[runChartMetric] !== null && item.data[runChartMetric] !== undefined);


    const vsfDirective = getVsfContext(agentsWithData, runChartMetric);


    const context = `Metric in focus: ${currentMetricLabel} (Goal Target: ${target})\nAnalyzing Entity: ${entityName}\nRecent Trend Data for Chart:\n${summaryData}\n${vsfDirective}`;
    
    const systemPrompt = `${PERSONA} Review the chart trend data and the Lean Six Sigma Directive for the requested metric. Make a simple, clear 3-step action plan in bullet points to improve this score right now. Keep it under 150 words. You MUST strictly follow the Process vs Outlier directive. Presentable Judgments: You must prove your point mathematically by quoting the exact numbers provided in the Mathematical Proof section. Do not explain what the metric is.`;


    executeGeminiAction(context, systemPrompt, setChartActionPlan, setLoadingChartActionPlan, "Error generating chart action plan.");
  };


  const handleAskAiSubmit = (explicitQuery = null) => {
    const queryToUse = explicitQuery || askAiQuery;
    if (!queryToUse.trim()) return;
    
    setAskAiQuery(queryToUse); 
    setAskAiResponse(null);
    
    const allAgentDataForContext = agents.map(a => {
        const d = getAgentDataForTimeframe(a, activeTimeframe);
        
        const aWow = {};
        ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'].forEach(w => {
            const recs = Object.keys(historicalData[a.ccms]||{}).filter(dt => getWeekNumber(dt)===w).map(dt => historicalData[a.ccms][dt]);
            if(recs.length > 0) {
                 const agg = aggregateRecords(recs);
                 aWow[w] = { calls: agg.calls, vxs: agg.vxs, resolve3d: agg.resolve3d, handoffs: agg.handoffs, dpc: agg.dpc, vtt: agg.vtt, phoneAdds: agg.phoneAdds, vhi: agg.vhi };
            }
        });
        
        return { 
          name: a.name, 
          supervisor: a.supervisor, 
          current: { calls: d.calls, vxs: d.vxs, resolve3d: d.resolve3d, aht: d.aht, hold: d.hold, handoffs: d.handoffs, ncw: d.ncw, dpc: d.dpc, vhi: d.vhi, phoneAdds: d.phoneAdds, vtt: d.vtt }, 
          weeklyTrend: aWow 
        };
    }).filter(d => d.current.calls > 0 || Object.keys(d.weeklyTrend).length > 0);
    
    // Explicitly exclude OJT agents from New Hires for accurate coding track tracking
    const newHires = agents.filter(a => a.coding === 'New Hire' && a.phase !== 'OJT').map(a => getAgentDataForTimeframe(a, activeTimeframe));
    const transitions = agents.filter(a => a.coding === 'Transition').map(a => getAgentDataForTimeframe(a, activeTimeframe));
    const ojt = agents.filter(a => a.phase === 'OJT').map(a => getAgentDataForTimeframe(a, activeTimeframe));
    const nesting = agents.filter(a => a.phase === 'Nesting').map(a => getAgentDataForTimeframe(a, activeTimeframe));


    const weeklyFloorData = {};
    ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'].forEach(week => {
        const weekRecords = agents.flatMap(a => {
            return Object.keys(historicalData[a.ccms] || {})
                .filter(d => getWeekNumber(d) === week)
                .map(d => historicalData[a.ccms][d]);
        }).filter(Boolean);
        if (weekRecords.length > 0) {
            const agg = aggregateTeamMetrics(weekRecords);
            weeklyFloorData[week] = {
                calls: agg.calls, vxs: agg.vxs, resolve3d: agg.resolve3d, 
                resolve2hr: agg.resolve2hr, handoffs: agg.handoffs, 
                aht: agg.aht, vtt: agg.vtt, phoneAdds: agg.phoneAdds, ncw: agg.ncw
            };
        }
    });


    const contextData = {
      managerMtd: mtdLeaderData,
      managerActiveTimeframe: activeLeaderData,
      weeklyTrendData: weeklyFloorData,
      supervisors: supervisorStats.map(s => ({ name: s.name, activeData: s.activeData, mtdData: s.mtdData })),
      apprenticeAggregates: {
        newHires: aggregateTeamMetrics(newHires),
        transitions: aggregateTeamMetrics(transitions),
        ojt: aggregateTeamMetrics(ojt),
        nesting: aggregateTeamMetrics(nesting)
      },
      agentsWithWeeklyTrends: allAgentDataForContext
    };
    
    const contextStr = JSON.stringify(contextData);
    const systemPrompt = `${PERSONA} for this Floor dashboard. 
    Analyze the provided JSON data context. Answer the manager's question clearly and concisely. 
    DO NOT explain metrics (assume they know 3DR, VXS, VHI, VTT, DPC, Hand-offs, NCW%).
    Use formatting and bullet points to make the answer easy to read. Point out hidden AI insights if relevant to their question (e.g. cross-referencing NCW% with Hand-offs).
    CRITICAL: When answering questions about Sales (Phone Lines/VHI) or Conversion Rate, always factor in VTT (for integrity) and DPC (Disconnects Per Call - for net additions). High DPC means bad behavior (disconnecting lines to sell new ones). Target DPC is 3.
    CRITICAL: You now have 'weeklyTrendData' in your context for the Floor, Supervisors, and EVERY SINGLE AGENT (under agentsWithWeeklyTrends). If the user asks for Week-over-Week (WoW) analysis, agent history, or trend comparisons, use this object to explicitly compare Week 1, Week 2, etc. Calculate and show the positive or negative variance.
    If the provided data does not contain the answer, politely state that you do not have enough data.`;
    
    const userContext = `Dashboard Data Context: ${contextStr}\n\nManager's Question: ${queryToUse}`;
    executeGeminiAction(userContext, systemPrompt, setAskAiResponse, setAskAiLoading, "There was an error analyzing the dashboard data. Please try again.");
  };


  return {
    report, loading, teamReport, loadingTeam, chartActionPlan, loadingChartActionPlan, 
    correlationReport, loadingCorrelation, apprenticeReport, loadingApprentice, generateApprenticeReport,
    dowReport, loadingDow, generateDowReport,
    askAiQuery, setAskAiQuery, askAiResponse, askAiLoading,
    resetAiStates, generateExpertReport,
    generateTeamReport, generateChartActionPlan, generateCorrelationReport,
    handleAskAiSubmit
  };
};


const useDashboardMetrics = ({
  agents, supervisors, historicalData, hasUploadedData, oamName,
  activeTimeframe, selectedDate, selectedWeek, selectedDow, getAgentDataForTimeframe,
  searchQuery, sortConfig, runChartMetric, isCumulative, heatmapViewType
}) => {


  // agentMatchesSearch is defined globally above

  // ── Shared derived values ─────────────────────────────────────────────────
  // Parsed once per searchQuery change — all downstream memos read this.
  const parsedQueries = useMemo(
    () => searchQuery.toLowerCase().split(',').map(q => q.trim()).filter(q => q),
    [searchQuery]
  );

  // Filtered once per agents/search change — shared by all downstream memos.
  const filteredAgents = useMemo(
    () => agents.filter(a => agentMatchesSearch(a, parsedQueries)),
    [agents, parsedQueries]
  );
  // ─────────────────────────────────────────────────────────────────────────


  const mtdLeaderData = useMemo(() => {
    const allAgentData = filteredAgents.map(a => getAgentDataForTimeframe(a, 'monthly'));
    return aggregateTeamMetrics(allAgentData);
  }, [filteredAgents, historicalData, hasUploadedData, activeTimeframe, getAgentDataForTimeframe]);


  const activeLeaderData = useMemo(() => {
    const allAgentData = filteredAgents.map(a => getAgentDataForTimeframe(a, activeTimeframe));
    return aggregateTeamMetrics(allAgentData);
  }, [filteredAgents, historicalData, activeTimeframe, selectedDate, selectedWeek, selectedDow, hasUploadedData, getAgentDataForTimeframe]);


  const supervisorStats = useMemo(() => {
    return supervisors.map(supName => {
      // Only include agents that match both supervisor AND the active search filter
      const supAgents = filteredAgents.filter(a => a.supervisor === supName);


      const activeData = aggregateTeamMetrics(supAgents.map(a => getAgentDataForTimeframe(a, activeTimeframe)));
      const mtdData = aggregateTeamMetrics(supAgents.map(a => getAgentDataForTimeframe(a, 'monthly')));
      const primaryOam = supAgents.length > 0 ? supAgents[0].oam : "Unknown";


      const trend = calculateTrend(activeData, mtdData);
      return {
        name: supName,
        oam: primaryOam,
        activeData,
        mtdData,
        trend,
        isOff: activeData.isOff,
        agentCount: supAgents.length,
        isHighRisk: !activeData.isOff && trend.direction === 'down' && trend.diff <= -3.0
      };
    });
  }, [filteredAgents, supervisors, historicalData, activeTimeframe, selectedDate, selectedWeek, selectedDow, hasUploadedData, getAgentDataForTimeframe]);


  const paretoData = useMemo(() => {
    const active = filteredAgents.map(a => ({
      agent: a, data: getAgentDataForTimeframe(a, activeTimeframe)
    })).filter(item => !item.data.isOff);


    const agentByDetractors = [...active].sort((a, b) => (b.data.detractors || 0) - (a.data.detractors || 0)).filter(a => a.data.detractors >= 1).slice(0, 10);
    const agentByRepeats = [...active].sort((a, b) => (b.data.repeats3d || 0) - (a.data.repeats3d || 0)).filter(a => a.data.repeats3d >= 1).slice(0, 10);
    const agentByHandoffs = [...active].sort((a, b) => (b.data.handoffsCount || 0) - (a.data.handoffsCount || 0)).filter(a => a.data.handoffsCount >= 1).slice(0, 10);
    const agentByPromoters = [...active].filter(a => a.data.vxs === 100 && a.data.promoters >= 1).sort((a, b) => (b.data.promoters || 0) - (a.data.promoters || 0)).slice(0, 10);
    const agentByResolves = [...active].filter(a => a.data.resolve3d != null).sort((a, b) => {
        if (b.data.resolve3d !== a.data.resolve3d) return b.data.resolve3d - a.data.resolve3d;
        return (b.data.resolveTotalContacts3d || 0) - (a.data.resolveTotalContacts3d || 0); 
    }).slice(0, 10);
    const agentByPhoneAdds = [...active].sort((a, b) => (b.data.phoneAdds || 0) - (a.data.phoneAdds || 0)).filter(a => (a.data.phoneAdds || 0) >= 1).slice(0, 10);
    const agentOffenders = { byDetractors: agentByDetractors, byRepeats: agentByRepeats, byHandoffs: agentByHandoffs };
    const agentPerformers = { byPromoters: agentByPromoters, byResolves: agentByResolves, byPhoneAdds: agentByPhoneAdds };
    
    const activeSups = supervisorStats.filter(s => !s.isOff && s.agentCount > 0).map(s => {
      return { agent: { name: s.name, supervisor: 'Floor Rollup', oam: s.oam, ccms: s.name }, data: s.activeData };
    });


    const supByDetractors = [...activeSups].sort((a, b) => (b.data.detractors || 0) - (a.data.detractors || 0)).filter(a => a.data.detractors >= 1).slice(0, 10);
    const supByRepeats = [...activeSups].sort((a, b) => (b.data.repeats3d || 0) - (a.data.repeats3d || 0)).filter(a => a.data.repeats3d >= 1).slice(0, 10);
    const supByHandoffs = [...activeSups].sort((a, b) => (b.data.handoffsCount || 0) - (a.data.handoffsCount || 0)).filter(a => a.data.handoffsCount >= 1).slice(0, 10);
    const supByPromoters = [...activeSups].sort((a, b) => (b.data.promoters || 0) - (a.data.promoters || 0)).filter(a => a.data.promoters >= 1).slice(0, 10);
    const supByResolves = [...activeSups].filter(a => a.data.resolve3d != null).sort((a, b) => {
        if (b.data.resolve3d !== a.data.resolve3d) return b.data.resolve3d - a.data.resolve3d;
        return (b.data.resolveTotalContacts3d || 0) - (a.data.resolveTotalContacts3d || 0); 
    }).slice(0, 10);
    const supByPhoneAdds = [...activeSups].sort((a, b) => (b.data.phoneAdds || 0) - (a.data.phoneAdds || 0)).filter(a => (a.data.phoneAdds || 0) >= 1).slice(0, 10);
    
    const supOffenders = { byDetractors: supByDetractors, byRepeats: supByRepeats, byHandoffs: supByHandoffs };
    const supPerformers = { byPromoters: supByPromoters, byResolves: supByResolves, byPhoneAdds: supByPhoneAdds };
    
    return { 
      agent: { offenders: agentOffenders, performers: agentPerformers },
      supervisor: { offenders: supOffenders, performers: supPerformers }
    };
  }, [filteredAgents, historicalData, activeTimeframe, selectedDate, selectedWeek, selectedDow, hasUploadedData, supervisorStats, getAgentDataForTimeframe]);


  const dowData = useMemo(() => {
    if (!hasUploadedData) return { summary: [], worstIdx: -1 };
    
    const buckets = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    const activeAgentsPerDay = { 0: new Set(), 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set(), 6: new Set() };


    filteredAgents.forEach(a => {
        const hist = historicalData[a.ccms] || {};
        Object.keys(hist).forEach(dateStr => {
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
        const avgAgents = Math.max(1, uniqueAgents / 4); // rough monthly assumption for targets
        
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
    
    let active = filteredAgents.map(a => ({ agent: a, data: getAgentDataForTimeframe(a, 'monthly') }))
      .filter(item => !item.data.isOff && item.data.calls > 3);


    const assignRank = (arr, metric, lowerIsWorse = false) => {
      arr.sort((a, b) => { const valA = a.data[metric] || 0; const valB = b.data[metric] || 0; return lowerIsWorse ? valA - valB : valB - valA; });
      arr.forEach((item, index) => { if (!item.ranks) item.ranks = {}; item.ranks[metric] = index + 1; });
    };


    assignRank(active, 'aht', false); assignRank(active, 'hold', false); assignRank(active, 'dpc', false); assignRank(active, 'netOcc', true); 


    active.forEach(item => {
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
    Object.values(historicalData).forEach(agentDates => { Object.keys(agentDates).forEach(d => { if (d.startsWith(currentMonthPrefix)) datesSet.add(d); }); });
    const dates = Array.from(datesSet).sort();


    const queries = parsedQueries;
    const isSearchEmpty = queries.length === 0;
    
    // Determine overall line name
    let overallName = `${oamName} (Manager Overall)`;
    if (!isSearchEmpty) {
       const searchedOams = [...new Set(agents.map(a => a.oam).filter(o => o && queries.some(q => o.toLowerCase().includes(q))))];
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
            dates.forEach(date => {
                let currentDayRecords = [];
                agentList.forEach(a => { 
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
            finalDates.forEach(week => {
                let currentWeekRecords = [];
                dates.forEach(date => {
                    if (getWeekNumber(date) === week) {
                        agentList.forEach(a => { 
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


    // Calculate the active agents based on the current search
    chartData.push({ name: overallName, color: '#0b0f19', series: buildSeries(filteredAgents) });


    if (!isSearchEmpty) {
        // Find supervisors that have matching agents
        const activeSups = supervisorStats.filter(s => !s.isOff && s.agentCount > 0);
        
        activeSups.forEach((sup, idx) => {
           let supAgents = agents.filter(a => a.supervisor === sup.name);
           supAgents = supAgents.filter(a => agentMatchesSearch(a, queries));
           chartData.push({ name: sup.name, color: CHART_COLORS[idx % CHART_COLORS.length], series: buildSeries(supAgents) });
        });
    }
    
    const validDates = finalDates.filter(d => chartData.some(c => c.series[d] !== undefined));
    return { allActiveDates: validDates, runChartData: chartData };
  }, [supervisorStats, filteredAgents, parsedQueries, historicalData, selectedDate, hasUploadedData, runChartMetric, oamName, isCumulative, heatmapViewType]);


  const sortedSupervisors = useMemo(() => {
    let result = [...supervisorStats];
    
    if (parsedQueries.length > 0) {
      result = result.filter(s => s.agentCount > 0);
    }
    
    result.sort((a, b) => {
      const isOffA = a.isOff, isOffB = b.isOff;
      if (isOffA && !isOffB) return 1; if (!isOffA && isOffB) return -1; if (isOffA && isOffB) return a.name.localeCompare(b.name);


      if (sortConfig.key === 'outlier') {
        if (a.isHighRisk && !b.isHighRisk) return -1; if (!a.isHighRisk && b.isHighRisk) return 1; 
        if (activeTimeframe === 'dow') {
            const valA = a.activeData.vxs ?? Infinity;
            const valB = b.activeData.vxs ?? Infinity;
            if (valA !== valB) return valA - valB;
        }
        return a.name.localeCompare(b.name);
      }


      let valA, valB;
      if (sortConfig.key === 'name') { valA = a.name; valB = b.name; } 
      else if (sortConfig.key === 'trajectory') { valA = a.trend.diff; valB = b.trend.diff; } 
      else { valA = a.activeData[sortConfig.key]; valB = b.activeData[sortConfig.key]; }


      valA = valA === null || valA === undefined ? -Infinity : valA; valB = valB === null || valB === undefined ? -Infinity : valB;
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
    sortedSupervisors
  };
};


const TimeframeMenu = ({ activeTimeframe, setActiveTimeframe, selectedWeek, setSelectedWeek, selectedDate, setSelectedDate, selectedDow, setSelectedDow, closeMenu }) => (
  <>
    <span className="block text-xs font-extrabold text-slate-500 uppercase mb-3">Timeframe Filter</span>
    <div className="flex gap-2 mb-4 flex-wrap">
      <button 
         className={`flex-1 min-w-[70px] p-2 text-xs rounded-lg cursor-pointer transition-all ${activeTimeframe === 'monthly' ? 'bg-white shadow-sm font-bold text-slate-900 border border-slate-200' : 'bg-white/40 font-semibold text-slate-500 border border-slate-200/50 hover:bg-white hover:text-slate-800'}`}
         onClick={() => { setActiveTimeframe('monthly'); closeMenu(); }}
      >Monthly</button>
      <button 
         className={`flex-1 min-w-[70px] p-2 text-xs rounded-lg cursor-pointer transition-all ${activeTimeframe === 'weekly' ? 'bg-white shadow-sm font-bold text-slate-900 border border-slate-200' : 'bg-white/40 font-semibold text-slate-500 border border-slate-200/50 hover:bg-white hover:text-slate-800'}`}
         onClick={() => { setActiveTimeframe('weekly'); }}
      >Weekly</button>
      <button 
         className={`flex-1 min-w-[70px] p-2 text-xs rounded-lg cursor-pointer transition-all ${activeTimeframe === 'daily' ? 'bg-white shadow-sm font-bold text-slate-900 border border-slate-200' : 'bg-white/40 font-semibold text-slate-500 border border-slate-200/50 hover:bg-white hover:text-slate-800'}`}
         onClick={() => { setActiveTimeframe('daily'); }}
      >Daily</button>
      <button 
         className={`flex-1 min-w-[70px] p-2 text-xs rounded-lg cursor-pointer transition-all ${activeTimeframe === 'dow' ? 'bg-white shadow-sm font-bold text-slate-900 border border-slate-200' : 'bg-white/40 font-semibold text-slate-500 border border-slate-200/50 hover:bg-white hover:text-slate-800'}`}
         onClick={() => { setActiveTimeframe('dow'); }}
      >Day of Week</button>
    </div>
    {activeTimeframe === 'weekly' && (
      <select 
        value={selectedWeek} 
        onChange={(e) => { setSelectedWeek(e.target.value); closeMenu(); }}
        className="w-full p-2.5 text-sm rounded-lg border border-slate-200 bg-white/50 text-slate-900 outline-none focus:border-blue-500 focus:bg-white transition-all shadow-sm cursor-pointer"
      >
        <option value="Week 1">Week 1 (May 1 - May 7)</option>
        <option value="Week 2">Week 2 (May 8 - May 14)</option>
        <option value="Week 3">Week 3 (May 15 - May 21)</option>
        <option value="Week 4">Week 4 (May 22 - May 28)</option>
        <option value="Week 5">Week 5 (May 29 - May 31)</option>
      </select>
    )}
    {activeTimeframe === 'daily' && (
      <input 
        type="date" value={selectedDate}
        onChange={(e) => { setSelectedDate(e.target.value); setActiveTimeframe('daily'); closeMenu(); }}
        className="w-full p-2.5 text-sm rounded-lg border border-slate-200 bg-white/50 text-slate-900 outline-none focus:border-blue-500 focus:bg-white transition-all shadow-sm cursor-pointer"
      />
    )}
    {activeTimeframe === 'dow' && (
      <select 
        value={selectedDow} 
        onChange={(e) => { setSelectedDow(e.target.value); closeMenu(); }}
        className="w-full p-2.5 text-sm rounded-lg border border-slate-200 bg-white/50 text-slate-900 outline-none focus:border-blue-500 focus:bg-white transition-all shadow-sm cursor-pointer"
      >
        <option value="Sunday">Sunday</option>
        <option value="Monday">Monday</option>
        <option value="Tuesday">Tuesday</option>
        <option value="Wednesday">Wednesday</option>
        <option value="Thursday">Thursday</option>
        <option value="Friday">Friday</option>
        <option value="Saturday">Saturday</option>
      </select>
    )}
  </>
);


const SettingsMenu = ({ visibleCols, toggleCol, closeMenu }) => (
  <>
    <span className="block text-xs font-extrabold text-slate-500 uppercase mb-3">Toggle Metrics</span>
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-4">
      {COL_DEFINITIONS.map(col => (
        <label key={col.key} className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer hover:text-slate-900 transition-colors" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={visibleCols[col.stateKey]} onChange={(e) => { e.stopPropagation(); toggleCol(col.stateKey); }} className="accent-blue-600 w-4 h-4 cursor-pointer" /> {col.label}
        </label>
      ))}
    </div>
    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer border-t border-slate-200/60 pt-4 mt-2 hover:text-slate-900 transition-colors" onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" checked={visibleCols.trajectory} onChange={(e) => { e.stopPropagation(); toggleCol('trajectory'); }} className="accent-blue-600 w-4 h-4 cursor-pointer" /> Show Trend Text
    </label>
  </>
);


const UploadStatus = ({ uploadStatus }) => {
  if (!uploadStatus) return null;
  return (
    <div className="fixed top-24 left-1-2 -translate-x-1-2 z-1000 p-3 px-6 rounded-lg shadow-lg flex items-center gap-3 font-bold animate-slide-down" style={{ background: uploadStatus.type === 'error' ? '#fef2f2' : uploadStatus.type === 'info' ? '#eff6ff' : '#ecfdf5', color: uploadStatus.type === 'error' ? '#991b1b' : uploadStatus.type === 'info' ? '#1e40af' : '#065f46', border: `1px solid ${uploadStatus.type === 'error' ? '#fecaca' : uploadStatus.type === 'info' ? '#bfdbfe' : '#a7f3d0'}` }}>
      {uploadStatus.type === 'error' ? '❌' : uploadStatus.type === 'info' ? '🔄' : '✅'} 
      {uploadStatus.message}
    </div>
  );
};


const ChartActionPlanModal = () => {
  const { aiTools, uiState } = useDashboard();
  if (!aiTools.loadingChartActionPlan && !aiTools.chartActionPlan) return null;
  return (
    <>
      {aiTools.loadingChartActionPlan && (
        <div className="modal-backdrop open">
          <div className="main-modal bg-transparent shadow-none border-none flex justify-center items-center">
            <GeminiLoader message="Cooking up a targeted action plan..." color="#10B981" />
          </div>
        </div>
      )}
      
      {aiTools.chartActionPlan && (
        <div className="modal-backdrop open" onClick={() => aiTools.setChartActionPlan(null)}>
          <div className="main-modal" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-slate-200 p-6 px-8">
              <h2 className="m-0 text-red-600 flex items-center gap-2 text-xl">
                <span>🎯</span> Targeted Action Plan ({METRIC_CONFIG[uiState.runChartMetric].label})
              </h2>
              <button onClick={() => aiTools.setChartActionPlan(null)} className="bg-transparent border-none text-slate-500 cursor-pointer text-2xl">✕</button>
            </div>
            <div className="p-8 whitespace-pre-wrap leading-relaxed text-slate-700 text-sm">
              <FormattedText text={aiTools.chartActionPlan} linkedEntities={uiState.linkedEntities} onEntityClick={uiHandlers.handleAiLinkClick} />
              <div className="mt-8 text-right">
                <button className="gemini-btn inline-block w-auto" onClick={() => navigator.clipboard.writeText(aiTools.chartActionPlan)}>📋 Copy Action Plan</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};


const TopNavbar = React.memo(() => {
  const { dashData, uiState, uiHandlers } = useDashboard();
  const menuRef = useRef(null);
  const timeframeRef = useRef(null);


  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) uiHandlers.setShowColMenu(false);
      if (timeframeRef.current && !timeframeRef.current.contains(event.target)) uiHandlers.setShowTimeframeMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [uiHandlers]);


  let headerName = dashData.oamName;
  const queries = uiState.searchQuery.toLowerCase().split(',').map(q => q.trim()).filter(q => q);
  if (queries.length > 0) {
      const searchedOams = [...new Set(dashData.agents.map(a => a.oam).filter(o => o && queries.some(q => o.toLowerCase().includes(q))))];
      if (searchedOams.length === 1) {
          headerName = searchedOams[0]; 
      }
  }


  return (
    <div className="top-navbar">
      <div className="top-navbar-inner">
        <div className="header-info">
          <div className="flex flex-col">
            <h1 className="text-xl font-bold m-0 mb-1 text-white tracking-wide">
              {headerName} <span className="opacity-50 mx-1 font-normal">|</span> Floor
            </h1>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400 italic">
                {uiState.searchQuery ? 'Filtered View' : `${dashData.supervisors.length} Supervisors / ${dashData.agents.length} Agents`}
              </span>
            </div>
          </div>
        </div>
        
        <div className="action-buttons">
          <div className="flex gap-2 items-center">


            <button 
              title="Data Assistant"
              className="py-1 px-4 rounded-full cursor-pointer transition-all flex items-center justify-center text-lg text-white"
              style={{ background: 'transparent', border: '1px solid transparent', opacity: 0.7 }}
              onClick={() => uiHandlers.setActiveModal('askAi')}
              onMouseOver={(e) => e.currentTarget.style.opacity = 1}
              onMouseOut={(e) => e.currentTarget.style.opacity = 0.7}
            >
              🔍
            </button>


            <input type="file" accept=".csv, .txt, .tsv" id="csv-upload" style={{ display: 'none' }} onChange={dashData.handleFileUpload} />
            <label 
              htmlFor="csv-upload" 
              title="Upload CSV Data" 
              className="py-1 px-4 rounded-full cursor-pointer transition-all flex items-center justify-center text-lg text-white" 
              style={{ background: 'transparent', border: '1px solid transparent', opacity: 0.7 }}
              onMouseOver={(e) => e.currentTarget.style.opacity = 1}
              onMouseOut={(e) => e.currentTarget.style.opacity = 0.7}
            >
              📤
            </label>


            <div className="column-menu-container flex" ref={timeframeRef}>
              <button 
                title="Timeframe Filter" 
                onClick={() => uiHandlers.setShowTimeframeMenu(!uiState.showTimeframeMenu)}
                className="py-1 px-4 rounded-full cursor-pointer transition-all flex items-center justify-center text-lg"
                style={{ 
                  background: uiState.showTimeframeMenu ? '#ffffff' : 'transparent', 
                  border: uiState.showTimeframeMenu ? '1px solid #cbd5e1' : '1px solid transparent', 
                  boxShadow: uiState.showTimeframeMenu ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                  opacity: uiState.showTimeframeMenu ? 1 : 0.7
                }}
                onMouseOver={(e) => e.currentTarget.style.opacity = 1}
                onMouseOut={(e) => e.currentTarget.style.opacity = uiState.showTimeframeMenu ? 1 : 0.7}
              >
                📅
              </button>
              {uiState.showTimeframeMenu && (
                <div className="column-menu-dropdown overflow-y-auto" style={{ maxHeight: '70vh' }}>
                  <TimeframeMenu 
                    activeTimeframe={dashData.activeTimeframe} setActiveTimeframe={dashData.setActiveTimeframe}
                    selectedWeek={dashData.selectedWeek} setSelectedWeek={dashData.setSelectedWeek}
                    selectedDate={dashData.selectedDate} setSelectedDate={dashData.setSelectedDate}
                    selectedDow={dashData.selectedDow} setSelectedDow={dashData.setSelectedDow}
                    closeMenu={() => uiHandlers.setShowTimeframeMenu(false)} 
                  />
                </div>
              )}
            </div>


            <div className="column-menu-container flex" ref={menuRef}>
              <button 
                title="Toggle Metrics" 
                onClick={() => uiHandlers.setShowColMenu(!uiState.showColMenu)}
                className="py-1 px-4 rounded-full cursor-pointer transition-all flex items-center justify-center text-lg"
                style={{ 
                  background: uiState.showColMenu ? '#ffffff' : 'transparent', 
                  border: uiState.showColMenu ? '1px solid #cbd5e1' : '1px solid transparent', 
                  boxShadow: uiState.showColMenu ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                  opacity: uiState.showColMenu ? 1 : 0.7
                }}
                onMouseOver={(e) => e.currentTarget.style.opacity = 1}
                onMouseOut={(e) => e.currentTarget.style.opacity = uiState.showColMenu ? 1 : 0.7}
              >
                ⚙️
              </button>
              {uiState.showColMenu && (
                <div className="column-menu-dropdown overflow-y-auto" style={{ maxHeight: '70vh' }}>
                  <SettingsMenu 
                    visibleCols={uiState.visibleCols} toggleCol={uiHandlers.toggleCol} closeMenu={() => uiHandlers.setShowColMenu(false)} 
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});


const MainStatsRow = React.memo(() => {
  const { dashData, metrics, uiState } = useDashboard();
  const spotterPrefix = dashData.activeTimeframe === 'monthly' ? 'Monthly Spotter' : dashData.activeTimeframe === 'weekly' ? 'Weekly Spotter' : dashData.activeTimeframe === 'dow' ? 'Day of Week' : 'Daily Spotter';
  const spotterDate = dashData.activeTimeframe === 'monthly' ? 'MTD' : dashData.activeTimeframe === 'weekly' ? dashData.selectedWeek : dashData.activeTimeframe === 'dow' ? dashData.selectedDow : dashData.selectedDate;


  return (
    <div className="stats-row">
      <div className="metric-card card-mtd flex flex-col p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-xl text-white m-0 font-bold">Month to Date</h2>
            <div className="flex gap-3 mt-2">
              <span className="text-xs text-slate-400 bg-slate-800 py-1 px-2 rounded">Calls Handled: <strong className="text-white">{metrics.mtdLeaderData.calls ? metrics.mtdLeaderData.calls.toLocaleString() : '-'}</strong></span>
              <span className="text-xs text-slate-400 bg-slate-800 py-1 px-2 rounded">Resolve Contacts: <strong className="text-white">{metrics.mtdLeaderData.resolveTotalContacts ? metrics.mtdLeaderData.resolveTotalContacts.toLocaleString() : '-'}</strong></span>
            </div>
          </div>
          <span className="bg-red-900 bg-opacity-20 text-red-300 py-1 px-2 rounded text-xs font-bold">MONTH-END STRATEGY</span>
        </div>


        <div className="flex flex-wrap justify-around gap-4 pb-6 border-b border-slate-800">
          {['vxs', 'resolve2hr', 'handoffs', 'resolve3d'].filter(key => uiState.visibleCols[key]).map(key => (
            <DonutChart key={key} value={metrics.mtdLeaderData[key]} target={getDynamicTarget(key, metrics.mtdLeaderData.activeAgentCount || dashData.agents.length)} label={METRIC_CONFIG[key].label} format={METRIC_CONFIG[key].format} reverse={METRIC_CONFIG[key].reverse} max={getDynamicMax(key, metrics.mtdLeaderData.activeAgentCount || dashData.agents.length)} isInteger={METRIC_CONFIG[key].isInteger} />
          ))}
        </div>


        <div className="grid grid-cols-auto-110 gap-3 pt-5">
          {Object.keys(uiState.visibleCols).filter(key => uiState.visibleCols[key] && !['bonus', 'vxs', 'resolve3d', 'resolve2hr', 'handoffs', 'trajectory'].includes(key) && METRIC_CONFIG[key]).map(key => {
              const config = METRIC_CONFIG[key];
              const val = metrics.mtdLeaderData[key];
              const tgt = getDynamicTarget(key, metrics.mtdLeaderData.activeAgentCount || dashData.agents.length);
              const isGood = config.reverse ? val <= tgt : val >= tgt;
              let displayVal = val === null || val === undefined || isNaN(val) ? '-' : (config.isInteger ? Math.round(val) : Number(val).toFixed(2));
              
              return (
                <div key={key} className="bg-slate-900 border border-slate-800 p-3 rounded-lg flex flex-col">
                  <span className="text-xs text-slate-500 uppercase font-extrabold tracking-wide">{config.label}</span>
                  <span className={`text-lg font-bold mt-1 ${isGood ? 'text-emerald-400' : 'text-red-400'}`}>{displayVal}{config.format}</span>
                </div>
              );
            })}
        </div>
        {Object.keys(uiState.visibleCols).filter(key => uiState.visibleCols[key] && METRIC_CONFIG[key]).length === 0 && (
          <span className="text-slate-500 text-sm">No metrics selected for display. Use Global Settings.</span>
        )}
      </div>


      <div className="metric-card card-daily flex flex-col p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-xl text-white m-0 font-bold flex items-baseline">
              {spotterPrefix} <span className="text-sm text-slate-400 italic ml-2 font-normal">({spotterDate})</span>
            </h2>
            <div className="flex gap-3 mt-2">
              <span className="text-xs text-slate-400 bg-slate-800 py-1 px-2 rounded">Calls Handled: <strong className="text-white">{metrics.activeLeaderData.calls ? metrics.activeLeaderData.calls.toLocaleString() : '-'}</strong></span>
              <span className="text-xs text-slate-400 bg-slate-800 py-1 px-2 rounded">Res Contacts: <strong className="text-white">{metrics.activeLeaderData.resolveTotalContacts ? metrics.activeLeaderData.resolveTotalContacts.toLocaleString() : '-'}</strong></span>
            </div>
          </div>
          <span className="bg-red-900 bg-opacity-20 text-red-300 py-1 px-2 rounded text-xs font-bold">DAILY EXECUTION</span>
        </div>
        
        <div className="flex flex-wrap justify-around gap-4 pb-6 border-b border-slate-800">
          {['vxs', 'resolve2hr', 'handoffs', 'resolve3d'].filter(key => uiState.visibleCols[key]).map(key => (
            <DonutChart key={key} value={metrics.activeLeaderData[key]} target={getDynamicTarget(key, metrics.activeLeaderData.activeAgentCount || dashData.agents.length)} label={METRIC_CONFIG[key].label} format={METRIC_CONFIG[key].format} reverse={METRIC_CONFIG[key].reverse} max={getDynamicMax(key, metrics.activeLeaderData.activeAgentCount || dashData.agents.length)} isInteger={METRIC_CONFIG[key].isInteger} />
          ))}
        </div>


        <div className="grid grid-cols-auto-110 gap-3 pt-5">
          {Object.keys(uiState.visibleCols).filter(key => uiState.visibleCols[key] && !['bonus', 'vxs', 'resolve3d', 'resolve2hr', 'handoffs', 'trajectory'].includes(key) && METRIC_CONFIG[key]).map(key => {
              const config = METRIC_CONFIG[key];
              const val = metrics.activeLeaderData[key];
              const tgt = getDynamicTarget(key, metrics.activeLeaderData.activeAgentCount || dashData.agents.length);
              const isGood = config.reverse ? val <= tgt : val >= tgt;
              let displayVal = val === null || val === undefined || isNaN(val) ? '-' : (config.isInteger ? Math.round(val) : Number(val).toFixed(2));
              return (
                <div key={key} className="bg-slate-900 border border-slate-800 p-3 rounded-lg flex flex-col">
                  <span className="text-xs text-slate-500 uppercase font-extrabold tracking-wide">{config.label}</span>
                  <span className={`text-lg font-bold mt-1 ${isGood ? 'text-emerald-400' : 'text-red-400'}`}>{displayVal}{config.format}</span>
                </div>
              );
            })}
        </div>
        {Object.keys(uiState.visibleCols).filter(key => uiState.visibleCols[key] && METRIC_CONFIG[key]).length === 0 && (
          <span className="text-slate-500 text-sm">No metrics selected for display. Use Global Settings.</span>
        )}
      </div>
    </div>
  );
});


const FloorHeader = React.memo(() => {
  const { dashData, uiState, uiHandlers } = useDashboard();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);


  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);


  const tabs = [
    { id: 'roster', icon: '📋', label: 'Team Roster' },
    { id: 'outliers', icon: '⚠️', label: 'Floor Outliers' },
    { id: 'apprentice', icon: '🎓', label: 'Apprentice Track' },
    { id: 'analysis', icon: '🤖', label: 'Floor Analysis' },
    { id: 'trends', icon: '📈', label: 'Trends' },
    { id: 'correlation', icon: '🎯', label: 'Integrity Match-ups' },
    { id: 'burnout', icon: '🧠', label: 'Behavioral Scan' },
    { id: 'dow', icon: '📅', label: 'DoW Analysis' }
  ];


  const currentTab = tabs.find(t => t.id === uiState.mainTab) || tabs[0];


  return (
    <div className="roster-header relative z-20">
      <div>
        <h2 className="text-xl text-slate-900 m-0 font-bold flex items-center gap-2">
            Floor Details 
            {uiState.searchQuery && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded font-bold uppercase tracking-wide border border-blue-200">Filtered</span>}
        </h2>
      </div>


        <div className="flex gap-3 items-center flex-wrap">
        <div className="flex items-center gap-1">
          <button onClick={() => dashData.handleDateChange(-1)} className="p-2 bg-transparent border-none cursor-pointer text-xl text-slate-500 rounded-full transition-all flex items-center justify-center w-9 h-9 hover:bg-slate-100 hover:text-slate-900" title="Previous Day">◀</button>
          <button onClick={() => dashData.handleDateChange(1)} className="p-2 bg-transparent border-none cursor-pointer text-xl text-slate-500 rounded-full transition-all flex items-center justify-center w-9 h-9 hover:bg-slate-100 hover:text-slate-900" title="Next Day">▶</button>
        </div>


        <div className="relative" ref={dropdownRef}>
          <button 
            title="Action Hub Menu"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center justify-center w-11 h-11 bg-slate-900 border border-slate-700 rounded-xl shadow-sm text-white hover:bg-slate-800 hover:border-slate-600 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-slate-900"
          >
            <span className="text-xl leading-none">{currentTab.icon}</span>
          </button>
          
          {isDropdownOpen && (
            <div className="absolute left-0 top-full mt-2 min-w-[200px] w-max glass-panel rounded-xl z-50 overflow-hidden animate-slide-down p-2">
              <div className="flex flex-col gap-1">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => { uiHandlers.setMainTab(tab.id); setIsDropdownOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold transition-all cursor-pointer border-none text-left whitespace-nowrap ${uiState.mainTab === tab.id ? 'bg-white shadow-sm text-slate-900 border border-slate-200' : 'bg-transparent text-slate-600 hover:bg-white/60 hover:text-slate-900'}`}
                  >
                    <span className="text-lg leading-none shrink-0 text-center">{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>


        <input 
          type="text" 
          className="search-input" 
          placeholder="Search multiple (comma separated)..." 
          value={uiState.inputValue}
          onChange={(e) => uiHandlers.setInputValue(e.target.value)}
        />
      </div>
    </div>
  );
});


// Drag-and-drop upload zone, shown in place of plain text when no data is loaded yet.
const DropZone = () => {
  const { dashData } = useDashboard();
  const [isDragOver, setIsDragOver] = useState(false);

  const onDragOver = (e) => { e.preventDefault(); setIsDragOver(true); };
  const onDragLeave = (e) => { e.preventDefault(); setIsDragOver(false); };
  const onDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) dashData.handleFileDrop(file);
  };

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => document.getElementById('csv-upload')?.click()}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 10, padding: '48px 24px', margin: '12px', borderRadius: 14, cursor: 'pointer',
        border: `2px dashed ${isDragOver ? '#3b82f6' : '#cbd5e1'}`,
        background: isDragOver ? '#eff6ff' : '#f8fafc',
        transition: 'all 0.15s ease',
      }}
    >
      <div style={{ fontSize: '2rem', opacity: isDragOver ? 1 : 0.6 }}>📤</div>
      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: isDragOver ? '#2563eb' : '#475569' }}>
        {isDragOver ? 'Drop your file here' : 'Drag & drop your CSV report here'}
      </div>
      <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>or click to browse — .csv, .txt, .tsv</div>
    </div>
  );
};


const FloorRosterTab = () => {
  const { dashData, metrics, aiTools, uiState, uiHandlers } = useDashboard();
  return (
  <div className="table-scroll-area">
    <table className="roster-table" style={{ minWidth: '100%', margin: 0 }}>
      <thead className="bg-slate-50">
        <tr>
          <th className="bg-slate-50 text-slate-700 border-b border-slate-300 cursor-pointer select-none" onClick={() => uiHandlers.handleSortChange('name')}>
            Supervisor {(uiState.sortConfig.key === 'name' || uiState.sortConfig.key === 'outlier') && <span className="sort-icon">{uiState.sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
          </th>

          {COL_DEFINITIONS.map(col => uiState.visibleCols[col.stateKey] && (
            <th key={col.key} className="bg-slate-50 text-slate-700 border-b border-slate-300 text-center cursor-pointer select-none" onClick={() => uiHandlers.handleSortChange(col.key)}>
              {col.label} {uiState.sortConfig.key === col.key && <span className="sort-icon">{uiState.sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
            </th>
          ))}
          {uiState.visibleCols.trajectory && <th className="bg-slate-50 text-slate-700 border-b border-slate-300 text-center cursor-pointer select-none" onClick={() => uiHandlers.handleSortChange('trajectory')}>
            Trend {uiState.sortConfig.key === 'trajectory' && <span className="sort-icon">{uiState.sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
          </th>}
        </tr>
      </thead>
      <tbody>
        {(() => {
          const queries = uiState.searchQuery.toLowerCase().split(',').map(q => q.trim()).filter(q => q);
          let activeOamName = null;
          
          if (queries.length > 0) {
              const searchedOams = [...new Set(dashData.agents.map(a => a.oam).filter(o => o && queries.some(q => o.toLowerCase().includes(q))))];
              if (searchedOams.length === 1) {
                  activeOamName = searchedOams[0];
              }
          }


          const rollupRow = activeOamName ? (
            <tr key="oam-rollup-row" className="bg-slate-200 border-b-2 border-slate-300 font-extrabold cursor-default transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
              <td className="p-3 px-6 text-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🎯</span>
                  <div className="flex flex-col">
                     <span>{activeOamName} (OAM Overall)</span>
                     <span className="text-xs text-slate-500 font-normal mt-0.5">{metrics.sortedSupervisors.length} Supervisors</span>
                  </div>
                </div>
              </td>
              {COL_DEFINITIONS.map(col => uiState.visibleCols[col.stateKey] && (
                 <td key={`rollup-${col.key}`} className="p-3 px-6 text-center bg-slate-200">
                   <MetricCell 
                     value={metrics.activeLeaderData[col.key]} 
                     target={getDynamicTarget(col.stateKey, metrics.activeLeaderData.activeAgentCount || 1)} 
                     reverse={col.reverse} 
                     isOff={metrics.activeLeaderData.isOff} 
                     isInteger={col.isInteger} 
                   />
                 </td>
              ))}
              {uiState.visibleCols.trajectory && <td className="bg-slate-200">
                <div className="text-center w-full">
                  {metrics.activeLeaderData.isOff ? (
                    <span className="text-xs text-slate-500 italic">-</span>
                  ) : (
                    <span className="text-xs font-extrabold px-2 py-1 rounded whitespace-nowrap" 
                          style={{ 
                            color: calculateTrend(metrics.activeLeaderData, metrics.mtdLeaderData).direction === 'up' ? '#10B981' : calculateTrend(metrics.activeLeaderData, metrics.mtdLeaderData).direction === 'down' ? '#D52B1E' : '#64748b', 
                            background: calculateTrend(metrics.activeLeaderData, metrics.mtdLeaderData).direction === 'up' ? '#ecfdf5' : calculateTrend(metrics.activeLeaderData, metrics.mtdLeaderData).direction === 'down' ? '#fef2f2' : '#f1f5f9' 
                          }}>
                       {calculateTrend(metrics.activeLeaderData, metrics.mtdLeaderData).label} ({calculateTrend(metrics.activeLeaderData, metrics.mtdLeaderData).diffStr})
                    </span>
                  )}
                </div>
              </td>}
            </tr>
          ) : null;


          return (
             <>
                {rollupRow}
                {metrics.sortedSupervisors.map((supObj) => {
                  const supData = supObj.activeData;
                  const isOffToday = supObj.isOff;
                  const trendInfo = supObj.trend;
                  return (
                    <tr 
                      key={supObj.name} 
                      className={`roster-row transition-all duration-300 hover:-translate-y-1 hover:shadow-md relative z-10 ${uiState.selectedSupervisorObj?.name === supObj.name ? 'active' : ''}`}
                      style={{ opacity: isOffToday ? 0.6 : 1 }}
                      onClick={() => {
                          if (!isOffToday) {
                              uiHandlers.setSelectedSupervisorObj(supObj);
                              uiHandlers.setActiveModal('supervisor');
                              aiTools.generateExpertReport(supObj);
                          }
                      }}
                    >
                      <td className="font-semibold p-3 px-6">
                        <div className="flex items-center gap-1">
                          <span>{supObj.name}</span>
                          {supObj.isHighRisk && !isOffToday && (
                            <span className="text-base cursor-help" title="High Risk Trend">⚠️</span>
                          )}
                        </div>
                        <span className="block text-xs text-slate-500 font-normal">
                          {supObj.agentCount} Agents
                        </span>
                      </td>
                      {COL_DEFINITIONS.map(col => uiState.visibleCols[col.stateKey] && (
                         <td key={col.key} className="p-3 px-6 text-center">
                           <MetricCell value={supData[col.key]} target={getDynamicTarget(col.stateKey, supObj.agentCount)} reverse={col.reverse} isOff={isOffToday} isInteger={col.isInteger} />
                         </td>
                      ))}
                      {uiState.visibleCols.trajectory && <td>
                        <div className="text-center w-full">
                          {isOffToday ? (
                            <span className="text-xs text-slate-400 italic">-</span>
                          ) : (
                            <span className="text-xs font-extrabold px-2 py-1 rounded whitespace-nowrap" style={{ color: trendInfo.direction === 'up' ? '#10B981' : trendInfo.direction === 'down' ? '#D52B1E' : '#64748b', background: trendInfo.direction === 'up' ? '#ecfdf5' : trendInfo.direction === 'down' ? '#fef2f2' : '#f1f5f9' }}>
                               {trendInfo.label} ({trendInfo.diffStr})
                            </span>
                          )}
                        </div>
                      </td>}
                    </tr>
                  );
                })}
                {metrics.sortedSupervisors.length === 0 && (
                  <tr>
                    <td colSpan={COL_DEFINITIONS.length + 2} className="text-center p-0">
                      {dashData.hasUploadedData
                        ? <div className="p-10 text-slate-500">{`No supervisors found matching "${uiState.searchQuery}"`}</div>
                        : <DropZone />
                      }
                    </td>
                  </tr>
                )}
             </>
          );
        })()}
      </tbody>
    </table>
  </div>
);
};


const FloorOutliersTab = () => {
  const { metrics, uiState, uiHandlers, aiTools } = useDashboard();
  const handleOutlierClick = (item, sortKey, sortDir) => {
      const supName = uiState.outlierLevel === 'agent' ? item.agent.supervisor : item.agent.name;
      const supObj = metrics.supervisorStats.find(s => s.name === supName);
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
    <div className="flex flex-col gap-8 p-8 bg-slate-50 border-t border-slate-200">
      <div className="bg-white rounded-xl p-8 border border-slate-200 shadow-sm">
        <div className="flex justify-between items-center mb-6 gap-4 border-b border-slate-100 pb-4 overflow-x-auto">
          <h3 className="text-lg md:text-xl m-0 flex items-center gap-2 font-extrabold text-slate-900 whitespace-nowrap flex-shrink-0">
            <span>{uiState.outlierMode === 'offenders' ? '⚠️' : '🌟'}</span> Top 10 {uiState.outlierMode === 'offenders' ? 'Offenders' : 'Performers'} ({uiState.outlierLevel === 'agent' ? 'Agents' : 'Supervisors'})
          </h3>
          
          <div className="flex gap-4 items-center whitespace-nowrap flex-shrink-0 min-w-max">
            <div className="flex bg-slate-50 rounded-lg border border-slate-200 overflow-hidden shadow-sm p-1 gap-1">
              <button 
                onClick={() => uiHandlers.setOutlierLevel('agent')}
                className="px-4 py-2 border-none font-bold cursor-pointer text-sm transition-all rounded-md"
                style={{ background: uiState.outlierLevel === 'agent' ? '#ffffff' : 'transparent', color: uiState.outlierLevel === 'agent' ? '#0b0f19' : '#64748b', boxShadow: uiState.outlierLevel === 'agent' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >Agent</button>
              <button 
                onClick={() => uiHandlers.setOutlierLevel('supervisor')}
                className="px-4 py-2 border-none font-bold cursor-pointer text-sm transition-all rounded-md"
                style={{ background: uiState.outlierLevel === 'supervisor' ? '#ffffff' : 'transparent', color: uiState.outlierLevel === 'supervisor' ? '#0b0f19' : '#64748b', boxShadow: uiState.outlierLevel === 'supervisor' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >Supervisor</button>
            </div>
            
            <div className="flex bg-slate-50 rounded-lg border border-slate-200 overflow-hidden shadow-sm p-1 gap-1">
              <button 
                onClick={() => uiHandlers.setOutlierMode('offenders')}
                className="px-4 py-2 border-none font-bold cursor-pointer text-sm transition-all rounded-md"
                style={{ background: uiState.outlierMode === 'offenders' ? '#fee2e2' : 'transparent', color: uiState.outlierMode === 'offenders' ? '#991b1b' : '#64748b', boxShadow: uiState.outlierMode === 'offenders' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >Negative (Offenders)</button>
              <button 
                onClick={() => uiHandlers.setOutlierMode('performers')}
                className="px-4 py-2 border-none font-bold cursor-pointer text-sm transition-all rounded-md"
                style={{ background: uiState.outlierMode === 'performers' ? '#d1fae5' : 'transparent', color: uiState.outlierMode === 'performers' ? '#065f46' : '#64748b', boxShadow: uiState.outlierMode === 'performers' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >Positive (Performers)</button>
            </div>
          </div>
        </div>


        <p className="text-sm m-0 mb-6 leading-relaxed text-slate-500">
          {uiState.outlierMode === 'offenders' ? `Focus coaching and intervention on these specific ${uiState.outlierLevel}s.` : `Analyze and duplicate the successful behaviors of these top ${uiState.outlierLevel}s.`}
        </p>
        
        {uiState.outlierMode === 'offenders' ? (
          <div className="grid grid-cols-auto-300 gap-6">
             <ParetoColumn title="Top CSAT Detractor Drivers" icon="💔" data={metrics.paretoData[uiState.outlierLevel].offenders.byDetractors} colorObj={{ light: '#fecaca', dark: '#dc2626' }} valKey="detractors" labelFn={i => `${Math.round(i.data.detractors)} Detractors`} onItemClick={(item) => handleOutlierClick(item, 'vxs', 'asc')} />
             <ParetoColumn title="Top 3DR Repeat Drivers" icon="🔁" data={metrics.paretoData[uiState.outlierLevel].offenders.byRepeats} colorObj={{ light: '#fecaca', dark: '#dc2626' }} valKey="repeats3d" labelFn={i => i.data.resolve3d != null ? Number(i.data.resolve3d).toFixed(2) + '%' : '-'} onItemClick={(item) => handleOutlierClick(item, 'resolve3d', 'asc')} />
             <ParetoColumn title="Top Hand-off Drivers" icon="🤝" data={metrics.paretoData[uiState.outlierLevel].offenders.byHandoffs} colorObj={{ light: '#fecaca', dark: '#dc2626' }} valKey="handoffsCount" labelFn={i => `${Math.round(i.data.handoffsCount)} Hand-offs`} onItemClick={(item) => handleOutlierClick(item, 'handoffs', 'desc')} />
          </div>
        ) : (
          <div className="grid grid-cols-auto-300 gap-6">
             <ParetoColumn title={uiState.outlierLevel === 'agent' ? "Clean CSAT (100%)" : "Top CSAT Promoters"} icon="🌟" data={metrics.paretoData[uiState.outlierLevel].performers.byPromoters} colorObj={{ light: '#a7f3d0', dark: '#059669' }} valKey="promoters" labelFn={i => `${Math.round(i.data.promoters)} Promoters`} onItemClick={(item) => handleOutlierClick(item, 'vxs', 'desc')} />
             <ParetoColumn title="Top 3DR %" icon="✅" data={metrics.paretoData[uiState.outlierLevel].performers.byResolves} colorObj={{ light: '#a7f3d0', dark: '#059669' }} valKey="resolveTotalContacts3d" labelFn={i => `${Number(i.data.resolve3d).toFixed(2)}%`} onItemClick={(item) => handleOutlierClick(item, 'resolve3d', 'desc')} />
             <ParetoColumn title="Top Sellers (Sales)" icon="📱" data={metrics.paretoData[uiState.outlierLevel].performers.byPhoneAdds} colorObj={{ light: '#a7f3d0', dark: '#059669' }} valKey="phoneAdds" labelFn={i => `${Math.round(i.data.phoneAdds || 0)} Units`} onItemClick={(item) => handleOutlierClick(item, 'phoneAdds', 'desc')} />
          </div>
        )}
      </div>
    </div>
  );
};


const FloorApprenticeTab = () => {
  const { dashData, metrics, aiTools, uiState, uiHandlers } = useDashboard();
  const isCoding = uiState.apprenticeViewMode === 'coding';
  
  const handleCohortClick = (cohortName) => {
      uiHandlers.setInputValue(cohortName);
      uiHandlers.setSearchQuery(cohortName);
      uiHandlers.setMainTab('roster');
  };


  const titleA = isCoding ? "New Hires" : "OJT";
  const titleB = isCoding ? "Transitions" : "Nesting";

  // Memoized: only recomputes when agents, view mode, or timeframe changes
  const groupA = useMemo(
    () => dashData.agents.filter(a => isCoding ? a.coding === 'New Hire' && a.phase !== 'OJT' : a.phase === 'OJT'),
    [dashData.agents, isCoding]
  );
  const groupB = useMemo(
    () => dashData.agents.filter(a => isCoding ? a.coding === 'Transition' : a.phase === 'Nesting'),
    [dashData.agents, isCoding]
  );

  const dataA = useMemo(
    () => aggregateTeamMetrics(groupA.map(a => dashData.getAgentDataForTimeframe(a, dashData.activeTimeframe))),
    [groupA, dashData.activeTimeframe, dashData.getAgentDataForTimeframe]
  );
  const dataB = useMemo(
    () => aggregateTeamMetrics(groupB.map(a => dashData.getAgentDataForTimeframe(a, dashData.activeTimeframe))),
    [groupB, dashData.activeTimeframe, dashData.getAgentDataForTimeframe]
  );


  useEffect(() => {
    if (dataA && dataB && (dataA.calls > 0 || dataB.calls > 0)) {
        aiTools.generateApprenticeReport(uiState.apprenticeViewMode, dataA, dataB, titleA, titleB);
    }
  }, [uiState.apprenticeViewMode, dashData.selectedDate, dashData.selectedWeek, dashData.activeTimeframe]);


  const getVal = (d, key) => (d && d[key] !== null && d[key] !== undefined && !isNaN(d[key])) ? d[key] : 0;
  
  const metricsToRender = [
    { key: 'calls', label: 'Volume (Calls)', type: 'count', aVal: getVal(dataA, 'calls'), bVal: getVal(dataB, 'calls'), aSub: `${getVal(dataA, 'ncwCount')} NCWs`, bSub: `${getVal(dataB, 'ncwCount')} NCWs` },
    { key: 'vxs', label: 'C-Sat', type: 'pct', aVal: getVal(dataA, 'vxs'), bVal: getVal(dataB, 'vxs'), aSub: `${getVal(dataA, 'detractors')} Detractors`, bSub: `${getVal(dataB, 'detractors')} Detractors` },
    { key: 'resolve2hr', label: '2HR', type: 'pct', aVal: getVal(dataA, 'resolve2hr'), bVal: getVal(dataB, 'resolve2hr') },
    { key: 'resolve3d', label: '3DR', type: 'pct', aVal: getVal(dataA, 'resolve3d'), bVal: getVal(dataB, 'resolve3d') },
    { key: 'handoffs', label: 'Hand-offs', type: 'pct', aVal: getVal(dataA, 'handoffs'), bVal: getVal(dataB, 'handoffs'), aSub: `${Math.round(getVal(dataA, 'handoffsCount'))} Transfers`, bSub: `${Math.round(getVal(dataB, 'handoffsCount'))} Transfers` },
    { key: 'phoneAdds', label: 'Phone Lines', type: 'count', aVal: getVal(dataA, 'phoneAdds'), bVal: getVal(dataB, 'phoneAdds') },
    { key: 'vhi', label: 'VHI', type: 'count', aVal: getVal(dataA, 'vhi'), bVal: getVal(dataB, 'vhi') },
    { key: 'vtt', label: 'VTT', type: 'pct', aVal: getVal(dataA, 'vtt'), bVal: getVal(dataB, 'vtt') }
  ];


  return (
    <div className="flex flex-col gap-6 p-8 bg-slate-50 border-t border-slate-200">
       <div className="flex justify-between items-start flex-wrap gap-4">
           <div>
             <h3 className="text-2xl m-0 flex items-center gap-2 font-extrabold text-slate-900">
               <span>🎓</span> Apprentice Track Impact
             </h3>
             <p className="text-sm m-0 mt-1 text-slate-500">
               The race between {isCoding ? 'New Hires and Transitions' : 'OJT and Nesting'}.
             </p>
           </div>
           
           <div className="flex bg-slate-50 rounded-lg border border-slate-200 overflow-hidden shadow-sm p-1 gap-1">
              <button 
                onClick={() => uiHandlers.setApprenticeViewMode('coding')}
                className="px-4 py-2 border-none font-bold cursor-pointer text-sm transition-all rounded-md"
                style={{ background: uiState.apprenticeViewMode === 'coding' ? '#ffffff' : 'transparent', color: uiState.apprenticeViewMode === 'coding' ? '#0b0f19' : '#64748b', boxShadow: uiState.apprenticeViewMode === 'coding' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >Coding Track</button>
              <button 
                onClick={() => uiHandlers.setApprenticeViewMode('phase')}
                className="px-4 py-2 border-none font-bold cursor-pointer text-sm transition-all rounded-md"
                style={{ background: uiState.apprenticeViewMode === 'phase' ? '#ffffff' : 'transparent', color: uiState.apprenticeViewMode === 'phase' ? '#0b0f19' : '#64748b', boxShadow: uiState.apprenticeViewMode === 'phase' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >Operational Phase</button>
            </div>
       </div>


       <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
               <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="p-4 px-6 text-slate-700 font-bold uppercase text-xs w-1/3">Metric</th>
                  <th 
                    className="p-4 px-6 text-center border-l border-slate-200 w-1/3 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleCohortClick(isCoding ? 'New Hire' : 'OJT')}
                    title={`Click to deeply filter floor roster by ${titleA}`}
                  >
                      <div className="text-slate-900 font-extrabold text-base">{titleA}</div>
                      <div className="text-slate-400 text-xs font-normal mt-1">{groupA.length} Agents</div>
                  </th>
                  <th 
                    className="p-4 px-6 text-center border-l border-slate-200 w-1/3 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleCohortClick(isCoding ? 'Transition' : 'Nesting')}
                    title={`Click to deeply filter floor roster by ${titleB}`}
                  >
                      <div className="text-slate-900 font-extrabold text-base">{titleB}</div>
                      <div className="text-slate-400 text-xs font-normal mt-1">{groupB.length} Agents</div>
                  </th>
               </tr>
            </thead>
            <tbody>
               {metricsToRender.map((m, idx) => {
                  const target = getDynamicTarget(m.key, 1);
                  const isReverse = METRIC_CONFIG[m.key]?.reverse;
                  
                  const formatVal = (v, type) => type === 'count' ? Math.round(v) : Number(v).toFixed(1) + '%';
                  const getColor = (v) => {
                      if (!target || v === 0) return '#0b0f19';
                      return (isReverse ? v <= target : v >= target) ? '#059669' : '#dc2626';
                  };


                  return (
                    <tr key={m.key} className={idx !== metricsToRender.length - 1 ? "border-b border-slate-100" : ""}>
                       <td className="p-5 px-6 font-bold text-slate-800 bg-slate-50">{m.label}</td>
                       <td className="p-5 px-6 text-center border-l border-slate-100">
                           <div className="flex flex-col items-center justify-center">
                              <span className="text-lg font-extrabold" style={{ color: m.key === 'calls' ? '#0b0f19' : getColor(m.aVal) }}>{formatVal(m.aVal, m.type)}</span>
                              {m.aSub && <span className="text-xs text-slate-400 font-normal mt-1">{m.aSub}</span>}
                           </div>
                       </td>
                       <td className="p-5 px-6 text-center border-l border-slate-100">
                           <div className="flex flex-col items-center justify-center">
                              <span className="text-lg font-extrabold" style={{ color: m.key === 'calls' ? '#0b0f19' : getColor(m.bVal) }}>{formatVal(m.bVal, m.type)}</span>
                              {m.bSub && <span className="text-xs text-slate-400 font-normal mt-1">{m.bSub}</span>}
                           </div>
                       </td>
                    </tr>
                  );
               })}
            </tbody>
          </table>
       </div>


       {aiTools.loadingApprentice ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 flex justify-center">
             <GeminiLoader message="Analyzing track performance..." color="#8b5cf6" icon="🧠" />
          </div>
       ) : aiTools.apprenticeReport && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
             <div className="p-5 px-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h3 className="text-lg font-extrabold flex items-center gap-2 m-0 text-slate-900"><span>🤖</span> AI Impact Analysis</h3>
                <button className="gemini-btn btn-alt px-3 py-1.5 text-xs" onClick={() => navigator.clipboard.writeText(aiTools.apprenticeReport)}>Copy</button>
             </div>
             <div className="report-body text-[1.05rem] leading-relaxed m-0 p-6 px-8">
               <FormattedText text={aiTools.apprenticeReport} linkedEntities={uiState.linkedEntities} onEntityClick={uiHandlers.handleAiLinkClick} />
             </div>
          </div>
       )}
    </div>
  );
};


const FloorAnalysisTab = () => {
  const { dashData, aiTools, uiState, uiHandlers } = useDashboard();
  useEffect(() => {
    if(dashData.hasUploadedData && !aiTools.teamReport && !aiTools.loadingTeam) aiTools.generateTeamReport();
  }, [dashData.hasUploadedData, dashData.historicalData]);


  return (
    <div className="flex flex-col gap-6 p-6 bg-slate-50 border-t border-slate-200 rounded-b-xl">
      <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
        <div className="mb-6 border-b border-slate-100 pb-4 flex justify-between items-end">
          <div>
            <h3 className="text-xl font-extrabold flex items-center gap-2 mb-1 text-slate-900"><span>🤖</span> Floor Analysis & Game Plan</h3>
            <p className="text-sm text-slate-500 m-0">Unified AI-driven analysis of organizational trends paired with actionable daily leadership targets.</p>
          </div>
          {aiTools.teamReport && <button className="gemini-btn btn-alt px-3 py-1.5 text-xs" onClick={() => navigator.clipboard.writeText(aiTools.teamReport)}>Copy</button>}
        </div>
        {aiTools.loadingTeam ? ( <GeminiLoader message="Brewing up your Unified Strategy Report..." color="#3b82f6" /> ) : aiTools.teamReport ? (
           <div className="report-body text-[1.05rem] leading-relaxed mt-0">
             <FormattedText text={aiTools.teamReport} linkedEntities={uiState.linkedEntities} onEntityClick={uiHandlers.handleAiLinkClick} />
           </div>
        ) : (
           <div className="text-center p-5 text-slate-500 italic">Initializing Floor Strategy Report...</div>
        )}
      </div>
    </div>
  );
};


const FloorTrendsTab = () => {
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
                  <option key={k} value={k}>{METRIC_CONFIG[k].label}</option>
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
        <PerformanceHeatmap activeDates={metrics.allActiveDates} chartData={metrics.runChartData} metricConfig={METRIC_CONFIG[uiState.runChartMetric]} baseTarget={getDynamicTarget(uiState.runChartMetric, metrics.activeLeaderData.activeAgentCount || dashData.agents.length)} onCellClick={(date) => { dashData.setActiveTimeframe('daily'); dashData.setSelectedDate(date); uiHandlers.setMainTab('roster'); }} />
      </div>
    </div>
);
};


const FloorCorrelationTab = () => {
  const { dashData, aiTools, uiState, uiHandlers } = useDashboard();
  useEffect(() => {
    if(dashData.hasUploadedData && !aiTools.correlationReport && !aiTools.loadingCorrelation) aiTools.generateCorrelationReport();
  }, [dashData.hasUploadedData, dashData.historicalData]);


  return (
    <div className="flex flex-col gap-6 p-6 bg-slate-50 border-t border-slate-200 rounded-b-xl">
      <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
        <div className="mb-6 border-b border-slate-100 pb-4 flex justify-between items-end flex-wrap gap-4">
          <div>
            <h3 className="text-xl font-extrabold flex items-center gap-2 mb-1 text-slate-900"><span>🎯</span> Integrity Match-ups</h3>
            <p className="text-sm text-slate-500 m-0">Pre-built risk profiles mapping behavioral trade-offs. The AI actively scans the raw data to surface the strongest hidden links.</p>
          </div>
          {aiTools.correlationReport && <button className="gemini-btn btn-alt px-3 py-1.5 text-xs" onClick={() => navigator.clipboard.writeText(aiTools.correlationReport)}>Copy</button>}
        </div>


        {aiTools.loadingCorrelation ? (
           <div className="flex justify-center p-10"><GeminiLoader color="#f59e0b" message="Scanning data for all Integrity Match-ups..." icon="🧠" /></div>
        ) : aiTools.correlationReport ? (
           <div className="report-body text-[1.05rem] leading-relaxed mt-0">
             <FormattedText text={aiTools.correlationReport} linkedEntities={uiState.linkedEntities} onEntityClick={uiHandlers.handleAiLinkClick} />
           </div>
        ) : (
           <div className="text-center p-10 text-slate-500 bg-slate-50 border border-dashed border-slate-300 rounded-lg">Initializing Correlation Scan...</div>
        )}
      </div>
    </div>
  );
};


const FloorBurnoutTab = () => {
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
            {metrics.orgBurnoutList.map((item, idx) => {
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
                            let displayVal = '-';
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


const FloorDowTab = () => {
  const { dashData, metrics, aiTools, uiState, uiHandlers } = useDashboard();
  useEffect(() => {
    if(dashData.hasUploadedData && !aiTools.dowReport && !aiTools.loadingDow) aiTools.generateDowReport(metrics.dowData);
  }, [dashData.hasUploadedData, dashData.historicalData]);


  return (
    <div className="flex flex-col gap-6 p-6 bg-slate-50 border-t border-slate-200 rounded-b-xl">
      <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
        <div className="mb-6 border-b border-slate-100 pb-4 flex justify-between items-end flex-wrap gap-4">
          <div>
            <h3 className="text-xl font-extrabold flex items-center gap-2 mb-1 text-slate-900"><span>📅</span> Day-of-the-Week (DoW) Analysis</h3>
            <p className="text-sm text-slate-500 m-0">Aggregate performance based on historical day to identify systemic vulnerabilities.</p>
          </div>
          {aiTools.dowReport && <button className="gemini-btn btn-alt px-3 py-1.5 text-xs" onClick={() => navigator.clipboard.writeText(aiTools.dowReport)}>Copy</button>}
        </div>


        <table className="w-full text-left border-collapse mt-4 shadow-sm border border-slate-200 rounded-lg overflow-hidden">
          <thead className="bg-slate-50">
             <tr className="border-b border-slate-200">
               <th className="p-3 px-6 font-bold text-slate-700 text-sm">Day</th>
               <th className="p-3 px-6 text-center font-bold text-slate-700 text-sm">Calls Handled</th>
               {COL_DEFINITIONS.map(col => uiState.visibleCols[col.stateKey] && (
                 <th key={col.key} className="p-3 px-6 text-center font-bold text-slate-700 text-sm">{col.label}</th>
               ))}
             </tr>
          </thead>
          <tbody>
             {metrics.dowData.summary.map((row, i) => (
                <tr 
                  key={row.day} 
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-100 cursor-pointer transition-colors"
                  title={`Click to drill down into ${row.day} Team Roster`}
                  onClick={() => {
                      dashData.setActiveTimeframe('dow');
                      dashData.setSelectedDow(row.day);
                      uiHandlers.setMainTab('roster');
                  }}
                >
                  <td className="p-3 px-6 font-bold text-slate-800 flex items-center">
                     {row.day} 
                     {metrics.dowData.worstIdx === i && <span className="ml-2 text-lg animate-pulse" title="Worst Performing Day">⚠️</span>}
                  </td>
                  <td className="p-3 px-6 text-center text-slate-600 font-semibold">{row.data.calls || 0}</td>
                  
                  {COL_DEFINITIONS.map(col => uiState.visibleCols[col.stateKey] && (
                    <td key={col.key} className="p-3 px-6 text-center">
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
           <div className="mt-8 flex justify-center"><GeminiLoader message="Analyzing systemic day vulnerabilities..." color="#0d9488" icon="📅" /></div>
        ) : aiTools.dowReport && (
           <div className="bg-[#fff1f2] border border-[#fecdd3] rounded-xl p-8 mt-8 shadow-sm">
              <div className="report-body text-[1.05rem] leading-relaxed text-red-950 mt-0">
                <FormattedText text={aiTools.dowReport} linkedEntities={uiState.linkedEntities} onEntityClick={uiHandlers.handleAiLinkClick} />
              </div>
           </div>
        )}
      </div>
    </div>
  );
};


const AskAiContent = ({ aiTools, uiState, uiHandlers }) => {
  const smartChips = [
    "🔍 Why did 3DR drop yesterday?",
    "🔍 Who has the highest Hand-offs vs NCW?",
    "🔍 Which Supervisor is driving the most Sales?"
  ];


  return (
    <div className="flex flex-col gap-6 animate-slide-down bg-slate-50 p-6 rounded-xl border border-slate-200">
      <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
        <div className="mb-4">
          <h3 className="text-xl font-extrabold flex items-center gap-2 mb-1 text-slate-900"><span>🔍</span> Data Assistant</h3>
        </div>
        <div className="chat-input-area border border-slate-300 rounded-lg p-1 bg-slate-50 focus-within:border-blue-500 transition-all shadow-sm flex items-center">
          <svg className="ml-3 text-slate-400" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input 
            type="text" className="chat-input border-none bg-transparent flex-1 text-slate-900 placeholder:text-slate-400 !outline-none !shadow-none" placeholder="e.g. Which supervisor has the highest AHT? or What is my overall C-Sat?"
            value={aiTools.askAiQuery} onChange={(e) => aiTools.setAskAiQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && aiTools.handleAskAiSubmit()} disabled={aiTools.askAiLoading}
          />
          <button className="gemini-btn w-auto !m-1" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.2)' }} onClick={() => aiTools.handleAskAiSubmit()} disabled={aiTools.askAiLoading || !aiTools.askAiQuery.trim()}>Ask</button>
        </div>
        
        {/* Smart Chips Section */}
        <div className="flex flex-wrap gap-2 mt-4">
          {smartChips.map((chip, idx) => (
            <button 
              key={idx}
              onClick={() => aiTools.handleAskAiSubmit(chip)}
              disabled={aiTools.askAiLoading}
              className="px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-600 text-xs font-semibold cursor-pointer hover:bg-slate-100 hover:text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {chip}
            </button>
          ))}
        </div>
        
        {aiTools.askAiLoading && (
          <div className="flex justify-center p-6 mt-4"><GeminiLoader message="Analyzing dashboard data..." icon="🧠" color="#3b82f6" /></div>
        )}
        
        {aiTools.askAiResponse && !aiTools.askAiLoading && (
          <div className="ai-output-box !mb-0 mt-6 border-blue-200 bg-blue-50">
              <div className="text-xs font-extrabold text-blue-800 uppercase mb-3 flex items-center gap-2"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> Data Assistant Analysis</div>
              <div className="whitespace-pre-wrap text-slate-800 text-[1.05rem] leading-relaxed"><FormattedText text={aiTools.askAiResponse} linkedEntities={uiState.linkedEntities} onEntityClick={uiHandlers.handleAiLinkClick} /></div>
          </div>
        )}
      </div>
    </div>
  );
};


const SupervisorModalContent = () => {
  const { dashData, metrics, aiTools, uiState, uiHandlers } = useDashboard();
  if (!uiState.selectedSupervisorObj) return null;

  const supName = uiState.selectedSupervisorObj.name;

  // ── Memoized: only recomputes when supervisor, timeframe, or sort changes ──
  const supAgentsList = useMemo(() =>
    dashData.agents
      .filter(a => a.supervisor === supName)
      .map(a => ({ agent: a, data: dashData.getAgentDataForTimeframe(a, dashData.activeTimeframe) }))
      .filter(item => !item.data.isOff),
    [dashData.agents, supName, dashData.activeTimeframe, dashData.getAgentDataForTimeframe]
  );

  const topDetractors = useMemo(() => [...supAgentsList].sort((a, b) => (b.data.detractors || 0) - (a.data.detractors || 0)).filter(a => a.data.detractors >= 1).slice(0, 3), [supAgentsList]);
  const topRepeats    = useMemo(() => [...supAgentsList].sort((a, b) => (b.data.repeats3d || 0) - (a.data.repeats3d || 0)).filter(a => a.data.repeats3d >= 1).slice(0, 3), [supAgentsList]);
  const topHandoffs   = useMemo(() => [...supAgentsList].sort((a, b) => (b.data.handoffsCount || 0) - (a.data.handoffsCount || 0)).filter(a => a.data.handoffsCount >= 1).slice(0, 3), [supAgentsList]);
  const topPromoters  = useMemo(() => [...supAgentsList].filter(a => a.data.vxs === 100 && a.data.promoters >= 1).sort((a, b) => (b.data.promoters || 0) - (a.data.promoters || 0)).slice(0, 3), [supAgentsList]);
  const topResolvers  = useMemo(() => [...supAgentsList].filter(a => a.data.resolve3d != null).sort((a, b) => b.data.resolve3d - a.data.resolve3d).slice(0, 3), [supAgentsList]);
  const topSellers    = useMemo(() => [...supAgentsList].sort((a, b) => (b.data.phoneAdds || 0) - (a.data.phoneAdds || 0)).filter(a => (a.data.phoneAdds || 0) >= 1).slice(0, 3), [supAgentsList]);

  const sortedAgentsList = useMemo(() => {
    const sorted = [...supAgentsList];
    sorted.sort((a, b) => {
      let valA, valB;
      if (uiState.agentSortConfig.key === 'name') {
        valA = a.agent.name.toLowerCase(); valB = b.agent.name.toLowerCase();
        if (valA < valB) return uiState.agentSortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return uiState.agentSortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      } else {
        valA = a.data[uiState.agentSortConfig.key]; valB = b.data[uiState.agentSortConfig.key];
        valA = valA === null || valA === undefined || isNaN(valA) ? -Infinity : Number(valA);
        valB = valB === null || valB === undefined || isNaN(valB) ? -Infinity : Number(valB);
        if (valA < valB) return uiState.agentSortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return uiState.agentSortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      }
    });
    return sorted;
  }, [supAgentsList, uiState.agentSortConfig]);


  return (
    <div className="flex flex-col gap-6 mt-2">
      {uiState.supTab === 'roster' && (
        <div className="flex flex-col gap-6 animate-slide-down">
          <div className="p-5 bg-slate-50 rounded-xl border border-slate-200">
            <div className="text-sm font-extrabold text-slate-900 uppercase mb-4 border-b border-slate-200 pb-2 flex items-center gap-2">
               <span className="text-xl">📊</span> Team KPIs
            </div>
            <div className="grid grid-cols-6 gap-4">
              {(() => {
                  const liveSupObj = metrics.supervisorStats.find(s => s.name === uiState.selectedSupervisorObj.name) || uiState.selectedSupervisorObj;
                  const aData = liveSupObj.activeData;


                  return (
                      <>
                        {COL_DEFINITIONS.filter(col => uiState.visibleCols[col.stateKey]).map(col => {
                          let decimals = 2;
                          if (['aht', 'hold', 'phoneAdds', 'vhi'].includes(col.stateKey)) decimals = 0;
                          else if (['resolve2hr', 'vxs', 'resolve3d', 'handoffs', 'vtt'].includes(col.stateKey)) decimals = 1;
                          return (
                            <SubMetricCard 
                              key={col.label} label={col.label} val={aData[col.stateKey]} 
                              metricKey={col.stateKey} agentCount={liveSupObj.agentCount} 
                              decimals={decimals} prefix={col.stateKey === 'netOcc' ? '$' : ''} suffix={METRIC_CONFIG[col.stateKey].format} 
                            />
                          );
                        })}
                        {COL_DEFINITIONS.filter(col => uiState.visibleCols[col.stateKey]).length === 0 && (
                          <div className="col-span-full p-2 text-center text-slate-500 text-sm">No KPIs selected. Please toggle metrics in Settings.</div>
                        )}
                      </>
                  );
              })()}
            </div>
          </div>


          <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto shadow-sm">
            <table className="roster-table" style={{ minWidth: '100%', margin: 0 }}>
              <thead className="bg-slate-900">
                <tr>
                  <th className="bg-slate-900 text-white border-b-2 border-slate-800 cursor-pointer select-none" onClick={() => uiHandlers.handleAgentSortChange('name')}>
                    Agent Name {uiState.agentSortConfig.key === 'name' && <span className="sort-icon">{uiState.agentSortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                  </th>
                  {COL_DEFINITIONS.map(col => uiState.visibleCols[col.stateKey] && (
                    <th key={col.key} className="bg-slate-900 text-white border-b-2 border-slate-800 text-center cursor-pointer select-none" onClick={() => uiHandlers.handleAgentSortChange(col.stateKey)}>
                      {col.label} {uiState.agentSortConfig.key === col.stateKey && <span className="sort-icon">{uiState.agentSortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                 {sortedAgentsList.map(item => (
                  <tr key={item.agent.ccms} className={`roster-row transition-all duration-300 hover:-translate-y-1 hover:shadow-md relative z-10 ${uiState.highlightedAgentId === item.agent.ccms ? 'bg-blue-100 outline outline-2 outline-blue-500 rounded-md z-20' : ''}`}>
                     <td className="font-semibold p-3 px-6">{item.agent.name}</td>
                     {COL_DEFINITIONS.map(col => uiState.visibleCols[col.stateKey] && (
                        <td key={col.key} className="p-3 px-6 text-center">
                          <MetricCell value={item.data[col.stateKey]} target={getDynamicTarget(col.stateKey, 1)} reverse={col.reverse} isInteger={col.isInteger} />
                        </td>
                     ))}
                  </tr>
                 ))}
              </tbody>
            </table>
          </div>
        </div>
      )}


      {uiState.supTab === 'outliers' && (
        <div className="flex flex-col gap-6 animate-slide-down">
          <div className="grid grid-cols-2 gap-6">
            <div className="p-6 bg-white rounded-xl border border-red-200 shadow-sm">
              <div className="text-lg font-extrabold text-red-800 uppercase mb-4 flex items-center gap-2 border-b border-red-100 pb-3">
                 <span className="text-2xl">⚠️</span> Negative Outliers
              </div>
              <div className="flex flex-col gap-4">
                <div className="bg-red-50 p-4 rounded-lg">
                  <div className="text-sm font-extrabold text-red-900 uppercase mb-3">CSAT Detractors</div>
                  {topDetractors.length > 0 ? topDetractors.map(x => (
                    <div key={x.agent.ccms} className="flex justify-between text-base mb-2 border-b border-red-100 pb-1">
                      <span className="text-slate-700 font-semibold">{x.agent.name}</span><span className="text-red-600 font-bold">{Math.round(x.data.detractors)}</span>
                    </div>
                  )) : <div className="text-sm text-slate-500">None</div>}
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <div className="text-sm font-extrabold text-red-900 uppercase mb-3">3DR Repeats</div>
                  {topRepeats.length > 0 ? topRepeats.map(x => (
                    <div key={x.agent.ccms} className="flex justify-between text-base mb-2 border-b border-red-100 pb-1">
                      <span className="text-slate-700 font-semibold">{x.agent.name}</span><span className="text-red-600 font-bold">{Math.round(x.data.repeats3d)}</span>
                    </div>
                  )) : <div className="text-sm text-slate-500">None</div>}
                </div>
              </div>
            </div>


            <div className="p-6 bg-white rounded-xl border border-emerald-200 shadow-sm">
              <div className="text-lg font-extrabold text-emerald-800 uppercase mb-4 flex items-center gap-2 border-b border-emerald-100 pb-3">
                 <span className="text-2xl">🌟</span> Top Performers
              </div>
              <div className="flex flex-col gap-4">
                <div className="bg-emerald-50 p-4 rounded-lg">
                  <div className="text-sm font-extrabold text-emerald-900 uppercase mb-3">Clean CSAT (100%)</div>
                  {topPromoters.length > 0 ? topPromoters.map(x => (
                    <div key={x.agent.ccms} className="flex justify-between text-base mb-2 border-b border-emerald-100 pb-1">
                      <span className="text-slate-700 font-semibold">{x.agent.name}</span><span className="text-emerald-600 font-bold">{Math.round(x.data.promoters)}</span>
                    </div>
                  )) : <div className="text-sm text-slate-500">None</div>}
                </div>
                <div className="bg-emerald-50 p-4 rounded-lg">
                  <div className="text-sm font-extrabold text-emerald-900 uppercase mb-3">Top 3DR</div>
                  {topResolvers.length > 0 ? topResolvers.map(x => (
                    <div key={x.agent.ccms} className="flex justify-between text-base mb-2 border-b border-emerald-100 pb-1">
                      <span className="text-slate-700 font-semibold">{x.agent.name}</span><span className="text-emerald-600 font-bold">{Number(x.data.resolve3d).toFixed(1)}%</span>
                    </div>
                  )) : <div className="text-sm text-slate-500">None</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}


      {uiState.supTab === 'strategy' && (
        <div className="flex flex-col gap-6 animate-slide-down bg-slate-50 p-6 rounded-xl border border-slate-200">
          
          <div className="flex flex-col gap-3">
             <div className="text-xs font-extrabold text-slate-400 uppercase px-2">AI Toolbelt</div>
             
             <div className="flex flex-wrap gap-2 pb-4 border-b border-slate-200">
               <button 
                 onClick={() => uiHandlers.setActiveSupAiTool('report')} 
                 className={`px-3 py-2 rounded-lg font-bold transition-all flex items-center gap-2 text-sm ${uiState.activeSupAiTool === 'report' ? 'bg-white shadow-sm border border-slate-200 text-slate-900' : 'text-slate-600 hover:bg-slate-200 border border-transparent'}`}
               >
                 <span className="text-base">🤖</span> Sup Report
               </button>


               <button 
                 onClick={() => uiHandlers.setActiveSupAiTool('burnout')} 
                 className={`px-3 py-2 rounded-lg font-bold transition-all flex items-center gap-2 text-sm ${uiState.activeSupAiTool === 'burnout' ? 'bg-white shadow-sm border border-slate-200 text-red-600' : 'text-slate-600 hover:bg-slate-200 border border-transparent'}`}
               >
                 <span className="text-base">🧠</span> Behavioral Scan
               </button>
             </div>
          </div>


          <div className="w-full flex flex-col gap-6">
            {uiState.activeSupAiTool === null && (
              <div className="bg-white border border-slate-200 rounded-xl p-12 shadow-sm flex flex-col items-center justify-center text-center mt-2">
                <span className="text-5xl mb-4">✨</span>
                <h3 className="text-2xl font-extrabold text-slate-800 mb-2">Supervisor Action Hub</h3>
                <p className="text-slate-500 max-w-md">Select a tool from the toolbelt above to generate personalized coaching scripts, reports, or turnaround plans.</p>
              </div>
            )}


            {uiState.activeSupAiTool === 'burnout' && (() => {
              const supBurnoutList = metrics.orgBurnoutList.filter(item => item.agent.supervisor === uiState.selectedSupervisorObj.name);
              return (
                <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
                  <div className="mb-6 border-b border-slate-100 pb-4">
                    <h3 className="text-xl font-extrabold flex items-center gap-2 mb-1 text-red-700"><span>🧠</span> Behavioral Scan Watchlist</h3>
                    <p className="text-sm text-slate-500 m-0">Agents flagged for extreme operational strain. Rank priority: AHT &gt; Net OCC &gt; DPC &gt; Hold.</p>
                  </div>


                  {supBurnoutList.length === 0 ? (
                    <div className="text-center p-5 text-slate-500 italic">No agents currently flagged for high behavioral risk on this team.</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {supBurnoutList.map((item, idx) => {
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
                                      let displayVal = '-';
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
              );
            })()}


            {uiState.activeSupAiTool === 'report' && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                  <h3 className="text-xl font-extrabold flex items-center gap-2 mb-1 text-slate-900"><span>🤖</span> AI Supervisor Report</h3>
                  <p className="text-sm text-slate-500 m-0">Data-driven insights connecting the dots for this team.</p>
                </div>
                <div className="report-body mt-0 p-6 text-[1.05rem]">
                  {aiTools.loading ? (
                    <div className="flex justify-center p-6"><GeminiLoader message="Brewing up Trajectory Report..." /></div>
                  ) : <FormattedText text={aiTools.report} linkedEntities={uiState.linkedEntities} onEntityClick={uiHandlers.handleAiLinkClick} />}
                </div>
              </div>
            )}
          </div>
        </div>
      )}


    </div>
  );
};


const MainModal = React.memo(() => {
  const { dashData, metrics, aiTools, uiState, uiHandlers } = useDashboard();
  if (!uiState.activeModal) return null;


  return (
    <div className="modal-backdrop open" onClick={uiHandlers.closeModal}>
      <div className="main-modal" onClick={(e) => e.stopPropagation()}>
        <div className="main-modal-header">
          <h2 className="m-0 text-xl font-bold text-slate-900">
            {uiState.activeModal === 'askAi' ? 'Data Assistant' : 
             uiState.activeModal === 'supervisor' && uiState.selectedSupervisorObj ? `Supervisor Overview: ${uiState.selectedSupervisorObj.name}` : 'Details'}
          </h2>
          <button className="close-btn" onClick={uiHandlers.closeModal}>✕ Close</button>
        </div>
        
        {uiState.activeModal === 'supervisor' && (
          <div className="bg-slate-50 px-8 py-4 border-b border-slate-200 flex gap-2">
            {[
              { id: 'roster', label: '📋 Team Roster' },
              { id: 'outliers', label: '⚠️ Outliers' },
              { id: 'strategy', label: '⚡ AI Strategy Hub' }
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => uiHandlers.setSupTab(tab.id)}
                className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${uiState.supTab === tab.id ? 'bg-white shadow-sm border border-slate-200 text-slate-900' : 'text-slate-500 hover:bg-slate-200 border border-transparent'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}


        <div className="main-modal-content">
          {uiState.activeModal === 'askAi' && <AskAiContent aiTools={aiTools} uiState={uiState} uiHandlers={uiHandlers} />}
          {uiState.activeModal === 'supervisor' && <SupervisorModalContent />}
        </div>
      </div>
    </div>
  );
});


const DASHBOARD_STYLES = `
.analyst-dashboard{min-height:100vh;width:100%;background-color:#f5f2eb;color:#0b0f19;font-family:'Inter',Helvetica,sans-serif;position:relative}@keyframes slideDown{from{transform:translate(-50%,-20px);opacity:0}to{transform:translate(-50%,0);opacity:1}}.top-navbar{background-color:#0b0f19;border-bottom:1px solid #111827;padding:16px 24px;z-index:40}.top-navbar-inner{width:100%;max-width:1100px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px}.header-info{display:flex;align-items:center;gap:16px}.badge{background:linear-gradient(135deg,rgba(59,130,246,.15) 0,rgba(30,58,138,.2) 100%);color:#93c5fd;border:1px solid rgba(96,165,250,.15);padding:6px 16px;border-radius:20px;font-size:.75rem;font-weight:700;letter-spacing:.5px;display:flex;align-items:center;gap:6px;box-shadow:0 2px 10px rgba(0,0,0,.2)}.action-buttons{display:flex;gap:12px;flex-wrap:wrap;align-items:center}.column-menu-container{position:relative}.column-menu-btn{padding:8px 12px;background:#0b0f19;border:1px solid #111827;border-radius:6px;font-size:1.2rem;color:#94a3b8;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s}.column-menu-btn:hover{color:#fff;background:#111827;border-color:#1e293b}.glass-panel{background:rgba(255,255,255,0.85);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.8);box-shadow:0 10px 40px -10px rgba(0,0,0,0.15)}.column-menu-dropdown{position:absolute;top:100%;right:0;margin-top:12px;background:rgba(255,255,255,0.85);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.8);border-radius:16px;box-shadow:0 10px 40px -10px rgba(0,0,0,0.15);width:300px;padding:20px;z-index:100;display:flex;flex-direction:column;gap:12px}.column-menu-dropdown label{display:flex;align-items:center;gap:10px;font-size:.85rem;cursor:pointer;color:#334155}.main-workspace{padding:32px 24px;max-width:1100px;margin:0 auto;width:100%;display:flex;flex-direction:column;gap:32px}.stats-row{display:grid;grid-template-columns:1fr 1fr;gap:24px}@media (max-width:850px){.stats-row{grid-template-columns:1fr}}.roster-container{position:relative;z-index:10;background:#fff;border-radius:12px;display:flex;flex-direction:column;box-shadow:0 4px 6px rgba(0,0,0,.05);margin-bottom:60px;border:1px solid #e2e8f0;overflow:hidden}.roster-header{position:relative;z-index:50;padding:0 0 16px 0;background-color:transparent;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px}.search-input{padding:8px 16px;border:1px solid #cbd5e1;background-color:#fff;color:#0b0f19;border-radius:6px;font-size:.9rem;width:250px;outline:0;transition:border-color .2s}.search-input:focus{border-color:#3b82f6}.search-input::placeholder{color:#94a3b8}.table-scroll-area{overflow-x:auto}.roster-table{width:100%;border-collapse:collapse;text-align:left;min-width:800px}.roster-table th{position:sticky;top:0;background-color:#0b0f19;padding:12px 24px;font-size:.75rem;text-transform:uppercase;color:#fff;font-weight:700;border-bottom:2px solid #111827;z-index:10;cursor:pointer;user-select:none;transition:background-color .2s}.roster-table th:hover{background-color:#111827;color:#fff}.sort-icon{display:inline-block;margin-left:6px;color:#3b82f6;font-size:.8rem}.roster-table td{padding:16px 24px;border-bottom:1px solid #e2e8f0;color:#334155;font-size:.95rem;vertical-align:middle}.roster-row{cursor:pointer;transition:background-color .2s}.roster-row:nth-child(even){background-color:#f8fafc}.roster-row:nth-child(odd){background-color:#fff}.roster-table tbody tr.roster-row:hover{background-color:#f1f5f9}.roster-table tbody tr.roster-row.active{background-color:#eff6ff}.metric-card{background:#0b0f19;border:1px solid #111827;border-radius:12px;padding:24px;position:relative;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,.1)}.metric-card.clickable-card{cursor:pointer;transition:transform .2s}.metric-card.clickable-card:hover{transform:translateY(-2px);border-color:#334155}.metric-card::after{content:"";position:absolute;top:0;left:0;bottom:0;width:4px}.card-daily::after{background:#3b82f6}.card-mtd::after{background:#1e40af}.gemini-btn{background:linear-gradient(135deg,#3b82f6 0,#1d4ed8 100%);color:#fff;border:none;padding:10px 18px;border-radius:6px;font-weight:700;font-size:.85rem;cursor:pointer;transition:transform .2s,box-shadow .2s;box-shadow:0 4px 12px rgba(59,130,246,.2);display:flex;align-items:center;justify-content:center;gap:8px;text-transform:uppercase;letter-spacing:.5px}.gemini-btn:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(59,130,246,.3)}.gemini-btn:disabled{opacity:.7;cursor:not-allowed;transform:none}.btn-alt{background:transparent;border:1px solid #3b82f6;color:#3b82f6;box-shadow:none}.btn-alt:hover{background:rgba(59,130,246,.05);box-shadow:none}.btn-dark{background:#0b0f19;border:1px solid #111827;color:#fff;box-shadow:none}.btn-dark:hover{background:#111827;border-color:#1e293b}.btn-red-dark{background:#450a0a;color:#fca5a5;border:1px solid #991b1b}.btn-red-dark:hover{background:#7f1d1d}.modal-backdrop{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(11,15,25,.75);backdrop-filter:blur(4px);z-index:90;display:flex;justify-content:flex-start;align-items:stretch;opacity:0;pointer-events:none;transition:opacity .3s ease}.modal-backdrop.open{opacity:1;pointer-events:all}.main-modal{width:95%;max-width:1100px;background:#fff;border-radius:0 24px 24px 0;overflow-y:auto;box-shadow:15px 0 50px -12px rgba(0,0,0,.3);display:flex;flex-direction:column;transform:translateX(-100%);transition:transform .3s cubic-bezier(.16,1,.3,1)}.modal-backdrop.open .main-modal{transform:translateX(0)}.main-modal-header{position:sticky;top:0;background:#fff;z-index:20;padding:24px 32px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center}.main-modal-content{padding:32px;flex:1;display:flex;flex-direction:column}.close-btn{background:#f1f5f9;border:none;padding:8px 16px;border-radius:6px;color:#475569;font-weight:700;cursor:pointer;transition:all .2s}.close-btn:hover{background:#e2e8f0;color:#0b0f19}::-webkit-scrollbar{width:8px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:4px}::-webkit-scrollbar-thumb:hover{background:#94a3b8}.report-body{font-size:16px;line-height:1.9;color:#334155;white-space:pre-wrap;margin-top:16px}.submetrics-panel{display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:12px;margin-bottom:24px;padding:20px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0}.sub-val-main{font-size:1.1rem;font-weight:700;color:#0b0f19}.ai-output-box{margin-bottom:24px;background:#f8fafc;border:1px solid #3b82f6;border-radius:8px;padding:20px;position:relative}.chat-container{background:#0b0f19;border:1px solid #111827;border-radius:12px;padding:24px;margin-top:16px;box-shadow:inset 0 2px 4px rgba(0,0,0,.05)}.chat-messages{display:flex;flex-direction:column;gap:16px;max-height:350px;overflow-y:auto;margin-bottom:20px;padding-right:8px}.message-bubble{max-width:80%;padding:12px 16px;border-radius:12px;font-size:.95rem;line-height:1.5}.bubble-bot{align-self:flex-start;background-color:#27272a;color:#f4f4f5;border-left:4px solid #3b82f6}.bubble-user{align-self:flex-end;background-color:#3b82f6;color:#fff}.chat-input-area{display:flex;gap:12px}.chat-input{flex:1;background-color:#111827;border:1px solid #1e293b;color:#fff;padding:12px 16px;border-radius:8px;font-size:.95rem;outline:0}.chat-input:focus{border-color:#3b82f6}.loader-spin{animation:spin 1s linear infinite}@keyframes spin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}.heatmap-table{width:100%;border-collapse:collapse;margin-top:16px;font-size:.85rem}.heatmap-table th,.heatmap-table td{padding:12px;border:1px solid #e2e8f0;text-align:center}.heatmap-table th{background:#f8fafc;color:#475569;font-weight:700}.range-slider{-webkit-appearance:none;width:100%;height:6px;border-radius:4px;background:#e2e8f0;outline:0}.range-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:18px;height:18px;border-radius:50%;background:#3b82f6;cursor:pointer}


/* UTILITIES */
.flex { display: flex; } .flex-col { flex-direction: column; } .flex-wrap { flex-wrap: wrap; }
.items-center { align-items: center; } .items-start { align-items: flex-start; } .items-baseline { align-items: baseline; }
.justify-center { justify-content: center; } .justify-between { justify-content: space-between; } .justify-around { justify-content: space-around; } .justify-end { justify-content: flex-end; } .flex-1 { flex: 1; }
.gap-1 { gap: 4px; } .gap-2 { gap: 8px; } .gap-3 { gap: 12px; } .gap-4 { gap: 16px; } .gap-5 { gap: 20px; } .gap-6 { gap: 24px; } .gap-8 { gap: 32px; }
.p-0 { padding: 0px; } .p-1 { padding: 4px; } .p-2 { padding: 8px; } .p-3 { padding: 12px; } .p-4 { padding: 16px; } .p-5 { padding: 20px; } .p-6 { padding: 24px; } .p-8 { padding: 32px; } .p-10 { padding: 40px; }
.px-2 { padding-left: 8px; padding-right: 8px; } .px-4 { padding-left: 16px; padding-right: 16px; } .px-6 { padding-left: 24px; padding-right: 24px; } .px-8 { padding-left: 32px; padding-right: 32px; }
.py-1 { padding-top: 4px; padding-bottom: 4px; } .py-2 { padding-top: 8px; padding-bottom: 8px; } .py-3 { padding-top: 12px; padding-bottom: 12px; } .py-4 { padding-top: 16px; padding-bottom: 16px; } .py-5 { padding-top: 20px; padding-bottom: 20px; } .py-6 { padding-top: 24px; padding-bottom: 24px; } .py-10 { padding-top: 40px; padding-bottom: 40px; }
.pb-2 { padding-bottom: 8px; } .pb-4 { padding-bottom: 16px; } .pb-6 { padding-bottom: 24px; }
.pt-3 { padding-top: 12px; } .pt-4 { padding-top: 16px; } .pt-5 { padding-top: 20px; } .pr-4 { padding-right: 16px; }
.m-0 { margin: 0px; } .mt-0 { margin-top: 0px; } .mt-1 { margin-top: 4px; } .mt-2 { margin-top: 8px; } .mt-3 { margin-top: 12px; } .mt-4 { margin-top: 16px; } .mt-6 { margin-top: 24px; } .mt-8 { margin-top: 32px; }
.mb-1 { margin-bottom: 4px; } .mb-2 { margin-bottom: 8px; } .mb-3 { margin-bottom: 12px; } .mb-4 { margin-bottom: 16px; } .mb-6 { margin-bottom: 24px; } .mb-16 { margin-bottom: 64px; } .ml-2 { margin-left: 8px; } .ml-3 { margin-left: 12px; }
.mx-1 { margin-left: 4px; margin-right: 4px; } .mx-auto { margin-left: auto; margin-right: auto; }
.w-full { width: 100%; } .w-auto { width: auto; } .w-9 { width: 36px; } .h-9 { height: 36px; } .w-10 { width: 40px; } .h-10 { height: 40px; } .w-16 { width: 75px; } .h-16 { height: 75px; } .h-full { height: 100%; } .h-auto { height: auto; } .min-w-600 { min-width: 600px; } .min-w-700 { min-width: 700px; } .max-w-280 { max-width: 280px; } .max-w-80 { max-width: 80px; }
.text-center { text-align: center; } .text-right { text-align: right; } .text-left { text-align: left; }
.font-normal { font-weight: 400; } .font-medium { font-weight: 500; } .font-semibold { font-weight: 600; } .font-bold { font-weight: 700; } .font-extrabold { font-weight: 800; } .font-black { font-weight: 900; } .italic { font-style: italic; } .uppercase { text-transform: uppercase; }
.whitespace-nowrap { white-space: nowrap; } .whitespace-pre-wrap { white-space: pre-wrap; }
.leading-none { line-height: 1; } .leading-relaxed { line-height: 1.6; } .tracking-wide { letter-spacing: 0.5px; }
.text-xs { font-size: 0.7rem; } .text-sm { font-size: 0.85rem; } .text-base { font-size: 1rem; } .text-lg { font-size: 1.05rem; } .text-xl { font-size: 1.2rem; } .text-2xl { font-size: 1.5rem; } .text-4xl { font-size: 2.5rem; }
.text-white { color: #ffffff; } .text-slate-300 { color: #cbd5e1; } .text-slate-400 { color: #94a3b8; } .text-slate-500 { color: #64748b; } .text-slate-700 { color: #334155; } .text-slate-900 { color: #0b0f19; } .text-red-400 { color: #f87171; } .text-red-500 { color: #ef4444; } .text-red-600 { color: #dc2626; } .text-red-800 { color: #991b1b; } .text-emerald-400 { color: #34d399; } .text-emerald-500 { color: #10B981; } .text-emerald-600 { color: #059669; } .text-emerald-800 { color: #065f46; } .text-blue-800 { color: #1e40af; }
.bg-white { background-color: #ffffff; } .bg-transparent { background-color: transparent; } .bg-slate-50 { background-color: #f8fafc; } .bg-slate-100 { background-color: #f1f5f9; } .bg-slate-800 { background-color: #111827; } .bg-slate-900 { background-color: #0b0f19; } .bg-red-50 { background-color: #fef2f2; } .bg-red-100 { background-color: #fee2e2; } .bg-emerald-50 { background-color: #ecfdf5; } .bg-emerald-100 { background-color: #d1fae5; } .bg-blue-50 { background-color: #eff6ff; }
.border { border-width: 1px; border-style: solid; } .border-none { border: none; } .border-t { border-top-width: 1px; border-top-style: solid; } .border-b { border-bottom-width: 1px; border-bottom-style: solid; } .border-b-2 { border-bottom-width: 2px; border-bottom-style: solid; } .border-dashed { border-style: dashed; } .border-transparent { border-color: transparent; }
.border-slate-100 { border-color: #f1f5f9; } .border-slate-200 { border-color: #e2e8f0; } .border-slate-300 { border-color: #cbd5e1; } .border-slate-700 { border-color: #334155; } .border-slate-800 { border-color: #111827; } .border-red-200 { border-color: #fecaca; } .border-emerald-200 { border-color: #a7f3d0; } .border-blue-200 { border-color: #bfdbfe; }
.rounded { border-radius: 4px; } .rounded-md { border-radius: 6px; } .rounded-lg { border-radius: 8px; } .rounded-xl { border-radius: 12px; } .rounded-full { border-radius: 50%; }
.shadow-sm { box-shadow: 0 1px 2px rgba(0,0,0,0.02); } .shadow { box-shadow: 0 2px 4px rgba(0,0,0,0.05); } .shadow-lg { box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
.overflow-hidden { overflow: hidden; } .overflow-visible { overflow: visible; } .overflow-x-auto { overflow-x: auto; } .overflow-y-auto { overflow-y: auto; }
.relative { position: relative; } .absolute { position: absolute; } .fixed { position: fixed; } .inset-0 { top: 0; left: 0; right: 0; bottom: 0; }
.block { display: block; } .inline-block { display: inline-block; }
.cursor-pointer { cursor: pointer; } .cursor-help { cursor: help; } .transition-all { transition: all 0.2s; } .outline-none { outline: none; }
.opacity-50 { opacity: 0.5; } .opacity-60 { opacity: 0.6; } .opacity-80 { opacity: 0.8; }
.z-50 { z-index: 50; } .z-1000 { z-index: 1000; }
.top-24 { top: 90px; } .left-1-2 { left: 50%; } .-translate-x-1-2 { transform: translateX(-50%); }
.-rotate-90 { transform: rotate(-90deg); } .rotate-180 { transform: rotate(180deg); } .text-ellipsis { text-overflow: ellipsis; }
.grid { display: grid; } .grid-cols-auto-100 { grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); } .grid-cols-auto-110 { grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); } .grid-cols-auto-200 { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); } .grid-cols-auto-300 { grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); } .grid-cols-2 { grid-template-columns: 1fr 1fr; } .grid-cols-1-280 { grid-template-columns: 1fr 280px; } .grid-cols-5 { grid-template-columns: repeat(5, 1fr); } .grid-cols-6 { grid-template-columns: repeat(6, 1fr); }
.stroke-slate-800 { stroke: #111827; } .stroke-3 { stroke-width: 3; } .fill-none { fill: none; } .rounded-stroke { stroke-linecap: round; } .transition-stroke { transition: stroke-dasharray 1s ease-out; }
.animate-slide-down { animation: slideDown 0.3s ease-out; }
`;


const MODAL_INITIAL = {
  activeModal: null, selectedSupervisorObj: null,
  expandedBurnoutAgentId: null, highlightedAgentId: null, supTab: 'roster',
};

const UI_INITIAL = {
  mainTab: 'roster',
  activeMainAiTool: null,
  activeSupAiTool: null,
  showColMenu: false,
  showModalColMenu: false,
  showTimeframeMenu: false,
  runChartMetric: 'bonus',
  isCumulative: false,
  heatmapViewType: 'weekly',
  outlierMode: 'offenders',
  outlierLevel: 'agent',
  apprenticeViewMode: 'coding',
};

export default function App() {
  const aiResetRef = useRef(null);
  const dashData = useDashboardData(() => { if (aiResetRef.current) aiResetRef.current(); });
  const [modalState, dispatchModal] = React.useReducer((s, a) => ({ ...s, ...a }), MODAL_INITIAL);
  const { activeModal, selectedSupervisorObj, expandedBurnoutAgentId, highlightedAgentId, supTab } = modalState;
  const setActiveModal = (v) => dispatchModal({ activeModal: v });
  const setSelectedSupervisorObj = (v) => dispatchModal({ selectedSupervisorObj: v });
  const setExpandedBurnoutAgentId = (v) => dispatchModal({ expandedBurnoutAgentId: v });
  const setHighlightedAgentId = (v) => dispatchModal({ highlightedAgentId: v });
  const setSupTab = (v) => dispatchModal({ supTab: v });
  const [searchQuery, setSearchQuery] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: 'outlier', direction: 'asc' }); 
  const [agentSortConfig, setAgentSortConfig] = useState({ key: 'name', direction: 'asc' });
  // 12 UI display states → single reducer: one subscription, one render per change
  const [uiDisplay, dispatchUi] = React.useReducer((s, a) => ({ ...s, ...a }), UI_INITIAL);
  const { mainTab, activeMainAiTool, activeSupAiTool, showColMenu, showModalColMenu,
          showTimeframeMenu, runChartMetric, isCumulative, heatmapViewType,
          outlierMode, outlierLevel, apprenticeViewMode } = uiDisplay;
  const setMainTab = (v) => dispatchUi({ mainTab: v });
  const setActiveMainAiTool = (v) => dispatchUi({ activeMainAiTool: v });
  const setActiveSupAiTool = (v) => dispatchUi({ activeSupAiTool: v });
  const setShowColMenu = (v) => dispatchUi({ showColMenu: v });
  const setShowModalColMenu = (v) => dispatchUi({ showModalColMenu: v });
  const setShowTimeframeMenu = (v) => dispatchUi({ showTimeframeMenu: v });
  const setRunChartMetric = (v) => dispatchUi({ runChartMetric: v });
  const setIsCumulative = (v) => dispatchUi({ isCumulative: v });
  const setHeatmapViewType = (v) => dispatchUi({ heatmapViewType: v });
  const setOutlierMode = (v) => dispatchUi({ outlierMode: v });
  const setOutlierLevel = (v) => dispatchUi({ outlierLevel: v });
  const setApprenticeViewMode = (v) => dispatchUi({ apprenticeViewMode: v });
  const [visibleCols, setVisibleCols] = useState({
    vxs: true, resolve2hr: true, phoneAdds: true, handoffs: true, resolve3d: false, aht: false,
    hold: false, dpc: false, vtt: false, netOcc: false, creditFreq: false, vhi: false, ncw: false, trajectory: true 
  });


  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(inputValue);
    }, 300);
    return () => clearTimeout(timer);
  }, [inputValue]);


  const linkedEntities = useMemo(() => {
      const entities = [];
      dashData.supervisors.forEach(s => entities.push({ name: s, type: 'supervisor' }));
      dashData.agents.forEach(a => entities.push({ name: a.name, type: 'agent' }));
      const unique = Array.from(new Map(entities.map(item => [item.name, item])).values());
      return unique.sort((a,b) => b.name.length - a.name.length);
  }, [dashData.supervisors, dashData.agents]);


  const uiState = useMemo(() => ({
    activeModal, selectedSupervisorObj, expandedBurnoutAgentId, highlightedAgentId, supTab, searchQuery, inputValue, sortConfig,
    agentSortConfig, mainTab, activeMainAiTool, activeSupAiTool, showColMenu, showModalColMenu, showTimeframeMenu,
    runChartMetric, isCumulative, heatmapViewType, outlierMode, outlierLevel, apprenticeViewMode, visibleCols,
    linkedEntities
  }), [
    activeModal, selectedSupervisorObj, expandedBurnoutAgentId, highlightedAgentId, supTab, searchQuery, inputValue, sortConfig,
    agentSortConfig, mainTab, activeMainAiTool, activeSupAiTool, showColMenu, showModalColMenu, showTimeframeMenu,
    runChartMetric, isCumulative, heatmapViewType, outlierMode, outlierLevel, apprenticeViewMode, visibleCols,
    linkedEntities
  ]);


  const metrics = useDashboardMetrics({ ...dashData, ...uiState });
  
  const aiTools = useAiTools({ ...dashData, ...metrics, ...uiState });
  aiResetRef.current = aiTools.resetAiStates; // keep ref in sync so upload can clear stale reports


  const handleSortChange = useCallback((key) => {
    setSortConfig((prev) => {
      if (prev.key === key) return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      return { key, direction: key === 'name' ? 'asc' : 'desc' };
    });
  }, []);


  const handleAgentSortChange = useCallback((key) => {
    setAgentSortConfig((prev) => {
      if (prev.key === key) return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      return { key, direction: key === 'name' ? 'asc' : 'desc' };
    });
  }, []);


  const toggleCol = useCallback((colKey) => { setVisibleCols(prev => ({ ...prev, [colKey]: !prev[colKey] })); }, []);


  const closeModal = useCallback(() => {
    dispatchModal(MODAL_INITIAL);   // single dispatch for all 5 modal states — one re-render
    setActiveSupAiTool(null);
    aiTools.resetAiStates();
  }, [aiTools.resetAiStates]);


  const handleAiLinkClick = useCallback((entityName, type) => {
      if (type === 'supervisor') {
          const supObj = metrics.supervisorStats.find(s => s.name === entityName);
          if (supObj) {
              setSelectedSupervisorObj(supObj);
              setActiveModal('supervisor');
              setSupTab('roster');
              setHighlightedAgentId(null);
              aiTools.generateExpertReport(supObj);
          }
      } else if (type === 'agent') {
          const agentObj = dashData.agents.find(a => a.name === entityName);
          if (agentObj) {
              const supObj = metrics.supervisorStats.find(s => s.name === agentObj.supervisor);
              if (supObj) {
                  setSelectedSupervisorObj(supObj);
                  setActiveModal('supervisor');
                  setSupTab('roster');
                  setHighlightedAgentId(agentObj.ccms);
                  aiTools.generateExpertReport(supObj);
              }
          }
      }
  }, [metrics.supervisorStats, dashData.agents, aiTools.generateExpertReport]);


  const uiHandlers = useMemo(() => ({
    setActiveModal, setSelectedSupervisorObj, setExpandedBurnoutAgentId, setHighlightedAgentId, setSupTab, setSearchQuery, setInputValue,
    handleSortChange, handleAgentSortChange, setAgentSortConfig, setMainTab, setActiveMainAiTool, setActiveSupAiTool,
    setShowColMenu, setShowModalColMenu, setShowTimeframeMenu, setRunChartMetric, setIsCumulative, setHeatmapViewType,
    setOutlierMode, setOutlierLevel, setApprenticeViewMode, toggleCol, closeModal, handleAiLinkClick
  }), [handleSortChange, handleAgentSortChange, toggleCol, closeModal, handleAiLinkClick]);


  const ctxValue = useMemo(
    () => ({ dashData, metrics, aiTools, uiState, uiHandlers }),
    [dashData, metrics, aiTools, uiState, uiHandlers]
  );

  return (
    <DashboardContext.Provider value={ctxValue}>
      <div className="analyst-dashboard">
        <style dangerouslySetInnerHTML={{ __html: DASHBOARD_STYLES }} />
        <UploadStatus uploadStatus={dashData.uploadStatus} />
        <ChartActionPlanModal />
        <TopNavbar />


        <div className="main-workspace">
          <MainStatsRow />


          <div className="flex flex-col gap-4 mb-16">
            <FloorHeader />
            
            <div className="roster-container">
              {mainTab === 'roster'      && <FloorRosterTab />}
              {mainTab === 'outliers'    && <FloorOutliersTab />}
              {mainTab === 'apprentice'  && <FloorApprenticeTab />}
              {mainTab === 'analysis'    && <FloorAnalysisTab />}
              {mainTab === 'trends'      && <FloorTrendsTab />}
              {mainTab === 'correlation' && <FloorCorrelationTab />}
              {mainTab === 'burnout'     && <FloorBurnoutTab />}
              {mainTab === 'dow'         && <FloorDowTab />}
            </div>
          </div>
        </div>


        <MainModal />
      </div>
    </DashboardContext.Provider>
  );
}
