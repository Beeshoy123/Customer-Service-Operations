// dateText.ts — single owner of "date text → YYYY-MM-DD" for imported cells.
//
// WHY THIS FILE EXISTS (suggestions.md step 3, X1): convertDateLike used to hand
// any text it did not recognise to `new Date(text)` and then call
// `.toISOString()`. `new Date()` reads the text in the MACHINE's time zone and
// `.toISOString()` converts to UTC, so in Cairo (UTC+3 in summer) local midnight
// became the previous day: `September 2026` → 2026-08-31, `Sep 5, 2026` → Sep 4.
// `Sep-26` was read as 26 Sep 2001 in every time zone.
//
// This module only does string and integer maths. It never calls `new Date()`
// or `Date.parse()`, so the result is identical in every time zone.
//
// Day-first vs month-first: all-numeric dates keep the behaviour importPolicy.ts
// already had. Slash dates are read day-first (DD/MM) and fall back to
// month-first only when day-first is impossible (e.g. 9/13/2026). Dash and dot
// dates are day-first only.
//
// Month-only text (`September 2026`, `Sep-26`, `9/2026`, `2026-09`) becomes the
// 1st of that month.

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

const isLeapYear = (year: number): boolean =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

const daysInMonth = (year: number, month: number): number => {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
};

/** Builds `YYYY-MM-DD`, or null when the calendar date does not exist (e.g. 31 Apr). */
const toIso = (year: number, month: number, day: number): string | null => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1000 || year > 9999) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

/** 2-digit years mean 20xx (same rule importPolicy.ts always used). */
const expandYear = (yearText: string): number =>
  yearText.length === 2 ? Number(`20${yearText}`) : Number(yearText);

// A trailing time of day (and zone) is dropped: the DATE is what was written.
const TIME_SUFFIX =
  /[T\s]\d{1,2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?\s*(?:[AaPp][Mm])?\s*(?:Z|[+-]\d{2}:?\d{2}|GMT[+-]\d{4})?(?:\s*\([^)]*\))?$/;

const WEEKDAY_PREFIX = /^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*[,\s]+/i;

const monthNumberFromWord = (word: string): number | null => {
  if (word.length < 3) return null;
  if (word === 'sept') return 9;
  const index = MONTH_NAMES.findIndex((name) => name.startsWith(word));
  return index === -1 ? null : index + 1;
};

const isYearText = (text: string): boolean => /^(?:\d{2}|\d{4})$/.test(text);
const isDayText = (text: string): boolean => /^\d{1,2}$/.test(text);

/** Dates written with month names: `Sep 5, 2026`, `5-Sep-26`, `September 2026`, `Sep-26`. */
const parseMonthNameDate = (text: string): string | null => {
  const tokens = text
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .split(/[\s\-/]+/)
    .filter(Boolean)
    .map((token) => token.replace(/^(\d{1,2})(?:st|nd|rd|th)$/, '$1'));

  if (tokens.length === 2) {
    const [first, second] = tokens;
    const monthFirst = monthNumberFromWord(first);
    if (monthFirst !== null && isYearText(second)) return toIso(expandYear(second), monthFirst, 1);
    const monthSecond = monthNumberFromWord(second);
    if (monthSecond !== null && /^\d{4}$/.test(first)) return toIso(Number(first), monthSecond, 1);
    return null;
  }

  if (tokens.length === 3) {
    const [first, second, third] = tokens;
    const monthFirst = monthNumberFromWord(first);
    if (monthFirst !== null && isDayText(second) && isYearText(third)) {
      return toIso(expandYear(third), monthFirst, Number(second));
    }
    const monthSecond = monthNumberFromWord(second);
    if (monthSecond !== null && isDayText(first) && isYearText(third)) {
      return toIso(expandYear(third), monthSecond, Number(first));
    }
    return null;
  }

  return null;
};

/**
 * Converts date text to `YYYY-MM-DD`, or null when the text is not a date
 * we can read with certainty. Unknown formats are NOT guessed.
 */
export const parseDateText = (input: string): string | null => {
  let text = input.trim();
  if (!text) return null;

  text = text.replace(TIME_SUFFIX, '').trim().replace(WEEKDAY_PREFIX, '').trim();
  if (!text) return null;

  // Year first: 2026-09-05, 2026/9/5, 2026.09.05
  const yearFirst = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
  if (yearFirst) return toIso(Number(yearFirst[1]), Number(yearFirst[2]), Number(yearFirst[3]));

  // Year + month only: 2026-09, 2026/9
  const yearMonth = /^(\d{4})[-/.](\d{1,2})$/.exec(text);
  if (yearMonth) return toIso(Number(yearMonth[1]), Number(yearMonth[2]), 1);

  // Month + year only: 9/2026, 09-2026
  const monthYear = /^(\d{1,2})[-/.](\d{4})$/.exec(text);
  if (monthYear) return toIso(Number(monthYear[2]), Number(monthYear[1]), 1);

  // Three numbers ending in the year: 05/09/2026, 5-9-26, 05.09.2026
  const dayMonthYear = /^(\d{1,2})([-/.])(\d{1,2})\2(\d{2}|\d{4})$/.exec(text);
  if (dayMonthYear) {
    const [, first, separator, second, yearText] = dayMonthYear;
    const year = expandYear(yearText);
    const dayFirst = toIso(year, Number(second), Number(first));
    if (dayFirst !== null || separator !== '/') return dayFirst;
    // Slash dates only: month-first is used only when day-first is impossible.
    return toIso(year, Number(first), Number(second));
  }

  return parseMonthNameDate(text);
};
