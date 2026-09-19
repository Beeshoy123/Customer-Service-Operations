import type {
  DetectedColumnMapping,
  MappingCandidate,
  ColumnMappingConfidence,
  ColumnMatchType,
} from './types';
import { analyzeColumnValues, type ColumnFingerprint } from './columnFingerprinter';
import { recallMapping } from './mappingMemory';

export type ImportFieldKind = 'text' | 'number' | 'percent' | 'date';

export type ImportFieldPolicy = {
  aliases: string[];
  kind?: ImportFieldKind;
};

export const FIELD_ALIASES: Record<string, ImportFieldPolicy> = {
  agentName: {
    aliases: ['agent name', 'employee name', 'employeename', 'rep name', 'associate name', 'emp name', 'name', 'agent', 'agentname', 'employee', 'rep'],
    kind: 'text',
  },
  supervisor: {
    aliases: ['supervisor', 'supervisor name', 'manager', 'manager 1', 'direct manager', 'team lead', 'teamlead', 'team', 'sup name', 'spv', 'spv name'],
    kind: 'text',
  },
  oam: {
    aliases: ['oam', 'oam name', 'operations manager', 'manager name', 'manager 2', 'acm name', 'team lead name', 'reporting manager'],
    kind: 'text',
  },
  date: {
    aliases: ['date', 'work date', 'report date', 'reporting date', 'service date', 'calendar date', 'day', 'transaction date', 'start date', 'startdate', 'survey date'],
    kind: 'date',
  },
  location: {
    aliases: ['location', 'site', 'site name', 'location name', 'floor', 'geo location', 'geographic location'],
    kind: 'text',
  },
  employeeId: {
    aliases: ['employee id', 'emp id', 'agent id', 'associate id', 'ccms id', 'ccms', 'id', 'employeeidentifier'],
    kind: 'text',
  },
  calls: {
    aliases: ['calls', 'call volume', 'total calls', 'calls handled', 'handled calls', 'calls answered', 'contacts', 'total contacts'],
    kind: 'number',
  },
  aht: {
    aliases: ['aht', 'avg handle time', 'average handle time', 'handle time', 'aht seconds', 'aht sec', 'avg handle', 'average handle'],
    kind: 'number',
  },
  vxs: {
    aliases: ['vxs', 'customer satisfaction', 'csat', 'satisfaction', 'overall satisfaction', 'vxs %', 'vxs overall', 'vxs overall %', 'overall c sat'],
    kind: 'percent',
  },
  resolve2hr: {
    aliases: ['resolve within 2hr', 'resolve 2hr', '2hr resolution', '2 hour resolve', '2hr', '2-hour resolve', '2 hour resolve %', 'resolve within 2 hour', 'within 2hr'],
    kind: 'percent',
  },
  resolve3d: {
    aliases: ['resolve within 3d', 'resolve 3d', '3d resolution', '3 day resolve', '3dr', '3-day resolve', '3 day resolve %', '3d resolve', 'within 3d', '3 day resolution'],
    kind: 'percent',
  },
  resolveTotalContacts: {
    aliases: [
      'resolve total contacts',
      'resolvetotalcontacts',
      'total resolved',
      'resolved contacts',
      'total resolved contacts',
      'resolved total contacts',
      'resolve contacts',
    ],
    kind: 'number',
  },
  resolveTotalContacts2hr: {
    aliases: [
      'resolve total contacts 2hr',
      '2 hour resolve contacts',
      '2hr contacts',
      'resolve2hrcontacts',
      '2-hour resolve contacts',
      '2hr contact count',
      'resolve 2hr contacts',
      'resolve_2hr_contacts',
      'resolve2hr_contacts',
    ],
    kind: 'number',
  },
  resolveTotalContacts3d: {
    aliases: [
      'resolve total contacts 3d',
      '3 day resolve contacts',
      '3dr contacts',
      'resolve3dcontacts',
      '3-day resolve contacts',
      '3d contact count',
      'resolve 3d contacts',
      'resolve_3d_contacts',
      'resolve3d_contacts',
    ],
    kind: 'number',
  },
  surveys: {
    aliases: [
      'surveys',
      'surveys answered',
      'vxs combined overall count',
      'survey count',
      'total surveys',
      'surveys count',
      'survey answered',
    ],
    kind: 'number',
  },
  promoters: {
    aliases: [
      'promoters',
      'vxs combined overall top box',
      'promoter count',
      'peromters',
      'total promoters',
      'promoter',
    ],
    kind: 'number',
  },
  handoffs: {
    aliases: [
      'handoffs',
      'net handoffs %',
      'hand offs %',
      'handoffs %',
      'handoff rate',
      'net handoffs pct',
      'handoff pct',
      'transfer rate',
      'transfer %',
    ],
    kind: 'percent',
  },
  handoffsCount: {
    aliases: [
      'handoffs count',
      'net handoffs',
      'transfer flag',
      'transferflag',
      'handoff count',
      'total handoffs',
      'transfer count',
      'transfers',
    ],
    kind: 'number',
  },
  hold: {
    aliases: [
      'hold',
      'hold time',
      'hold time avg',
      'avg hold',
      'average hold time',
      'hold sec',
      'hold seconds',
      'avg hold time',
    ],
    kind: 'number',
  },
  dpc: {
    aliases: [
      'dpc',
      'real time agent dpc',
      'agent dpc',
      'dpc rate',
      'dpc %',
      'dpc time',
      'real-time agent dpc',
    ],
    kind: 'number',
  },
  viewTogether: {
    aliases: [
      'view together',
      'view together attach',
      'view together rate',
      'viewtogether',
      'view together %',
      'view together attach %',
    ],
    kind: 'percent',
  },
  vtt: {
    aliases: [
      'vtt',
      'vtt %',
      'vtt rate',
      'vtt attach',
      'vtt attach %',
    ],
    kind: 'percent',
  },
  vttSent: {
    aliases: [
      'vtt sent',
      'view together sent',
      'vttsent',
      'viewtogethersent',
      'vtt invites sent',
    ],
    kind: 'number',
  },
  vttTransacted: {
    aliases: [
      'vtt transacted',
      'view together transacted',
      'vtttransacted',
      'viewtogethertransacted',
      'vtt transactions',
    ],
    kind: 'number',
  },
  netOcc: {
    aliases: [
      'net occ',
      'net occ per call',
      'net occupancy',
      'netocc',
      'occupancy',
      'net occ %',
    ],
    kind: 'percent',
  },
  creditFreq: {
    aliases: [
      'credit freq',
      'credit frequency',
      'creditfreq',
      'credit frequency %',
      'credit freq %',
    ],
    kind: 'percent',
  },
  phoneAdds: {
    aliases: [
      'phone adds',
      'total phone adds',
      'phones',
      'phoneadds',
      'gross adds phones',
      'phone add count',
    ],
    kind: 'number',
  },
  vhi: {
    aliases: [
      'vhi',
      'gross adds fwa',
      'fwa',
      'fixed wireless access',
      'home internet',
      'vhi adds',
      'vhi gross adds',
    ],
    kind: 'number',
  },
};

const normalizeHeader = (value: string): string =>
  `${value ?? ''}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const compactHeader = (value: string): string => normalizeHeader(value).replace(/\s+/g, '');

const HEADER_TOKEN_HINTS: Record<string, string[]> = {
  agentName: ['agent', 'employee', 'emp', 'rep', 'associate', 'name'],
  supervisor: ['supervisor', 'sup', 'spv', 'manager', 'mgr', 'lead', 'team'],
  oam: ['oam', 'operations', 'manager', 'mgr', 'acm', 'lead'],
  date: ['date', 'day', 'service', 'report', 'work', 'period'],
  location: ['location', 'site', 'geo', 'region', 'floor'],
  employeeId: ['employee', 'emp', 'agent', 'associate', 'ccms', 'id'],
  calls: ['calls', 'contacts', 'contact', 'volume'],
  aht: ['aht', 'handle', 'time'],
  vxs: ['vxs', 'csat', 'satisfaction', 'score'],
  resolve2hr: ['resolve', '2hr', 'twohour', '2hour', '2 hour'],
  resolve3d: ['resolve', '3d', '3day', 'threeday', '3 day'],
  resolveTotalContacts: ['resolve', 'resolved', 'contacts', 'contact'],
  resolveTotalContacts2hr: ['resolve2hr', '2hrcontacts', '2hrcontact'],
  resolveTotalContacts3d: ['resolve3d', '3dcontacts', '3dcontact'],
  surveys: ['survey', 'surveys'],
  promoters: ['promoter', 'promoters'],
  handoffs: ['handoff', 'handoffs'],
  handoffsCount: ['transferflag', 'handoffcount'],
  hold: ['hold'],
  dpc: ['dpc'],
  viewTogether: ['viewtogether'],
  vtt: ['vtt'],
  vttSent: ['vttsent'],
  vttTransacted: ['vtttransacted'],
  netOcc: ['netocc', 'occupancy'],
  creditFreq: ['creditfreq', 'creditfrequency'],
  phoneAdds: ['phoneadds', 'phones'],
  vhi: ['vhi', 'fwa'],
};

export type PairedCountConfig = {
  passAliases: string[];
  cntAliases: string[];
};

export type PairedCountSide = 'pass' | 'cnt';

export type PairedCountFieldTag = {
  canonicalField: string;
  side: PairedCountSide;
  taggedField: string;
};

export const PAIRED_COUNT_FIELDS: Record<string, PairedCountConfig> = {
  vxs: {
    passAliases: [
      'vxs_overall_rep_pass',
      'vxsoverallreppass',
      'vxs_pass',
      'vxspass',
      'vxs pass',
      'csat pass',
      'csat_pass',
      'csatpass',
      'rep pass',
      'overall rep pass',
      'vxs top box',
      'vxs_top_box',
    ],
    cntAliases: [
      'vxs_overall_rep_cnt',
      'vxsoverallrepcnt',
      'vxs_cnt',
      'vxscnt',
      'vxs cnt',
      'vxs count',
      'vxs_count',
      'vxscount',
      'vxs total',
      'vxs_total',
      'vxstotal',
      'csat cnt',
      'csat_cnt',
      'csatcnt',
      'csat count',
      'csat_count',
      'rep cnt',
      'overall rep cnt',
    ],
  },
  resolve2hr: {
    passAliases: [
      'resolve_2hr_pass',
      'resolve2hr_pass',
      'resolve2hrpass',
      'resolve 2hr pass',
      '2hr pass',
      '2hr_pass',
      'resolve2hrcount',
    ],
    cntAliases: [
      'resolve_2hr_cnt',
      'resolve2hr_cnt',
      'resolve2hrcnt',
      'resolve 2hr cnt',
      'resolve 2hr count',
      'resolve 2hr total',
      '2hr cnt',
      '2hr_cnt',
      '2hr total',
      'resolve2hrcontacts',
    ],
  },
  resolve3d: {
    passAliases: [
      'resolve_3d_pass',
      'resolve3d_pass',
      'resolve3dpass',
      'resolve 3d pass',
      '3d pass',
      '3d_pass',
      'resolve3daycount',
    ],
    cntAliases: [
      'resolve_3d_cnt',
      'resolve3d_cnt',
      'resolve3dcnt',
      'resolve 3d cnt',
      'resolve 3d count',
      'resolve 3d total',
      '3d cnt',
      '3d_cnt',
      '3d total',
      'resolve3dcontacts',
    ],
  },
};

const PASS_SUFFIX_PATTERN = /^(.*?)(?:[_\s\-]+pass|[_\s\-]+flag|pass|flag)$/i;
const CNT_SUFFIX_PATTERN = /^(.*?)(?:[_\s\-]+cnt|[_\s\-]+count|[_\s\-]+total|cnt|count|total)$/i;

const findCanonicalBaseField = (base: string): string | null => {
  const norm = normalizeHeader(base);
  const comp = compactHeader(base);
  if (!norm && !comp) return null;

  for (const [field, config] of Object.entries(FIELD_ALIASES)) {
    if (config.aliases.some((alias) => normalizeHeader(alias) === norm || compactHeader(alias) === comp)) {
      return field;
    }
    const hints = HEADER_TOKEN_HINTS[field] ?? [];
    if (hints.some((h) => comp.includes(compactHeader(h)))) {
      return field;
    }
  }
  return null;
};

export const findPairedCountField = (header: string): PairedCountFieldTag | null => {
  const normalized = normalizeHeader(header);
  const compact = compactHeader(header);
  if (!normalized && !compact) return null;

  // 1. Check explicit aliases in PAIRED_COUNT_FIELDS
  for (const [canonicalField, config] of Object.entries(PAIRED_COUNT_FIELDS)) {
    if (config.passAliases.some((alias) => normalizeHeader(alias) === normalized || compactHeader(alias) === compact)) {
      return {
        canonicalField,
        side: 'pass',
        taggedField: `${canonicalField}_Pass`,
      };
    }

    if (config.cntAliases.some((alias) => normalizeHeader(alias) === normalized || compactHeader(alias) === compact)) {
      return {
        canonicalField,
        side: 'cnt',
        taggedField: `${canonicalField}_Cnt`,
      };
    }
  }

  // 2. Check suffix patterns (_pass or _cnt)
  const trimmed = header.trim();
  const passMatch = PASS_SUFFIX_PATTERN.exec(trimmed);
  const cntMatch = CNT_SUFFIX_PATTERN.exec(trimmed);

  if (passMatch && passMatch[1]) {
    const base = passMatch[1].trim();
    const baseCanonical =
      Object.keys(PAIRED_COUNT_FIELDS).find((k) => k.toLowerCase() === base.toLowerCase()) ||
      findCanonicalBaseField(base);
    const canonicalField = baseCanonical || normalizeHeader(base).replace(/\s+/g, '_') || 'metric';
    return {
      canonicalField,
      side: 'pass',
      taggedField: `${canonicalField}_Pass`,
    };
  }

  if (cntMatch && cntMatch[1]) {
    const base = cntMatch[1].trim();
    const baseCanonical =
      Object.keys(PAIRED_COUNT_FIELDS).find((k) => k.toLowerCase() === base.toLowerCase()) ||
      findCanonicalBaseField(base);
    const canonicalField = baseCanonical || normalizeHeader(base).replace(/\s+/g, '_') || 'metric';
    return {
      canonicalField,
      side: 'cnt',
      taggedField: `${canonicalField}_Cnt`,
    };
  }

  return null;
};

export const findCanonicalFieldWithTag = (
  header: string,
): { canonicalField: string; side?: PairedCountSide; taggedField: string } | null => {
  const paired = findPairedCountField(header);
  if (paired) {
    return paired;
  }
  const canonical = findCanonicalField(header);
  if (canonical) {
    return { canonicalField: canonical, taggedField: canonical };
  }
  return null;
};

const STOP_WORDS = new Set([
  'of', 'the', 'for', 'in', 'by', 'per', 'and', 'is', 'a', 'an', 'to', 'with', 'overall',
]);

function computeHeaderScore(
  normalizedHeader: string,
  aliases: string[],
  originalHeader: string
): { score: number; isExact: boolean } {
  if (
    aliases.some(
      (alias) =>
        normalizeHeader(alias) === normalizedHeader ||
        compactHeader(alias) === compactHeader(originalHeader)
    )
  ) {
    return { score: 35, isExact: true };
  }

  const wordsA = normalizedHeader
    .split(/\s+/)
    .filter((w) => !STOP_WORDS.has(w) && w.length > 1);
  if (wordsA.length === 0) return { score: 0, isExact: false };

  let maxScore = 0;
  for (const alias of aliases) {
    const normAlias = normalizeHeader(alias);
    const wordsB = normAlias
      .split(/\s+/)
      .filter((w) => !STOP_WORDS.has(w) && w.length > 1);
    if (wordsB.length === 0) continue;

    let common = 0;
    for (const wa of wordsA) {
      if (wordsB.includes(wa)) {
        common++;
      } else if (wordsB.some((wb) => wb.startsWith(wa) || wa.startsWith(wb))) {
        common += 0.5;
      }
    }

    if (common > 0) {
      const overlapRatio = common / wordsB.length;
      const jaccardRatio = common / new Set([...wordsA, ...wordsB]).size;
      const combinedRatio = overlapRatio * 0.6 + jaccardRatio * 0.4;
      let s = Math.round(combinedRatio * 30);
      if (normalizedHeader.includes(normAlias) || normAlias.includes(normalizedHeader)) {
        s = Math.max(s, 22);
      }
      maxScore = Math.max(maxScore, s);
    }
  }

  return { score: Math.min(30, maxScore), isExact: false };
}

function computeFingerprintScore(
  field: string,
  fingerprint: ColumnFingerprint,
  isExactAlias: boolean
): number {
  if (
    fingerprint === 'call-id-like' ||
    fingerprint === 'hour-of-day' ||
    fingerprint === 'free-text'
  ) {
    return 0;
  }

  if (fingerprint === 'empty') {
    return isExactAlias ? 50 : 20;
  }

  if (fingerprint === 'date-like') {
    return field === 'date' ? 50 : 0;
  }

  if (fingerprint === 'employee-id-like') {
    return field === 'employeeId' ? 50 : 0;
  }

  if (fingerprint === 'name-like') {
    if (field === 'agentName' || field === 'supervisor' || field === 'oam') {
      return 50;
    }
    return 0;
  }

  if (fingerprint === 'percent-decimal' || fingerprint === 'percent-whole') {
    if (field === 'vxs' || field === 'resolve2hr' || field === 'resolve3d' || field === 'handoffs') {
      return 50;
    }
    return 0;
  }

  if (fingerprint === 'duration-seconds') {
    if (field === 'aht' || field === 'hold' || field === 'dpc') {
      return 50;
    }
    if (field === 'calls' || field === 'surveys' || field === 'promoters') {
      return 20;
    }
    return 0;
  }

  if (fingerprint === 'count-integer') {
    if (
      field === 'calls' ||
      field === 'surveys' ||
      field === 'promoters' ||
      field === 'handoffsCount' ||
      field === 'resolveTotalContacts' ||
      field === 'resolveTotalContacts2hr' ||
      field === 'resolveTotalContacts3d' ||
      field.endsWith('_Pass') ||
      field.endsWith('_Cnt')
    ) {
      return 50;
    }
    if (field === 'aht' || field === 'hold' || field === 'dpc') {
      return 30;
    }
    return 0;
  }

  if (fingerprint === 'categorical-low') {
    if (field === 'location' && isExactAlias) return 50;
    return 0;
  }

  return 0;
}

export const CANONICAL_FIELD_OPTIONS: { value: string; label: string }[] = [
  { value: 'agentName', label: 'Agent Name' },
  { value: 'employeeId', label: 'Employee ID' },
  { value: 'supervisor', label: 'Supervisor Name' },
  { value: 'oam', label: 'OAM (Operations Manager)' },
  { value: 'date', label: 'Date' },
  { value: 'calls', label: 'Call Volume' },
  { value: 'aht', label: 'Average Handle Time (AHT)' },
  { value: 'vxs', label: 'Customer Satisfaction (VXS / CSAT)' },
  { value: 'resolve2hr', label: 'Resolve 2hr %' },
  { value: 'resolve3d', label: 'Resolve 3d %' },
  { value: 'resolveTotalContacts', label: 'Resolve Total Contacts' },
  { value: 'location', label: 'Location / Site' },
  { value: 'vxs_Pass', label: 'VXS Pass Count' },
  { value: 'vxs_Cnt', label: 'VXS Total Count' },
  { value: 'resolve2hr_Pass', label: 'Resolve 2hr Pass' },
  { value: 'resolve2hr_Cnt', label: 'Resolve 2hr Count' },
  { value: 'resolve3d_Pass', label: 'Resolve 3d Pass' },
  { value: 'resolve3d_Cnt', label: 'Resolve 3d Count' },
];

/**
 * Multi-signal scoring engine for column mapping.
 * Combines header fuzzy matching (0-30 pts), value pattern fingerprint (0-50 pts),
 * and learned user memory (0-20 pts).
 */
export const scoreColumnMapping = (
  header: string,
  index = 0,
  sampleValues: (string | number | null | undefined)[] = [],
  scope?: string
): DetectedColumnMapping => {
  const normalized = normalizeHeader(header);
  const sampleStrings = sampleValues
    .map((v) => (v === null || v === undefined ? '' : String(v).trim()))
    .filter((v) => v !== '');

  const { fingerprint } = analyzeColumnValues(sampleValues);

  if (!normalized) {
    return {
      header,
      normalized: '',
      mappedField: null,
      confidence: 'none',
      isLowConfidence: false,
      matchType: 'unmapped',
      sampleValues: sampleStrings,
      index,
      fingerprint,
      candidates: [],
      score: 0,
    };
  }

  // 1. Paired count exact structural match
  const paired = findPairedCountField(header);
  if (paired && fingerprint !== 'call-id-like' && fingerprint !== 'hour-of-day') {
    const candidate: MappingCandidate = {
      field: paired.taggedField,
      score: 95,
      headerScore: 35,
      fingerprintScore: fingerprint === 'count-integer' ? 50 : (fingerprint === 'empty' ? 50 : 40),
      memoryScore: 0,
      signals: ['paired_count', 'exact_structure'],
    };
    return {
      header,
      normalized,
      mappedField: paired.taggedField,
      confidence: 'exact',
      isLowConfidence: false,
      matchType: 'paired_count',
      sampleValues: sampleStrings,
      index,
      fingerprint,
      candidates: [candidate],
      score: 95,
    };
  }

  // 2. Recall memory for this header
  const remembered = recallMapping(header, scope);

  // 3. Score all canonical fields
  const allFieldKeys = Array.from(
    new Set([
      ...CANONICAL_FIELD_OPTIONS.map((o) => o.value),
      ...Object.keys(FIELD_ALIASES),
    ])
  );

  const candidates: MappingCandidate[] = [];

  for (const field of allFieldKeys) {
    const policy = FIELD_ALIASES[field];
    const aliases = policy?.aliases ?? [];

    const { score: headerScore, isExact } = computeHeaderScore(normalized, aliases, header);
    const memoryScore = remembered?.field === field ? 20 : 0;

    // Without any header match and without any memory, fingerprint alone cannot guess a metric
    if (headerScore === 0 && memoryScore === 0) {
      continue;
    }

    const fingerprintScore = computeFingerprintScore(field, fingerprint, isExact);

    let finalFingerprintScore = fingerprintScore;
    if (fingerprint === 'call-id-like' || fingerprint === 'hour-of-day' || fingerprint === 'free-text') {
      finalFingerprintScore = 0;
    }

    const totalScore = Math.min(100, headerScore + finalFingerprintScore + memoryScore);

    const signals: string[] = [];
    if (isExact) signals.push('exact_alias');
    if (headerScore > 0) signals.push(`header:${headerScore}pts`);
    if (finalFingerprintScore > 0) signals.push(`fingerprint:${fingerprint}(${finalFingerprintScore}pts)`);
    if (memoryScore > 0) signals.push(`remembered:${memoryScore}pts`);

    if (totalScore > 0) {
      candidates.push({
        field,
        score: totalScore,
        headerScore,
        fingerprintScore: finalFingerprintScore,
        memoryScore,
        signals,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates[0];
  const topCandidates = candidates.slice(0, 3);

  // Score threshold logic:
  // - Score >= 85 -> Auto-map, Exact confidence (or 'remembered' if from memory)
  // - Score 50–84 -> Suggest, Low confidence
  // - Score < 50 -> Unmapped
  if (!top || top.score < 50) {
    return {
      header,
      normalized,
      mappedField: null,
      confidence: 'none',
      isLowConfidence: false,
      matchType: 'unmapped',
      sampleValues: sampleStrings,
      index,
      fingerprint,
      candidates: topCandidates,
      score: top?.score ?? 0,
    };
  }

  if (top.score >= 85) {
    const isRemembered = top.memoryScore > 0;
    const isExact = top.signals?.includes('exact_alias') ?? false;
    const confidence: ColumnMappingConfidence = isRemembered ? 'remembered' : 'exact';
    const matchType: ColumnMatchType = isRemembered
      ? 'remembered'
      : (isExact ? 'exact_alias' : 'scored_high');

    return {
      header,
      normalized,
      mappedField: top.field,
      confidence,
      isLowConfidence: false,
      matchType,
      sampleValues: sampleStrings,
      index,
      fingerprint,
      candidates: topCandidates,
      score: top.score,
    };
  }

  // Score 50 - 84: Suggest with low confidence
  return {
    header,
    normalized,
    mappedField: top.field,
    confidence: 'low',
    isLowConfidence: true,
    matchType: 'token_hint',
    sampleValues: sampleStrings,
    index,
    fingerprint,
    candidates: topCandidates,
    score: top.score,
  };
};

export const detectColumnMappingWithConfidence = (
  header: string,
  index = 0,
  sampleValues: (string | number | null | undefined)[] = [],
  scope?: string
): DetectedColumnMapping => {
  return scoreColumnMapping(header, index, sampleValues, scope);
};

export const findCanonicalField = (
  header: string,
  sampleValues: (string | number | null | undefined)[] = []
): string | null => {
  const paired = findPairedCountField(header);
  if (paired) {
    return paired.taggedField;
  }

  const normalized = normalizeHeader(header);
  if (!normalized) return null;

  // Direct fast-path match
  for (const [field, config] of Object.entries(FIELD_ALIASES)) {
    const aliases = config.aliases ?? [];
    const directMatch = aliases.some(
      (alias: string) => normalizeHeader(alias) === normalized || compactHeader(alias) === compactHeader(header)
    );
    if (directMatch) return field;
  }

  const scored = scoreColumnMapping(header, 0, sampleValues);
  return scored.mappedField;
};


// Excel's serial date epoch: days are counted from 1899-12-30 (not 1899-12-31)
// because Excel perpetuates the Lotus 1-2-3 leap-year-1900 bug where serial 60
// represents the fictional 1900-02-29. Serials above 60 are all one day ahead of
// what you'd get from 1899-12-31, so 1899-12-30 is the correct JS epoch to use.
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30); // 1899-12-30 UTC

// Plausible range for real-world Excel date serials:
//   1 → 1900-01-01,  60000 → 2064-03-05
// Values outside this range are rejected rather than passed to new Date() as a
// bare string, which would silently produce astronomical-year nonsense.
const EXCEL_SERIAL_MIN = 1;
const EXCEL_SERIAL_MAX = 60000;

const convertDateLike = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  // ── Excel serial number ───────────────────────────────────────────────────
  // Must be checked BEFORE the regex patterns: a bare 5-digit integer like
  // "45383" matches none of the date-format regexes and would otherwise fall
  // through to `new Date("45383")`, which JavaScript parses as the year 45383.
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const serial = Number(trimmed);
    if (serial >= EXCEL_SERIAL_MIN && serial <= EXCEL_SERIAL_MAX) {
      // Integer part = whole days; fractional part = time-of-day (ignored here).
      const days = Math.floor(serial);
      const d = new Date(EXCEL_EPOCH_MS + days * 86400000);
      return d.toISOString().slice(0, 10);
    }
    // Numeric but outside plausible serial range — do NOT pass to new Date().
    return null;
  }

  // ── Formatted date strings ────────────────────────────────────────────────
  const directMatches = [
    /^\d{4}-\d{2}-\d{2}$/,
    /^\d{2}-\d{2}-\d{4}$/,
    /^\d{2}\/\d{2}\/\d{4}$/,
    /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,
  ];

  if (directMatches.some((pattern) => pattern.test(trimmed))) {
    const parts = trimmed.split(/[\/\-]/g);
    const [first, second, third] = parts;
    const year = third?.length === 2 ? `20${third}` : third;

    if (trimmed.includes('-') && first?.length === 4) {
      const year = first;
      const month = Number(second);
      const day = Number(third);
      if (year && Number.isInteger(month) && Number.isInteger(day) && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      return null;
    }

    if (trimmed.includes('-') && first?.length !== 4) {
      const month = Number(second);
      const day = Number(first);
      if (year && Number.isInteger(month) && Number.isInteger(day) && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      return null;
    }

    const slashCandidates = [
      { month: Number(second), day: Number(first) },
      { month: Number(first), day: Number(second) },
    ];

    for (const candidate of slashCandidates) {
      if (
        year &&
        Number.isInteger(candidate.month) &&
        Number.isInteger(candidate.day) &&
        candidate.month >= 1 &&
        candidate.month <= 12 &&
        candidate.day >= 1 &&
        candidate.day <= 31
      ) {
        return `${year}-${String(candidate.month).padStart(2, '0')}-${String(candidate.day).padStart(2, '0')}`;
      }
    }

    return null;
  }

  // ── Last resort: let JS parse unrecognised string formats ─────────────────
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const normalized = parsed.toISOString().slice(0, 10);
    return normalized;
  }

  return null;
};

export const normalizeImportedValue = (field: string | null, value: unknown): string | number | null => {
  if (value === null || value === undefined) return null;

  const stringValue = String(value).trim();
  if (!stringValue) return null;

  const policy = field ? FIELD_ALIASES[field] : null;
  if (policy?.kind === 'percent') {
    const rawPercentNumber = Number(stringValue.replace(/[%,$\s]/g, ''));
    if (!Number.isNaN(rawPercentNumber)) {
      const normalizedPercent = rawPercentNumber <= 1 ? rawPercentNumber * 100 : rawPercentNumber;
      return normalizedPercent;
    }
  }

  if (policy?.kind === 'number') {
    const numeric = Number(stringValue.replace(/[$,%\s]/g, ''));
    if (!Number.isNaN(numeric)) return numeric;
  }

  if (policy?.kind === 'date') {
    const dateValue = convertDateLike(stringValue);
    return dateValue;
  }

  const plainNumeric = Number(stringValue.replace(/[$,%\s]/g, ''));
  if (!Number.isNaN(plainNumeric) && stringValue !== '') {
    return plainNumeric;
  }

  return stringValue;
};
