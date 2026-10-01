// timeframe.ts — S1(e) of the `useDashboardData` split (recommendations.md).
// Move-only extraction from hooks.ts: the agentDataCache memo and the four
// timeframe selectors. No logic changes — verified by an origin-diff parity
// audit against hooks.ts.
// ⚠️ STANDING RULE — DO NOT FIX MAPPING BUGS IN THIS FILE. Mapping/alias fixes
// belong in importPolicy.ts (FIELD_ALIASES), nowhere else.

import { useMemo } from 'react';
import { DAYS_OF_WEEK } from './config';
import { aggregateRecords, dowFromDateStr, monthLabel, ALL_MONTHS } from './helpers';

// The selectors only read the four time selectors, the data payload and the
// three setters that `handleDateChange` drives. Passed as one object by
// useDashboardData so this module stays a pure function of what it is handed.
//
// `any` on the values is deliberate and matches the S1(a)/S1(b) precedent:
// they originate in `@ts-nocheck` land. Give them real types as a follow-up,
// not as part of a move-only step.
export interface TimeframeSelectorDeps {
  historicalData: any;
  hasUploadedData: any;
  activeTimeframe: any;
  selectedWeek: any;
  selectedDow: any;
  selectedDate: any;
  selectedMonth: any;
  setActiveTimeframe: (value: any) => void;
  setSelectedDate: (value: any) => void;
  setSelectedDow: (value: any) => void;
}

export const useTimeframeSelectors = (deps: TimeframeSelectorDeps) => {
  const {
    historicalData, hasUploadedData, activeTimeframe, selectedWeek,
    selectedDow, selectedDate, selectedMonth,
    setActiveTimeframe, setSelectedDate, setSelectedDow,
  } = deps;

  const agentDataCache = useMemo(() => {
    const cache: any = {};
    if (!hasUploadedData) return cache;

    const OFF = { isOff: true, calls: 0 };
    const daysMap: any = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
    const targetDow = daysMap[selectedDow];
    const weekNum = parseInt(selectedWeek.replace('Week ', ''));
    const startDay = (weekNum - 1) * 7 + 1;
    const endDay = weekNum >= 5 ? 31 : startDay + 6;

    const monthScopedDates = (allDates: any) =>
      selectedMonth === ALL_MONTHS ? allDates : allDates.filter((d: any) => d.startsWith(selectedMonth));

    Object.keys(historicalData).forEach((ccms) => {
      const agentHistory = historicalData[ccms];
      const allDates = Object.keys(agentHistory);
      const scopedDates = monthScopedDates(allDates);

      cache[`${ccms}|monthly`] = scopedDates.length > 0 ? aggregateRecords(scopedDates.map((d: any) => agentHistory[d])) : OFF;
      cache[`${ccms}|daily`] = agentHistory[selectedDate] ? { ...agentHistory[selectedDate] } : OFF;

      const weekDates = scopedDates.filter((d: any) => {
        const parts = d.split('-');
        if (parts.length !== 3) return false;
        const day = parseInt(parts[2], 10);
        return day >= startDay && day <= endDay;
      });
      cache[`${ccms}|weekly`] = weekDates.length > 0 ? aggregateRecords(weekDates.map((d: any) => agentHistory[d])) : OFF;

      const dowDates = scopedDates.filter((d: any) => dowFromDateStr(d) === targetDow);
      cache[`${ccms}|dow`] = dowDates.length > 0 ? aggregateRecords(dowDates.map((d: any) => agentHistory[d])) : OFF;
    });

    return cache;
  }, [historicalData, hasUploadedData, selectedDate, selectedWeek, selectedDow, selectedMonth]);

  const getAgentDataForTimeframe = (agent: any, timeframe: any) => {
    if (!hasUploadedData) return { isOff: true, calls: 0 };
    return agentDataCache[`${agent.ccms}|${timeframe}`] || { isOff: true, calls: 0 };
  };

  const handleDateChange = (daysToAdd: any) => {
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
    if (activeTimeframe === 'monthly') return monthLabel(selectedMonth);
    if (activeTimeframe === 'weekly') return selectedWeek;
    return getCurrentMonthName();
  };

  // `monthLabel` is re-exported here so consumers keep getting it through the
  // dashboard bundle; it has always been a helper, not selector state.
  return { agentDataCache, getAgentDataForTimeframe, getTopHeadlineMonth, monthLabel, handleDateChange };
};
