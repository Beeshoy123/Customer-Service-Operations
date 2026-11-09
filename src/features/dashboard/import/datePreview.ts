// datePreview.ts — what the import preview should tell the user about a sheet's dates.
// Pure and side-effect free (the UI in DatesSection.tsx only renders this).
//
// Three outcomes:
//   none        nothing to decide (ISO dates, month names, serials, or no dates at all)
//   order       the sheet has all-numeric dates (05/09/2026): show how they are read
//               and let the user pick day first or month first
//   monthSheet  a month-named sheet with no date column: show which date its rows get
import { FIELD_ALIASES } from './importPolicy';
import { detectDateOrder, numericDateParts, parseDateText, type DateOrder } from './dateText';
import { resolveSheetMonth } from './sheetMonth';
import type { DetectedColumnMapping, SheetTable } from './types';

export type DateExample = {
  /** The text exactly as it is in the file. */
  raw: string;
  /** `YYYY-MM-DD`, or null when the text cannot be read in the chosen order. */
  read: string | null;
};

export type DatesPreview =
  | { kind: 'none' }
  | {
      kind: 'order';
      /** proven: the file's own values prove one order. unproven: no value can tell. mixed: values prove both. */
      proof: 'proven' | 'unproven' | 'mixed';
      /** What the file itself says (day first when it proves nothing). */
      detected: DateOrder;
      /** What will actually be used: the user's choice, else detected. */
      effective: DateOrder;
      /** True when the user's choice differs from what the file proves. */
      overridesProof: boolean;
      numericCount: number;
      /** A value that proves the order (for the message), if any. */
      proofExample: string | null;
      examples: DateExample[];
    }
  | {
      kind: 'monthSheet';
      month: number;
      /** The date every row gets, or null while the year is still missing. */
      date: string | null;
      yearFrom: 'sheetName' | 'fileName' | 'choice' | null;
    };

const MAX_EXAMPLES = 3;

export const describeSheetDates = (input: {
  table: SheetTable;
  columnMappings: ReadonlyArray<Pick<DetectedColumnMapping, 'mappedField' | 'index'>>;
  fileName: string;
  /** The user's day/month choice for this sheet, if any. */
  orderChoice?: DateOrder;
  /** The year the user picked for a month-named sheet, if any. */
  yearChoice?: number;
}): DatesPreview => {
  const { table, columnMappings, fileName, orderChoice, yearChoice } = input;
  const dateColumns = columnMappings.filter(
    (column) => column.mappedField && FIELD_ALIASES[column.mappedField]?.kind === 'date',
  );

  if (dateColumns.length === 0) {
    const resolved = resolveSheetMonth(table.sheetName, fileName, yearChoice);
    if (resolved.status === 'ok') {
      return { kind: 'monthSheet', month: Number(resolved.date.slice(5, 7)), date: resolved.date, yearFrom: resolved.yearFrom };
    }
    if (resolved.status === 'needsYear') {
      return { kind: 'monthSheet', month: resolved.month, date: null, yearFrom: null };
    }
    return { kind: 'none' };
  }

  const values: unknown[] = [];
  for (const row of table.rows ?? []) {
    for (const column of dateColumns) values.push(row?.[column.index]);
  }

  const numeric = values.filter((value) => numericDateParts(value) !== null) as string[];
  if (numeric.length === 0) return { kind: 'none' };

  const detection = detectDateOrder(values);
  const proof = detection.certain ? 'proven' : detection.dayFirstProof > 0 && detection.monthFirstProof > 0 ? 'mixed' : 'unproven';
  const effective = orderChoice ?? detection.order;

  const proofExample =
    proof === 'proven'
      ? numeric.find((value) => {
          const parts = numericDateParts(value);
          return parts !== null && (detection.order === 'dayFirst' ? parts.first > 12 : parts.second > 12);
        }) ?? null
      : null;

  // Distinct raw values, the proof value first, then the first ones in file order.
  const distinct: string[] = [];
  for (const value of [...(proofExample ? [proofExample] : []), ...numeric]) {
    const text = value.trim();
    if (!distinct.includes(text)) distinct.push(text);
    if (distinct.length === MAX_EXAMPLES) break;
  }

  return {
    kind: 'order',
    proof,
    detected: detection.order,
    effective,
    overridesProof: proof === 'proven' && effective !== detection.order,
    numericCount: numeric.length,
    proofExample: proofExample ? proofExample.trim() : null,
    examples: distinct.map((raw) => ({ raw, read: parseDateText(raw, effective) })),
  };
};

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-09-05` → `5 Sep 2026`. Text only, no Date object, so no time zone. */
export const formatIsoDate = (iso: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const month = MONTH_SHORT[Number(match[2]) - 1];
  return month ? `${Number(match[3])} ${month} ${match[1]}` : iso;
};
