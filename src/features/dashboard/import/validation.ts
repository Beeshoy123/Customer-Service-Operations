import type { ImportWarning, NormalizedRow } from './types';

const hasMeaningfulText = (value: unknown): boolean => typeof value === 'string' ? value.trim().length > 0 : value !== null && value !== undefined && value !== '';

export const validateNormalizedRows = (rows: NormalizedRow[], fileName: string): { rows: NormalizedRow[]; warnings: ImportWarning[] } => {
  const warnings: ImportWarning[] = [];
  const cleanedRows = rows.filter((row, index) => {
    const hasName = hasMeaningfulText(row.agentName ?? row.name);
    const hasDate = hasMeaningfulText(row.date);

    if (!hasName) {
      warnings.push({ fileName, message: `Skipped row ${index + 1} with missing agent name.`, row: index + 1 });
      return false;
    }

    if (!hasDate) {
      warnings.push({ fileName, message: `Skipped row ${index + 1} with missing or invalid date.`, row: index + 1 });
      return false;
    }

    const percentFields = ['vxs', 'resolve2hr', 'resolve3d'] as const;
    for (const field of percentFields) {
      const value = row[field];
      if (value === null || value === undefined || value === '') continue;

      const numericValue = typeof value === 'number' ? value : Number(String(value).replace(/[%,$\s]/g, ''));
      if (Number.isNaN(numericValue)) continue;

      if (numericValue < 0 || numericValue > 100) {
        warnings.push({
          fileName,
          message: `Row ${index + 1} has out-of-range ${field} value (${numericValue}). Expected a percentage between 0 and 100.`,
          row: index + 1,
          code: 'OUT_OF_RANGE_PERCENT',
        });
      }
    }

    return true;
  });

  return { rows: cleanedRows, warnings };
};

export const buildSummary = (rows: NormalizedRow[], warnings: ImportWarning[], errors: ImportWarning[] = []) => ({
  files: 1,
  sheets: 1,
  rows: rows.length,
  warnings,
  errors,
});
