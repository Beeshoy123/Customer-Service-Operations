// ⚠️  STANDING RULE — DO NOT FIX MAPPING BUGS IN THIS FILE
// If a dashboard metric shows 0, null, or wrong values after import, the fix
// belongs in importPolicy.ts (FIELD_ALIASES), NOT here. This file is a generic
// normalization pipeline that reads alias definitions from importPolicy.ts; it
// does not contain and must not contain any source-system column-name knowledge.
// See recommendations.md §"STANDING RULE" and the banner in importPolicy.ts.

import { FIELD_ALIASES, FIELD_COMPONENT_GROUPS, normalizeImportedValue, findCanonicalField, findPairedCountField } from './importPolicy';
import type { NormalizedRow, SheetTable } from './types';

const normalizeHeader = (value: string): string =>
  `${value ?? ''}`
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const CANONICAL_FIELDS: Record<string, string[]> = Object.fromEntries(
  Object.entries(FIELD_ALIASES).map(([field, policy]) => [field, policy.aliases]),
);

// Pre-compute normalized alias to canonical field map for O(1) lookup
const ALIAS_LOOKUP_MAP = new Map<string, string>();
for (const [field, aliases] of Object.entries(CANONICAL_FIELDS)) {
  for (const alias of aliases) {
    const norm = normalizeHeader(alias);
    ALIAS_LOOKUP_MAP.set(norm, field);
    ALIAS_LOOKUP_MAP.set(norm.replace(/\s+/g, ''), field);
  }
}

export const normalizeHeaderToField = (
  header: string,
  sampleValues: (string | number | null | undefined)[] = []
): string | null => {
  const normalized = normalizeHeader(header);
  const directComponent = Object.entries(FIELD_ALIASES).find(([field, policy]) =>
    FIELD_COMPONENT_GROUPS[field] && policy.aliases.some((alias) => normalizeHeader(alias) === normalized)
  )?.[0];
  if (directComponent) return directComponent;

  const paired = findPairedCountField(header);
  if (paired) {
    return paired.taggedField;
  }

  const directMatch = ALIAS_LOOKUP_MAP.get(normalized);
  if (directMatch) {
    return directMatch;
  }

  return findCanonicalField(header, sampleValues);
};

export const normalizeSheetHeaders = (
  headers: string[],
  rows?: unknown[][]
) => {
  return headers.map((header, index) => {
    const sampleVals = rows
      ? rows
          .slice(0, 50)
          .map((r) => r?.[index] as string | number | null | undefined)
          .filter((v) => v !== undefined && v !== null && String(v).trim() !== '')
      : [];

    return {
      original: header,
      normalized: normalizeHeader(header),
      mappedField: normalizeHeaderToField(header, sampleVals),
      index,
    };
  });
};

export const normalizeCellValue = (value: unknown, fieldName?: string): string | number | null => {
  if (value === null || value === undefined) return null;

  const stringValue = String(value).trim();
  if (stringValue === '') return null;

  return normalizeImportedValue(fieldName ?? null, value);
};

export const mapTableToNormalizedRows = (
  table: SheetTable,
  fileName: string,
  mappingOverrides: Record<string, string | null> = {},
): NormalizedRow[] => {
  const headers = table.headerRow ?? [];
  if (!headers.length) {
    return [];
  }

  const rows = table.rows ?? [];

  // Pre-resolve header mappings ONCE per sheet with sample values, not per-row
  const mappedHeaders: Array<{ index: number; mappedField: string }> = [];
  for (let i = 0; i < headers.length; i += 1) {
    const header = String(headers[i] ?? '').trim();
    const sampleVals = rows
      .slice(0, 50)
      .map((r) => r?.[i] as string | number | null | undefined)
      .filter((v) => v !== undefined && v !== null && String(v).trim() !== '');

    const mappedField = Object.prototype.hasOwnProperty.call(mappingOverrides, header)
      ? mappingOverrides[header]
      : normalizeHeaderToField(header, sampleVals);
    if (mappedField) {
      mappedHeaders.push({ index: i, mappedField });
    }
  }

  if (mappedHeaders.length === 0) {
    return [];
  }

  const normalizedRows: NormalizedRow[] = [];

  for (let r = 0; r < rows.length; r += 1) {
    const rawRow = rows[r];
    const row: NormalizedRow = {};

    for (let m = 0; m < mappedHeaders.length; m += 1) {
      const { index, mappedField } = mappedHeaders[m];
      const value = rawRow?.[index];
      const normalizedValue = normalizeCellValue(value, mappedField);
      if (normalizedValue !== null && normalizedValue !== undefined && normalizedValue !== '') {
        row[mappedField] = normalizedValue;
      }
    }

    if (Object.keys(row).length > 0) {
      row.sourceFile = fileName;
      row.sourceSheet = table.sheetName;
      normalizedRows.push(row);
    }
  }

  return normalizedRows;
};

export const mapTableToNormalizedRowsAsync = async (
  table: SheetTable,
  fileName: string,
  onProgress?: (processedRows: number, totalRows: number) => void,
  mappingOverrides: Record<string, string | null> = {},
): Promise<NormalizedRow[]> => {
  const headers = table.headerRow ?? [];
  if (!headers.length) return [];

  const rows = table.rows ?? [];
  const mappedHeaders: Array<{ index: number; mappedField: string }> = [];
  for (let i = 0; i < headers.length; i += 1) {
    const header = String(headers[i] ?? '').trim();
    const sampleVals = rows
      .slice(0, 50)
      .map((r) => r?.[i] as string | number | null | undefined)
      .filter((v) => v !== undefined && v !== null && String(v).trim() !== '');
    const mappedField = Object.prototype.hasOwnProperty.call(mappingOverrides, header)
      ? mappingOverrides[header]
      : normalizeHeaderToField(header, sampleVals);
    if (mappedField) mappedHeaders.push({ index: i, mappedField });
  }

  if (mappedHeaders.length === 0) return [];

  const normalizedRows: NormalizedRow[] = [];
  const yieldEvery = 5000;
  for (let r = 0; r < rows.length; r += 1) {
    const rawRow = rows[r];
    const row: NormalizedRow = {};

    for (let m = 0; m < mappedHeaders.length; m += 1) {
      const { index, mappedField } = mappedHeaders[m];
      const normalizedValue = normalizeCellValue(rawRow?.[index], mappedField);
      if (normalizedValue !== null && normalizedValue !== undefined && normalizedValue !== '') {
        row[mappedField] = normalizedValue;
      }
    }

    if (Object.keys(row).length > 0) {
      row.sourceFile = fileName;
      row.sourceSheet = table.sheetName;
      normalizedRows.push(row);
    }

    if ((r + 1) % yieldEvery === 0 || r === rows.length - 1) {
      onProgress?.(r + 1, rows.length);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  return normalizedRows;
};

