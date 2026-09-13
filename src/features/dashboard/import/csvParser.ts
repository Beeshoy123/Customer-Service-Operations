import { detectTextDelimiter } from './fileTypeDetector';

export type ParsedTextTable = {
  headers: string[];
  rows: string[][];
};

const coerceCell = (value: string | undefined): string => (value ?? '').trim();

export const parseDelimitedText = (text: string, delimiter?: string): ParsedTextTable => {
  const safeDelimiter = delimiter ?? detectTextDelimiter(text);
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (char === safeDelimiter && !inQuotes) {
      currentRow.push(coerceCell(currentCell));
      currentCell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i += 1;
      }

      currentRow.push(coerceCell(currentCell));
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }

      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += char;
  }

  currentRow.push(coerceCell(currentCell));
  if (currentRow.some((cell) => cell.length > 0)) {
    rows.push(currentRow);
  }

  if (rows.length === 0) {
    return { headers: [], rows: [] };
  }

  const [rawHeaders, ...rawRows] = rows;
  const headers = rawHeaders?.map((header) => header.trim()) ?? [];

  return {
    headers,
    rows: rawRows.map((row) => {
      const normalized = [...row];
      while (normalized.length < headers.length) normalized.push('');
      while (normalized.length > headers.length) normalized.pop();
      return normalized;
    }),
  };
};

export const parseCsvFileText = async (file: File): Promise<ParsedTextTable> => {
  const text = await file.text();
  const delimiter = detectTextDelimiter(text);
  return parseDelimitedText(text, delimiter);
};
