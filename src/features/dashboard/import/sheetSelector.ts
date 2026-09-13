import type { SheetTable } from './types';

const excludedKeywords = ['summary', 'notes', 'readme', 'cover', 'instructions', 'metadata', 'lookup', 'config', 'settings'];
const dataKeywords = ['agent', 'employee', 'name', 'date', 'calls', 'aht', 'vxs', 'csat', 'resolve', 'supervisor', 'oam', 'manager'];

export const isLikelyDataSheet = (sheet: SheetTable): boolean => {
  if (!sheet || sheet.rowCount <= 0) return false;

  const name = String(sheet.sheetName ?? '').trim().toLowerCase();
  if (excludedKeywords.some((keyword) => name.includes(keyword))) {
    return false;
  }

  const headerText = ((sheet.headerRow ?? []) as unknown[])
    .map((cell) => String(cell ?? '').trim().toLowerCase())
    .join(' ');

  if (!headerText) {
    return false;
  }

  const hasDataSignal = dataKeywords.some((keyword) => headerText.includes(keyword));
  const hasShape = /agent|employee|name|date|calls|aht|vxs|resolve|supervisor|manager/.test(headerText);

  return hasDataSignal || hasShape;
};

export const selectSheets = (sheets: SheetTable[], selectedNames?: string[]): SheetTable[] => {
  if (!selectedNames || selectedNames.length === 0) {
    return sheets.filter(isLikelyDataSheet);
  }

  const selectedSet = new Set(selectedNames);
  return sheets.filter((sheet) => selectedSet.has(sheet.sheetName) && isLikelyDataSheet(sheet));
};
