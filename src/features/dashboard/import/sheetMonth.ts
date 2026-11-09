// sheetMonth.ts — a sheet named for a month ("Sep", "September 2026") can supply
// the date for rows that have no date column (suggestions.md step 3, X1).
//
// Rules (deliberately narrow, so nothing is guessed):
//   1. Only a sheet with NO date column is touched. A date column with empty or
//      bad cells is never patched: those rows are still reported as invalid.
//   2. The sheet name must be a month by itself ("Sep", "SEPT", "September") or a
//      month with a year ("Sep-26", "September 2026", "2026-09").
//   3. A bare month needs a year. The year comes from the file name
//      ("VOC_Sep_2026.xlsx"), and only when the file name has exactly one
//      distinct year (20xx). Otherwise the rows stay undated and a warning says why.
//   4. The date is the 1st of the month, the same convention as every month-level label.
import { monthNumberFromWord, parseDateText } from './dateText';
import type { ImportWarning } from './types';

export type SheetMonth =
  | { status: 'ok'; date: string; yearFrom: 'sheetName' | 'fileName' | 'choice' }
  | { status: 'needsYear'; month: number }
  | { status: 'none' };

/** The single distinct 4-digit year (2000-2099) in a file name, or null. */
export const yearFromFileName = (fileName: string): number | null => {
  const years = new Set<number>();
  for (const match of fileName.matchAll(/(?:^|\D)(20\d{2})(?!\d)/g)) years.add(Number(match[1]));
  return years.size === 1 ? [...years][0] : null;
};

const isUsableYear = (year: number | undefined): year is number =>
  year !== undefined && Number.isInteger(year) && year >= 2000 && year <= 2099;

/**
 * `yearChoice` is a year the user picked in the import preview. It only applies
 * to a bare month sheet ("Sep") and wins over the file name.
 */
export const resolveSheetMonth = (sheetName: string | undefined, fileName: string, yearChoice?: number): SheetMonth => {
  const name = (sheetName ?? '').trim();
  if (!name) return { status: 'none' };

  // "Sep-26", "September 2026", "2026-09": month and year are both in the name.
  const labelled = parseDateText(name);
  if (labelled !== null && labelled.endsWith('-01')) {
    return { status: 'ok', date: labelled, yearFrom: 'sheetName' };
  }

  // "Sep", "SEPT", "September": a month on its own.
  const month = monthNumberFromWord(name.toLowerCase().replace(/\.$/, ''));
  if (month === null) return { status: 'none' };

  if (isUsableYear(yearChoice)) {
    return { status: 'ok', date: `${yearChoice}-${String(month).padStart(2, '0')}-01`, yearFrom: 'choice' };
  }
  const year = yearFromFileName(fileName);
  if (year === null) return { status: 'needsYear', month };
  return { status: 'ok', date: `${year}-${String(month).padStart(2, '0')}-01`, yearFrom: 'fileName' };
};

export type SheetDatePlan = { date: string | null; warning: ImportWarning | null };

/**
 * What to do about dates for one sheet. `hasDateColumn` must be true when any
 * column of the sheet was mapped to a date field; then nothing changes.
 */
export const planSheetDate = (
  sheetName: string | undefined,
  fileName: string,
  hasDateColumn: boolean,
  yearChoice?: number,
): SheetDatePlan => {
  if (hasDateColumn) return { date: null, warning: null };

  const resolved = resolveSheetMonth(sheetName, fileName, yearChoice);
  if (resolved.status === 'none') return { date: null, warning: null };

  if (resolved.status === 'needsYear') {
    return {
      date: null,
      warning: {
        fileName,
        sheetName,
        code: 'SHEET_MONTH_NEEDS_YEAR',
        message:
          `Sheet "${sheetName}" looks like a month and has no date column, but the file name has no single year, ` +
          `so its rows have no date and are skipped. Put the year in the file name (for example VOC_${sheetName}_2026.xlsx).`,
      },
    };
  }

  const source =
    resolved.yearFrom === 'sheetName'
      ? 'the sheet name'
      : resolved.yearFrom === 'choice'
        ? 'the month from the sheet name and the year you picked in the import preview'
        : 'the month from the sheet name and the year from the file name';
  return {
    date: resolved.date,
    warning: {
      fileName,
      sheetName,
      code: 'DATE_FROM_SHEET_NAME',
      message: `Sheet "${sheetName}" has no date column: every row is dated ${resolved.date} (taken from ${source}).`,
    },
  };
};
