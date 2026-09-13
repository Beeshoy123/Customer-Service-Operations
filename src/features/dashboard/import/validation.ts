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
