// ==== Shared dashboard UI primitives ==== 
// Quick scan: src/components/shared.tsx for cards, charts, and view formatting

import React from 'react';
import { getDynamicTarget, METRIC_CONFIG } from '../dashboard/config';

export const GeminiLoader = ({ message = 'Cooking it up...', color = '#3b82f6', icon = '✨' }) => (
  <div className="flex flex-col items-center justify-center p-8 gap-4">
    <div className="flex items-center justify-center">
      <div
        className="loader-spin rounded-full w-12 h-12 relative flex items-center justify-center"
        style={{
          border: `4px solid ${color}33`,
          borderTop: `4px solid ${color}`,
        }}
      >
        <span className="absolute text-sm" style={{ animation: 'none' }}>{icon}</span>
      </div>
    </div>
    <span className="font-bold text-lg tracking-wide" style={{ color }}>{message}</span>
  </div>
);

export const FormattedText = ({ text, linkedEntities, onEntityClick }) => {
  if (!text || typeof text !== 'string') return null;

  const parseForEntities = (textStr) => {
    if (!linkedEntities || linkedEntities.length === 0 || !onEntityClick) return textStr;

    let segments = [{ text: textStr, isLink: false }];

    linkedEntities.forEach((entity) => {
      if (!entity.name || entity.name.length < 4) return;
      const escapedName = entity.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b(${escapedName})\\b`, 'gi');

      const newSegments = [];
      segments.forEach((seg) => {
        if (!seg.isLink && typeof seg.text === 'string') {
          const chunks = seg.text.split(regex);
          chunks.forEach((chunk) => {
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
        if (line.trim() === '') return <div key={lineIdx} className="h-4" />;
        let isChecklist = false; let isBullet = false; let cleanLine = line;

        if (/^\s*---\s*$/.test(line)) {
          return <hr key={lineIdx} className="my-8 border-t-2 border-slate-100" />;
        }
        if (/^\s*###\s+/.test(line)) {
          cleanLine = line.replace(/^\s*###\s+/, '');
          return <h3 key={lineIdx} className="text-xl font-black text-slate-800 mt-6 mb-3">{parseForEntities(cleanLine)}</h3>;
        }
        if (/^\s*[-*]\s*\[\s*\]\s*/.test(line)) { isChecklist = true; cleanLine = line.replace(/^\s*[-*]\s*\[\s*\]\s*/, ''); }
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
        }
        if (isBullet) {
          return (
            <div key={lineIdx} className="flex items-start gap-3 my-1.5 ml-2">
              <span className="text-blue-500 font-bold mt-0.5">•</span>
              <span className="flex-1 leading-relaxed">{formattedLine}</span>
            </div>
          );
        }
        return <div key={lineIdx} className="my-1 leading-relaxed">{formattedLine}</div>;
      })}
    </>
  );
};

export const SubMetricCard = ({ label, val, metricKey, agentCount, decimals = 2, prefix = '', suffix = '' }) => {
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

export const DonutChart = ({ value, target, label, format = '', reverse = false, max = 100, isInteger = false }) => {
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

export const MetricCell = ({ value, target, format = '', reverse = false, isOff = false, isInteger = false }) => {
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

export const ParetoColumn = ({ title, icon, data, colorObj, valKey, labelFn, onItemClick }) => (
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
          title={onItemClick ? 'Click to drill down into Supervisor overview' : ''}
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

export const PerformanceHeatmap = ({ activeDates, chartData, metricConfig, baseTarget, onCellClick }) => {
  if (!chartData || chartData.length === 0) return <div className="text-slate-500 text-sm mt-4">No data available for trend chart.</div>;

  return (
    <div className="mt-4 overflow-x-auto border border-slate-200 rounded-lg shadow-sm">
      <table className="heatmap-table w-full text-left bg-white">
        <thead>
          <tr>
            <th className="bg-slate-50 p-3 border-b border-r border-slate-200 font-bold text-slate-700 w-1/4">Entity Name</th>
            {activeDates.map((d) => (
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
              {activeDates.map((d) => {
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
