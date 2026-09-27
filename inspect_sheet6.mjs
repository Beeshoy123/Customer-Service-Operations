import * as XLSXModule from 'xlsx';
import fs from 'node:fs';
import { selectSheetsWithDetails } from './src/features/dashboard/import/sheetSelector.ts';

const XLSX = XLSXModule.default || XLSXModule;
const buf = fs.readFileSync('G:\\resolve case study.xlsx');
const wb = XLSX.read(buf, { type: 'buffer' });
const sheets = wb.SheetNames.map((name, index) => {
  const ws = wb.Sheets[name];
  const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
  return {
    workbookName: 'resolve case study.xlsx',
    sheetName: name,
    index,
    headerRow: (rawData[0] || []).map(String),
    rows: rawData.slice(1),
    rowCount: rawData.length - 1,
  };
});

const selection = selectSheetsWithDetails(sheets);
console.log('Selected sheets:', selection.selectedSheets.map(s => `${s.sheetName} (${s.rowCount} rows)`));
console.log('Skipped sheets:', selection.skippedSheets.map(s => `${s.sheetName} (${s.reason})`));
