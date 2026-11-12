// ============================================================================
// FILE STRUCTURE:
// ├── Timeframe Selection Menu
// └── Column Visibility Settings Menu
// ============================================================================

import { COL_DEFINITIONS } from '../features/dashboard/config';
import { monthLabel } from '../features/dashboard/helpers';

// ─── Timeframe Selection Menu ──────────────────────────────────────
// Class strings for the four timeframe buttons (S18: named, not inlined 4 times).
const TIMEFRAME_BTN_BASE = 'flex-1 min-w-[70px] p-2 text-xs rounded-lg cursor-pointer transition-all';
const TIMEFRAME_BTN_ON = 'bg-slate-700 shadow-sm font-bold text-white border border-slate-600';
const TIMEFRAME_BTN_OFF = 'bg-slate-900/60 font-semibold text-slate-300 border border-slate-700 hover:bg-slate-800 hover:text-white';
const timeframeBtnClass = (isActive: boolean) => `${TIMEFRAME_BTN_BASE} ${isActive ? TIMEFRAME_BTN_ON : TIMEFRAME_BTN_OFF}`;

type TimeframeMenuProps = {
  activeTimeframe: string;
  setActiveTimeframe: (value: string) => void;
  selectedWeek: string;
  setSelectedWeek: (value: string) => void;
  selectedDate: string;
  setSelectedDate: (value: string) => void;
  selectedDow: string;
  setSelectedDow: (value: string) => void;
  selectedMonth: string;
  setSelectedMonth: (value: string) => void;
  loadedMonths?: string[];
  closeMenu: () => void;
};

export const TimeframeMenu = ({
  activeTimeframe,
  setActiveTimeframe,
  selectedWeek,
  setSelectedWeek,
  selectedDate,
  setSelectedDate,
  selectedDow,
  setSelectedDow,
  selectedMonth,
  setSelectedMonth,
  loadedMonths = [],
  closeMenu,
}: TimeframeMenuProps) => (
  <>
    <span className="block text-xs font-extrabold text-slate-300 uppercase mb-3 tracking-wide">Timeframe Filter</span>
    <div className="flex gap-2 mb-4 flex-wrap">
      <button
        className={timeframeBtnClass(activeTimeframe === 'monthly')}
        onClick={() => { setActiveTimeframe('monthly'); }}
      >Monthly</button>
      <button
        className={timeframeBtnClass(activeTimeframe === 'weekly')}
        onClick={() => { setActiveTimeframe('weekly'); }}
      >Weekly</button>
      <button
        className={timeframeBtnClass(activeTimeframe === 'daily')}
        onClick={() => { setActiveTimeframe('daily'); }}
      >Daily</button>
      <button
        className={timeframeBtnClass(activeTimeframe === 'dow')}
        onClick={() => { setActiveTimeframe('dow'); }}
      >Day of Week</button>
    </div>

    {activeTimeframe === 'monthly' && (
      <>
        <select
          value={selectedMonth || 'all'}
          onChange={(e) => { setSelectedMonth(e.target.value); closeMenu(); }}
          className="w-full p-2.5 text-sm rounded-lg border border-slate-700 bg-slate-900 text-slate-100 outline-none focus:border-blue-500 focus:bg-slate-800 transition-all shadow-sm cursor-pointer"
          aria-label="Select month"
        >
          {loadedMonths.map((monthKey) => (
            <option key={monthKey} value={monthKey}>{monthLabel(monthKey)}</option>
          ))}
          <option value="all">All months (loaded)</option>
        </select>
        {loadedMonths.length === 0 && (
          <p className="text-xs text-slate-400 mt-2 mb-2">Import data to see available months.</p>
        )}
      </>
    )}

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

// ─── Column Visibility Settings Menu ──────────────────────────────────────
type SettingsMenuProps = {
  visibleCols: Record<string, boolean>;
  toggleCol: (colKey: string) => void;
  closeMenu?: () => void; // passed by HeaderTools; this menu stays open, so it is not used here
};

export const SettingsMenu = ({ visibleCols, toggleCol }: SettingsMenuProps) => (
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
