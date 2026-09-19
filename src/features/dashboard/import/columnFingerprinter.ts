export type ColumnFingerprint =
  | 'name-like'
  | 'employee-id-like'
  | 'date-like'
  | 'hour-of-day'
  | 'percent-decimal'
  | 'percent-whole'
  | 'count-integer'
  | 'duration-seconds'
  | 'call-id-like'
  | 'categorical-low'
  | 'free-text'
  | 'empty';

export interface ColumnStats {
  cardinality: number;
  totalCount: number;
  nullCount: number;
  nullRate: number;
  minNumeric: number | null;
  maxNumeric: number | null;
  minStringLength: number | null;
  maxStringLength: number | null;
}

// Plausible Excel serial dates for business data:
// 35000 is ~1995-10-23, 60000 is ~2064-03-05.
// Bare numbers outside this range or fewer than 5 digits (e.g. 100, 150, 300)
// are ordinary integers (calls, durations), NOT Excel date serials.
const EXCEL_SERIAL_MIN = 35000;
const EXCEL_SERIAL_MAX = 60000;

/**
 * Checks whether a raw cell string looks like a date.
 * Strictly guards against bare integers (like 120 calls) being parsed as dates.
 */
export function isDateLikeString(trimmed: string): boolean {
  if (!trimmed) return false;

  // 1. Excel serial numbers: must be a 5-digit number in plausible date range
  if (/^\d{5}(\.\d+)?$/.test(trimmed)) {
    const serial = Number(trimmed);
    return serial >= EXCEL_SERIAL_MIN && serial <= EXCEL_SERIAL_MAX;
  }

  // Reject other bare numbers to avoid JS Date.parse("300") interpreting as year 300 AD
  if (/^[+-]?\d+(\.\d+)?$/.test(trimmed)) {
    return false;
  }

  // 2. Standard formatted date strings with delimiters (-, /, .)
  // e.g. YYYY-MM-DD, MM/DD/YYYY, D/M/YYYY, DD-MM-YYYY, YYYY/MM/DD
  const delimitedPattern = /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}(?:[T\s]\d{1,2}:\d{1,2}(?::\d{1,2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
  if (delimitedPattern.test(trimmed)) {
    const timestamp = Date.parse(trimmed);
    if (!Number.isNaN(timestamp)) {
      const year = new Date(timestamp).getFullYear();
      return year >= 1990 && year <= 2050;
    }
  }

  // 3. Dates with month names, e.g. "15-Jan-2024", "Jan 15, 2024", "15 Jan 2024"
  const monthNamePattern = /^(?:[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{2,4}|\d{1,2}[-\s][A-Za-z]{3,9}[-\s]\d{2,4})$/;
  if (monthNamePattern.test(trimmed)) {
    const timestamp = Date.parse(trimmed);
    if (!Number.isNaN(timestamp)) {
      const year = new Date(timestamp).getFullYear();
      return year >= 1990 && year <= 2050;
    }
  }

  return false;
}

/**
 * Checks whether a string represents a formatted duration like "04:15" or "00:05:30".
 */
export function isTimeString(trimmed: string): boolean {
  return /^\d{1,2}:\d{2}(?::\d{2})?$/.test(trimmed);
}

/**
 * Parses a duration string (MM:SS or HH:MM:SS) into total seconds.
 */
export function parseTimeToSeconds(trimmed: string): number | null {
  if (!isTimeString(trimmed)) return null;
  const parts = trimmed.split(':').map(Number);
  if (parts.some((p) => Number.isNaN(p))) return null;
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return null;
}

/**
 * Checks whether a string looks like a system call ID / interaction identifier
 * (e.g. IVR_20240915_9847120, ACSS_98124_A, CALL-88319283, c83f-9281-4820).
 */
export function isCallIdPattern(trimmed: string): boolean {
  // Typical system call IDs: alphanumeric with underscores or dashes, length >= 8,
  // containing both letters/separators and digits.
  const hasSeparatorsAndDigits = /^[a-zA-Z0-9_-]{8,}$/.test(trimmed) &&
    (/[a-zA-Z_-]/.test(trimmed) && /\d/.test(trimmed));

  // Common telephony prefix patterns (IVR_, CALL_, REC_, CONV_, TICKET_, CASE_)
  const hasKnownPrefix = /^(?:ivr|call|rec|acss|conv|ticket|case|sess)[_-]/i.test(trimmed);

  // Telephony 10+ digit numeric IDs (e.g. 202409150019284)
  const isLongNumericId = /^\d{10,20}$/.test(trimmed);

  return hasSeparatorsAndDigits || hasKnownPrefix || isLongNumericId;
}

/**
 * Checks whether a string looks like a person's name:
 * "LASTNAME, FIRSTNAME", "First Last", "First M. Last", "O'Connor, Tim", etc.
 */
export function isNameLikeString(trimmed: string): boolean {
  if (!trimmed || trimmed.length < 3 || trimmed.length > 50) return false;

  // Reject strings containing numbers, percent, or system characters
  if (/[0-9%_@#$<>=+*\/\\\[\]{}()]/.test(trimmed)) return false;

  // Comma style: "LASTNAME, FIRSTNAME", "Doe, Jane M.", "O'Connor, Tim"
  const commaStyle = /^[\p{L}'.\-]+,\s*[\p{L}'.\s\-]+$/u;
  if (commaStyle.test(trimmed)) return true;

  // Space style: "First Last", "First Middle Last", "Mary-Jane Watson"
  const spaceStyle = /^[\p{L}][\p{L}'.\-]+(?:\s+[\p{L}][\p{L}'.\-]+)+$/u;
  if (spaceStyle.test(trimmed)) {
    // Avoid short common categorical words like "CX Voice" or "Inbound Queue"
    // Person names typically don't have uppercase acronyms as words (e.g. "CX")
    const words = trimmed.split(/\s+/);
    const hasAllCapAcronym = words.some((w) => w.length <= 3 && w === w.toUpperCase() && /^[A-Z]+$/.test(w));
    if (!hasAllCapAcronym) {
      return true;
    }
  }

  return false;
}

/**
 * Analyzes sample column values and produces a ColumnFingerprint and ColumnStats.
 * Pure function with no side effects.
 */
export function analyzeColumnValues(sampleValues: (string | number | null | undefined)[]): {
  fingerprint: ColumnFingerprint;
  stats: ColumnStats;
} {
  const totalCount = sampleValues.length;
  const nonNullValues = sampleValues
    .map((v) => (v === null || v === undefined ? '' : String(v).trim()))
    .filter((v) => v !== '');

  const nullCount = totalCount - nonNullValues.length;
  const nullRate = totalCount > 0 ? nullCount / totalCount : 1.0;

  const uniqueValues = new Set(nonNullValues);
  const cardinality = uniqueValues.size;

  let minNumeric: number | null = null;
  let maxNumeric: number | null = null;
  let minStringLength: number | null = null;
  let maxStringLength: number | null = null;
  let totalStringLength = 0;

  let numericCount = 0;
  let integerCount = 0;
  let dateLikeCount = 0;
  let percentCharCount = 0;
  let timeDurationCount = 0;
  let callIdCount = 0;
  let nameLikeCount = 0;

  for (const val of nonNullValues) {
    const len = val.length;
    totalStringLength += len;
    if (minStringLength === null || len < minStringLength) minStringLength = len;
    if (maxStringLength === null || len > maxStringLength) maxStringLength = len;

    // Check percent symbol
    if (val.includes('%')) {
      percentCharCount++;
    }

    // Check time duration strings (MM:SS or HH:MM:SS)
    if (isTimeString(val)) {
      timeDurationCount++;
    }

    // Check numeric value
    const cleanedVal = val.replace(/[%,$\s]/g, '');
    const num = Number(cleanedVal);

    if (cleanedVal !== '' && !Number.isNaN(num)) {
      numericCount++;
      if (Number.isInteger(num)) {
        integerCount++;
      }
      if (minNumeric === null || num < minNumeric) minNumeric = num;
      if (maxNumeric === null || num > maxNumeric) maxNumeric = num;
    }

    // Check date pattern
    if (isDateLikeString(val)) {
      dateLikeCount++;
    }

    // Check call ID pattern
    if (isCallIdPattern(val)) {
      callIdCount++;
    }

    // Check name pattern
    if (isNameLikeString(val)) {
      nameLikeCount++;
    }
  }

  const stats: ColumnStats = {
    cardinality,
    totalCount,
    nullCount,
    nullRate,
    minNumeric,
    maxNumeric,
    minStringLength,
    maxStringLength,
  };

  // If no non-null values present
  if (nonNullValues.length === 0) {
    return { fingerprint: 'empty', stats };
  }

  const nonNullLen = nonNullValues.length;

  // 1. Date Like (>= 80% match date format or 5-digit Excel serials)
  if (dateLikeCount / nonNullLen >= 0.8) {
    return { fingerprint: 'date-like', stats };
  }

  // 2. Call ID like: Alphanumeric with underscores or long numeric IDs, high cardinality
  // Placed early to act as a blocker against employeeId / count-integer false matches
  if (callIdCount / nonNullLen >= 0.8 && cardinality / nonNullLen >= 0.7) {
    return { fingerprint: 'call-id-like', stats };
  }

  // 3. Formatted time durations (e.g. "04:15", "00:05:30")
  if (timeDurationCount / nonNullLen >= 0.8) {
    return { fingerprint: 'duration-seconds', stats };
  }

  // 4. Numeric column analysis
  if (numericCount / nonNullLen >= 0.85) {
    // 4a. Employee ID: 6-8 digit positive integers without decimals or leading zeros
    const allEmployeeIdPattern = nonNullValues.every((val) => /^[1-9]\d{5,7}$/.test(val.replace(/[,\s]/g, '')));
    if (
      allEmployeeIdPattern &&
      minNumeric !== null &&
      maxNumeric !== null &&
      minNumeric >= 100000 &&
      maxNumeric <= 99999999
    ) {
      return { fingerprint: 'employee-id-like', stats };
    }

    // 4b. Hour of Day: integers 0–23, max cardinality 24, maxNumeric > 1 (to not conflict with binary 0/1 counts)
    if (
      integerCount === nonNullLen &&
      minNumeric !== null &&
      maxNumeric !== null &&
      minNumeric >= 0 &&
      maxNumeric <= 23 &&
      maxNumeric > 1 &&
      cardinality <= 24
    ) {
      return { fingerprint: 'hour-of-day', stats };
    }

    // 4c. Percent Decimal: values between 0.0 and 1.0 with decimal values
    if (minNumeric !== null && maxNumeric !== null && minNumeric >= 0 && maxNumeric <= 1) {
      const hasDecimals = nonNullValues.some((val) => {
        const cleaned = val.replace(/[%,$\s]/g, '');
        const n = Number(cleaned);
        return !Number.isNaN(n) && !Number.isInteger(n);
      });
      if (hasDecimals || (minNumeric > 0 && maxNumeric < 1)) {
        return { fingerprint: 'percent-decimal', stats };
      }
    }

    // 4d. Percent Whole: has % sign, or numbers in range (1, 100] with decimals
    const hasPercentSigns = percentCharCount / nonNullLen >= 0.5;
    if (hasPercentSigns) {
      return { fingerprint: 'percent-whole', stats };
    }

    if (minNumeric !== null && maxNumeric !== null && minNumeric >= 0 && maxNumeric <= 100) {
      const hasDecimals = nonNullValues.some((val) => {
        const cleaned = val.replace(/[%,$\s]/g, '');
        const n = Number(cleaned);
        return !Number.isNaN(n) && !Number.isInteger(n);
      });
      if (hasDecimals) {
        return { fingerprint: 'percent-whole', stats };
      }
    }

    // 4e. Duration Seconds: integers in range 10–3600 (minNumeric >= 10, e.g. 180–900s)
    if (
      integerCount / nonNullLen >= 0.85 &&
      minNumeric !== null &&
      maxNumeric !== null &&
      minNumeric >= 10 &&
      maxNumeric <= 3600 &&
      cardinality > 3
    ) {
      return { fingerprint: 'duration-seconds', stats };
    }

    // 4f. Count Integer: non-negative integers
    if (integerCount / nonNullLen >= 0.85 && minNumeric !== null && minNumeric >= 0) {
      return { fingerprint: 'count-integer', stats };
    }
  }

  // 5. Name-like (>= 80% look like "LASTNAME, FIRSTNAME" or "First Last")
  if (nameLikeCount / nonNullLen >= 0.8) {
    return { fingerprint: 'name-like', stats };
  }

  // 6. Free text: long strings with high cardinality
  const avgStringLength = totalStringLength / nonNullLen;
  if ((maxStringLength !== null && maxStringLength > 40 && avgStringLength > 25) && cardinality / nonNullLen > 0.5) {
    return { fingerprint: 'free-text', stats };
  }

  // 7. Categorical Low: default for low cardinality strings
  if (cardinality < 10 || cardinality / nonNullLen <= 0.25) {
    return { fingerprint: 'categorical-low', stats };
  }

  // Fallback for remaining text
  return { fingerprint: 'categorical-low', stats };
}

/**
 * Convenience helper to return just the ColumnFingerprint for a sample of values.
 */
export function fingerprintColumn(sampleValues: (string | number | null | undefined)[]): ColumnFingerprint {
  return analyzeColumnValues(sampleValues).fingerprint;
}
