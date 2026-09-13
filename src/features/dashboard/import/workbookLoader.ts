import * as XLSX from 'xlsx';
import type { SheetTable } from './types';

const convertSheetToRows = (sheet: Record<string, any> | null): unknown[][] => {
  if (!sheet) {
    return [];
  }

  const rawRows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    blankrows: false,
    defval: '',
  }) as unknown[][];

  return rawRows.filter((row) => Array.isArray(row) && row.some((value) => value !== '' && value !== null && value !== undefined));
};

export const parseWorkbookSheets = (workbook: any): SheetTable[] => {
  if (!workbook || typeof workbook.SheetNames === 'undefined') {
    return [];
  }

  return workbook.SheetNames.map((sheetName: string, index: number) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = convertSheetToRows(sheet);
    const headerRow = rows[0] ?? [];

    return {
      workbookName: workbook.WorkbookName || 'Workbook',
      sheetName,
      index,
      rows,
      headerRow,
      rowCount: rows.length,
    };
  });
};

export const convertWorkbookToSheets = async (file: File): Promise<SheetTable[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  return parseWorkbookSheets(workbook);
};
