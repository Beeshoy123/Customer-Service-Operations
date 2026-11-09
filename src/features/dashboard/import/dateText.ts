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
// Day-first vs month-first (suggestions.md X7): `5/9/2026` is 5 Sep day-first and
// 9 May month-first. The default is day-first (DD/MM), as before. Slash dates fall
// back to the other order only when the preferred one is impossible
// (e.g. 9/13/2026 day-first). Dash and dot dates never fall back.
// `detectDateOrder` reads the order from the file itself: any value whose first
// part is above 12 proves day-first, any whose second part is above 12 proves
// month-first. Only when a file gives no proof does the setting decide.
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

export type DateOrder = 'dayFirst' | 'monthFirst';

/** 2-digit years mean 20xx (same rule importPolicy.ts always used). */
const expandYear = (yearText: string): number =>
  yearText.length === 2 ? Number(`20${yearText}`) : Number(yearText);

// A trailing time of day (and zone) is dropped: the DATE is what was written.
const TIME_SUFFIX =
  /[T\s]\d{1,2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?\s*(?:[AaPp][Mm])?\s*(?:Z|[+-]\d{2}:?\d{2}|GMT[+-]\d{4})?(?:\s*\([^)]*\))?$/;

const WEEKDAY_PREFIX = /^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*[,\s]+/i;

/** 1-12 for a month name or 3+ letter prefix (lower case), else null. */
export const monthNumberFromWord = (word: string): number | null => {
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

/** Trims, then drops a trailing time of day and a leading weekday name. */
const cleanDateText = (input: string): string =>
  input.trim().replace(TIME_SUFFIX, '').trim().replace(WEEKDAY_PREFIX, '').trim();

const NUMERIC_THREE_PART = /^(\d{1,2})([-/.])(\d{1,2})\2(\d{2}|\d{4})$/;

/**
 * Converts date text to `YYYY-MM-DD`, or null when the text is not a date
 * we can read with certainty. Unknown formats are NOT guessed.
 * `order` only matters for all-numeric dates like 05/09/2026.
 */
export const parseDateText = (input: string, order: DateOrder = 'dayFirst'): string | null => {
  const text = cleanDateText(input);
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
  const numeric = NUMERIC_THREE_PART.exec(text);
  if (numeric) {
    const [, firstText, separator, secondText, yearText] = numeric;
    const first = Number(firstText);
    const second = Number(secondText);
    const year = expandYear(yearText);
    const preferred = order === 'dayFirst' ? toIso(year, second, first) : toIso(year, first, second);
    if (preferred !== null || separator !== '/') return preferred;
    // Slash dates only: the other order is used only when the preferred one is impossible.
    return order === 'dayFirst' ? toIso(year, first, second) : toIso(year, second, first);
  }

  return parseMonthNameDate(text);
};

export type DateOrderDetection = {
  /** The order to use: the proven one, otherwise the fallback. */
  order: DateOrder;
  /** True only when the file proves exactly one order. */
  certain: boolean;
  /** Values with a first part above 12 (can only be day first). */
  dayFirstProof: number;
  /** Values with a second part above 12 (can only be month first). */
  monthFirstProof: number;
};

/**
 * Reads the day/month order from the file's own date values.
 * Only all-numeric dates such as 13/09/2026 or 9/13/26 count as proof.
 * Month names, ISO dates, serial numbers and non-text values are ignored.
 * No proof, or proof of both orders (a mixed file), keeps `fallback`.
 */
export const detectDateOrder = (
  values: Iterable<unknown>,
  fallback: DateOrder = 'dayFirst',
): DateOrderDetection => {
  let dayFirstProof = 0;
  let monthFirstProof = 0;

  for (const value of values) {
    if (typeof value !== 'string') continue;
    const match = NUMERIC_THREE_PART.exec(cleanDateText(value));
    if (!match) continue;
    const first = Number(match[1]);
    const second = Number(match[3]);
    if (first > 12 && second >= 1 && second <= 12) dayFirstProof += 1;
    else if (second > 12 && first >= 1 && first <= 12) monthFirstProof += 1;
  }

  const certain = (dayFirstProof > 0) !== (monthFirstProof > 0);
  const order: DateOrder = certain ? (dayFirstProof > 0 ? 'dayFirst' : 'monthFirst') : fallback;
  return { order, certain, dayFirstProof, monthFirstProof };
};
