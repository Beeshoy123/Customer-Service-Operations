// @ts-nocheck
// ==== Shared dashboard menus ==== 
// Quick scan: src/components/menus.tsx for timeframe and settings controls

import React from 'react';
import { COL_DEFINITIONS } from '../features/dashboard/config';

export const TimeframeMenu = ({
  activeTimeframe,
  setActiveTimeframe,
  selectedWeek,
  setSelectedWeek,
  selectedDate,
  setSelectedDate,
  selectedDow,
  setSelectedDow,
  closeMenu,
}) => (
  <>
    <span className="block text-xs font-extrabold text-slate-300 uppercase mb-3 tracking-wide">Timeframe Filter</span>
    <div className="flex gap-2 mb-4 flex-wrap">
      <button
        className={`flex-1 min-w-[70px] p-2 text-xs rounded-lg cursor-pointer transition-all ${activeTimeframe === 'monthly' ? 'bg-slate-700 shadow-sm font-bold text-white border border-slate-600' : 'bg-slate-900/60 font-semibold text-slate-300 border border-slate-700 hover:bg-slate-800 hover:text-white'}`}
        onClick={() => { setActiveTimeframe('monthly'); closeMenu(); }}
      >Monthly</button>
      <button
        className={`flex-1 min-w-[70px] p-2 text-xs rounded-lg cursor-pointer transition-all ${activeTimeframe === 'weekly' ? 'bg-slate-700 shadow-sm font-bold text-white border border-slate-600' : 'bg-slate-900/60 font-semibold text-slate-300 border border-slate-700 hover:bg-slate-800 hover:text-white'}`}
        onClick={() => { setActiveTimeframe('weekly'); }}
      >Weekly</button>
      <button
        className={`flex-1 min-w-[70px] p-2 text-xs rounded-lg cursor-pointer transition-all ${activeTimeframe === 'daily' ? 'bg-slate-700 shadow-sm font-bold text-white border border-slate-600' : 'bg-slate-900/60 font-semibold text-slate-300 border border-slate-700 hover:bg-slate-800 hover:text-white'}`}
        onClick={() => { setActiveTimeframe('daily'); }}
      >Daily</button>
      <button
        className={`flex-1 min-w-[70px] p-2 text-xs rounded-lg cursor-pointer transition-all ${activeTimeframe === 'dow' ? 'bg-slate-700 shadow-sm font-bold text-white border border-slate-600' : 'bg-slate-900/60 font-semibold text-slate-300 border border-slate-700 hover:bg-slate-800 hover:text-white'}`}
        onClick={() => { setActiveTimeframe('dow'); }}
      >Day of Week</button>
    </div>

    {activeTimeframe === 'weekly' && (
      <select
        value={selectedWeek}
        onChange={(e) => { setSelectedWeek(e.target.value); closeMenu(); }}
        className="w-full p-2.5 text-sm rounded-lg border border-slate-700 bg-slate-900 text-slate-100 outline-none focus:border-blue-500 focus:bg-slate-800 transition-all shadow-sm cursor-pointer"
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
        type="date"
        value={selectedDate}
        onChange={(e) => { setSelectedDate(e.target.value); setActiveTimeframe('daily'); closeMenu(); }}
        className="w-full p-2.5 text-sm rounded-lg border border-slate-700 bg-slate-900 text-slate-100 outline-none focus:border-blue-500 focus:bg-slate-800 transition-all shadow-sm cursor-pointer"
      />
    )}

    {activeTimeframe === 'dow' && (
      <select
        value={selectedDow}
        onChange={(e) => { setSelectedDow(e.target.value); closeMenu(); }}
        className="w-full p-2.5 text-sm rounded-lg border border-slate-700 bg-slate-900 text-slate-100 outline-none focus:border-blue-500 focus:bg-slate-800 transition-all shadow-sm cursor-pointer"
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

export const SettingsMenu = ({ visibleCols, toggleCol, closeMenu }) => (
  <>
    <span className="block text-xs font-extrabold text-slate-300 uppercase mb-3 tracking-wide">Toggle Metrics</span>
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-4">
      {COL_DEFINITIONS.map((col) => (
        <label key={col.key} className="flex items-center gap-2 text-sm font-semibold text-slate-200 cursor-pointer hover:text-white transition-colors" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={visibleCols[col.stateKey]} onChange={(e) => { e.stopPropagation(); toggleCol(col.stateKey); }} className="accent-blue-600 w-4 h-4 cursor-pointer" /> {col.label}
        </label>
      ))}
    </div>
    <label className="flex items-center gap-2 text-sm font-semibold text-slate-200 cursor-pointer border-t border-slate-700 pt-4 mt-2 hover:text-white transition-colors" onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" checked={visibleCols.trajectory} onChange={(e) => { e.stopPropagation(); toggleCol('trajectory'); }} className="accent-blue-600 w-4 h-4 cursor-pointer" /> Show Trend Text
    </label>
  </>
);
