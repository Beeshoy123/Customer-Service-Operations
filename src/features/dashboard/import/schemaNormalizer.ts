import { FIELD_ALIASES, normalizeImportedValue, findCanonicalField } from './importPolicy';

const normalizeHeader = (value: string): string =>
  `${value ?? ''}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const CANONICAL_FIELDS: Record<string, string[]> = Object.fromEntries(
  Object.entries(FIELD_ALIASES).map(([field, policy]) => [field, policy.aliases]),
);

export const normalizeHeaderToField = (header: string): string | null => {
  const normalized = normalizeHeader(header);

  for (const [field, aliases] of Object.entries(CANONICAL_FIELDS)) {
    if (aliases.some((alias) => normalizeHeader(alias) === normalized)) {
      return field;
    }
  }

  return findCanonicalField(header);
};

export const normalizeSheetHeaders = (headers: string[]) => {
  return headers.map((header, index) => ({
    original: header,
    normalized: normalizeHeader(header),
    mappedField: normalizeHeaderToField(header),
    index,
  }));
};

export const normalizeCellValue = (value: unknown, fieldName?: string): string | number | null => {
  if (value === null || value === undefined) return null;

  const stringValue = String(value).trim();
  if (stringValue === '') return null;

  return normalizeImportedValue(fieldName ?? null, value);
};
