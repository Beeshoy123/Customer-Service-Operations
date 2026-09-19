import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeColumnValues,
  fingerprintColumn,
  isDateLikeString,
  isTimeString,
  parseTimeToSeconds,
  isCallIdPattern,
  isNameLikeString,
} from './columnFingerprinter';

describe('columnFingerprinter (Step 1 — Value Pattern Fingerprinting)', () => {
  describe('Helper functions', () => {
    it('isDateLikeString accurately identifies dates and rejects plain integers', () => {
      // Valid dates
      assert.equal(isDateLikeString('2024-04-01'), true);
      assert.equal(isDateLikeString('04/01/2024'), true);
      assert.equal(isDateLikeString('4/1/2024'), true);
      assert.equal(isDateLikeString('01-04-2024'), true);
      assert.equal(isDateLikeString('15-Jan-2024'), true);
      assert.equal(isDateLikeString('Jan 15, 2024'), true);

      // Plausible Excel serial (e.g. 45383 = 2024-04-01)
      assert.equal(isDateLikeString('45383'), true);
      assert.equal(isDateLikeString('45383.5'), true);

      // Bare numbers that MUST NOT be classified as date-like
      assert.equal(isDateLikeString('100'), false, '100 calls is not a date');
      assert.equal(isDateLikeString('150'), false, '150 calls is not a date');
      assert.equal(isDateLikeString('300'), false, '300 seconds is not a date');
      assert.equal(isDateLikeString('0'), false, '0 is not a date');
      assert.equal(isDateLikeString('12'), false, '12 is not a date');
      assert.equal(isDateLikeString('100234'), false, '6-digit employee id is not a date');
      assert.equal(isDateLikeString(''), false);
    });

    it('isTimeString and parseTimeToSeconds parse MM:SS and HH:MM:SS durations', () => {
      assert.equal(isTimeString('05:30'), true);
      assert.equal(isTimeString('00:08:45'), true);
      assert.equal(isTimeString('1:25'), true);
      assert.equal(isTimeString('random'), false);
      assert.equal(isTimeString('100'), false);

      assert.equal(parseTimeToSeconds('05:30'), 330);
      assert.equal(parseTimeToSeconds('00:08:45'), 525);
      assert.equal(parseTimeToSeconds('invalid'), null);
    });

    it('isCallIdPattern matches system identifiers and telephony IDs', () => {
      assert.equal(isCallIdPattern('IVR_20240915_9847120'), true);
      assert.equal(isCallIdPattern('ACSS_Call_98124_A'), true);
      assert.equal(isCallIdPattern('CALL_ID_88319283'), true);
      assert.equal(isCallIdPattern('c83f-9281-4820-bb12'), true);
      assert.equal(isCallIdPattern('202409150019284'), true); // 10+ digits

      // Standard employee IDs (6 digits) should NOT match call ID pattern
      assert.equal(isCallIdPattern('100234'), false);
      assert.equal(isCallIdPattern('John Doe'), false);
    });

    it('isNameLikeString matches names and rejects categories or numbers', () => {
      assert.equal(isNameLikeString('DOE, JOHN'), true);
      assert.equal(isNameLikeString('Smith, Jane M.'), true);
      assert.equal(isNameLikeString("O'Connor, Tim"), true);
      assert.equal(isNameLikeString('John Doe'), true);
      assert.equal(isNameLikeString('Mary-Jane Watson'), true);
      assert.equal(isNameLikeString('Carlos Alvarez'), true);

      // Dept / category codes should not match
      assert.equal(isNameLikeString('CX Voice'), false);
      assert.equal(isNameLikeString('CXI'), false);
      assert.equal(isNameLikeString('123456'), false);
      assert.equal(isNameLikeString('IVR_Call_ID'), false);
    });
  });

  describe('Value pattern fingerprint classification', () => {
    it('fingerprints empty columns', () => {
      const result = analyzeColumnValues(['', '   ', null, undefined]);
      assert.equal(result.fingerprint, 'empty');
      assert.equal(result.stats.totalCount, 4);
      assert.equal(result.stats.nullCount, 4);
      assert.equal(result.stats.nullRate, 1.0);
      assert.equal(result.stats.cardinality, 0);

      assert.equal(fingerprintColumn([]), 'empty');
    });

    it('fingerprints date-like columns (formatted and serial)', () => {
      const isoDates = ['2024-04-01', '2024-04-02', '2024-04-03', '2024-04-04'];
      assert.equal(fingerprintColumn(isoDates), 'date-like');

      const slashDates = ['04/01/2024', '04/02/2024', '04/03/2024', '04/04/2024'];
      assert.equal(fingerprintColumn(slashDates), 'date-like');

      const excelSerials = ['45383', '45384', '45385', '45386'];
      assert.equal(fingerprintColumn(excelSerials), 'date-like');

      const monthDates = ['15-Jan-2024', '16-Jan-2024', '17-Jan-2024'];
      assert.equal(fingerprintColumn(monthDates), 'date-like');
    });

    it('does NOT classify integer call counts as date-like', () => {
      const callCounts = ['0', '15', '100', '150', '200'];
      const result = analyzeColumnValues(callCounts);
      assert.notEqual(result.fingerprint, 'date-like');
      assert.equal(result.fingerprint, 'count-integer');
    });

    it('fingerprints employee-id-like columns', () => {
      const employeeIds = ['100234', '100235', '100589', '100999', '101234'];
      const result = analyzeColumnValues(employeeIds);
      assert.equal(result.fingerprint, 'employee-id-like');
      assert.equal(result.stats.minNumeric, 100234);
      assert.equal(result.stats.maxNumeric, 101234);
    });

    it('fingerprints call-id-like columns and blocks employee-id matching', () => {
      const ivrIds = [
        'IVR_20240915_9847120',
        'IVR_20240915_9847121',
        'IVR_20240915_9847122',
        'IVR_20240915_9847123',
      ];
      assert.equal(fingerprintColumn(ivrIds), 'call-id-like');

      const acssIds = [
        'Acss_Call_ID_001',
        'Acss_Call_ID_002',
        'Acss_Call_ID_003',
        'Acss_Call_ID_004',
      ];
      assert.equal(fingerprintColumn(acssIds), 'call-id-like');

      const telephonyNumericIds = [
        '202409150019284',
        '202409150019285',
        '202409150019286',
        '202409150019287',
      ];
      assert.equal(fingerprintColumn(telephonyNumericIds), 'call-id-like');
    });

    it('fingerprints hour-of-day columns', () => {
      const hours = ['0', '1', '9', '14', '22', '23'];
      assert.equal(fingerprintColumn(hours), 'hour-of-day');
    });

    it('fingerprints percent-decimal columns (values in 0.0–1.0)', () => {
      const decimals = ['0.85', '0.92', '0.77', '0.0', '1.0'];
      const result = analyzeColumnValues(decimals);
      assert.equal(result.fingerprint, 'percent-decimal');
      assert.equal(result.stats.minNumeric, 0);
      assert.equal(result.stats.maxNumeric, 1);
    });

    it('fingerprints percent-whole columns (with % or 1-100 decimal range)', () => {
      const explicitPercent = ['85%', '92%', '77.5%', '100%'];
      assert.equal(fingerprintColumn(explicitPercent), 'percent-whole');

      const numericDecimals = ['85.5', '92.3', '77.0', '88.2'];
      assert.equal(fingerprintColumn(numericDecimals), 'percent-whole');
    });

    it('fingerprints duration-seconds columns (integers and MM:SS)', () => {
      const ahtSeconds = ['320', '450', '185', '600', '540'];
      assert.equal(fingerprintColumn(ahtSeconds), 'duration-seconds');

      const formattedTimes = ['05:30', '07:15', '03:45', '00:08:20'];
      assert.equal(fingerprintColumn(formattedTimes), 'duration-seconds');
    });

    it('fingerprints count-integer columns', () => {
      const counts = ['0', '12', '150', '45', '300', '85'];
      assert.equal(fingerprintColumn(counts), 'count-integer');
    });

    it('fingerprints name-like columns (comma style and space style)', () => {
      const commaNames = [
        'DOE, JOHN',
        'SMITH, JANE',
        'ALVAREZ, CARLOS',
        "O'CONNOR, TIM",
      ];
      assert.equal(fingerprintColumn(commaNames), 'name-like');

      const spaceNames = [
        'John Doe',
        'Jane Smith',
        'Carlos Alvarez',
        'Mary-Jane Watson',
      ];
      assert.equal(fingerprintColumn(spaceNames), 'name-like');
    });

    it('fingerprints categorical-low columns', () => {
      const categories = ['CX Voice', 'CX Voice', 'CXI', 'CX Voice', 'CXI'];
      assert.equal(fingerprintColumn(categories), 'categorical-low');

      const statuses = ['Open', 'Closed', 'Pending', 'Open', 'Closed'];
      assert.equal(fingerprintColumn(statuses), 'categorical-low');
    });

    it('fingerprints free-text columns', () => {
      const comments = [
        'Customer called regarding billing discrepancy and requested fee refund due to downtime',
        'Transferred interaction to tech support tier 2 team for router provisioning and firmware update',
        'Account was suspended due to non-payment, verified customer identity and scheduled payment',
      ];
      assert.equal(fingerprintColumn(comments), 'free-text');
    });

    it('accurately computes ColumnStats on mixed data with nulls', () => {
      const mixed = ['100', '200', '', null, '300'];
      const { stats } = analyzeColumnValues(mixed);
      assert.equal(stats.totalCount, 5);
      assert.equal(stats.nullCount, 2);
      assert.equal(stats.nullRate, 0.4);
      assert.equal(stats.cardinality, 3);
      assert.equal(stats.minNumeric, 100);
      assert.equal(stats.maxNumeric, 300);
      assert.equal(stats.minStringLength, 3);
      assert.equal(stats.maxStringLength, 3);
    });
  });
});
