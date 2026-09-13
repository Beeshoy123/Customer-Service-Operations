import type { SupportedImportFormat } from './types';

export const EXTENSION_TO_FORMAT: Record<string, SupportedImportFormat> = {
  csv: 'csv',
  tsv: 'tsv',
  txt: 'txt',
  xlsx: 'xlsx',
  xls: 'xls',
  xlsm: 'xlsm',
};

export const detectFileType = (fileName: string): SupportedImportFormat => {
  const normalized = fileName.split('?')[0].toLowerCase();
  const extension = normalized.includes('.') ? normalized.split('.').pop() ?? '' : '';

  return EXTENSION_TO_FORMAT[extension] ?? 'unknown';
};

export const detectTextDelimiter = (sample: string): string => {
  const candidates = [',', '\t', ';', '|'];

  const score = (delimiter: string) => {
    let count = 0;
    const lines = sample.split(/\r?\n/).slice(0, 10);

    for (const line of lines) {
      if (!line) continue;
      const matches = line.split(delimiter).length - 1;
      if (matches > 0) count += matches;
    }

    return count;
  };

  return candidates.sort((a, b) => score(b) - score(a))[0] ?? ',';
};

export const isSupportedImportType = (fileName: string): boolean => {
  return detectFileType(fileName) !== 'unknown';
};
