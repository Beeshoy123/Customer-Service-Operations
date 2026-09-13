import { detectTextDelimiter } from './fileTypeDetector';

export type ParsedTextTable = {
  headers: string[];
  rows: string[][];
};

const coerceCell = (value: string | undefined): string => (value ?? '').trim();

export const parseDelimitedText = (text: string, delimiter?: string): ParsedTextTable => {
  const safeDelimiter = delimiter ?? detectTextDelimiter(text);
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const parsedRows = lines.map((line) => {
    const cells: string[] = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentCell += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === safeDelimiter && !inQuotes) {
        cells.push(currentCell);
        currentCell = '';
        continue;
      }

      currentCell += char;
    }

    cells.push(currentCell);
    return cells.map(coerceCell);
  });

  const [rawHeaders, ...rawRows] = parsedRows;
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
