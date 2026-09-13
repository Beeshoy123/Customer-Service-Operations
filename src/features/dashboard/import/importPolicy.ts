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
  resolve2hr: ['resolve', '2hr', '2hr', 'twohour', '2hour', '2 hour'],
  resolve3d: ['resolve', '3d', '3day', 'threeday', '3 day'],
  resolveTotalContacts: ['resolve', 'resolved', 'contacts', 'contact'],
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

const tokenMatches = (header: string, hints: string[]) => {
  const compact = compactHeader(header);
  const normalized = normalizeHeader(header);
  return hints.some((hint) => {
    const key = normalizeHeader(hint).replace(/\s+/g, '');
    if (!key) return false;
    if (compact.includes(key)) return true;
    if (normalized.includes(hint)) return true;
    return key.length > 3 && compact.includes(key.slice(0, 3));
  });
};

export const findCanonicalField = (header: string): string | null => {
  const paired = findPairedCountField(header);
  if (paired) {
    return paired.taggedField;
  }

  const normalized = normalizeHeader(header);
  if (!normalized) return null;

  // 1. Direct matches for all fields first
  for (const [field, config] of Object.entries(FIELD_ALIASES)) {
    const aliases = config.aliases ?? [];
    const directMatch = aliases.some((alias: string) => normalizeHeader(alias) === normalized || compactHeader(alias) === compactHeader(header));
    if (directMatch) return field;
  }

  // 2. Token hints match
  for (const [field, config] of Object.entries(FIELD_ALIASES)) {
    const aliases = config.aliases ?? [];
    const tokenHint = HEADER_TOKEN_HINTS[field] ?? [];
    if (tokenHintsMatch(normalized, field, aliases, tokenHint)) {
      return field;
    }
  }

  for (const [field, hints] of Object.entries(HEADER_TOKEN_HINTS)) {
    if (tokenMatches(header, hints)) {
      return field;
    }
  }

  return null;
};

const tokenHintsMatch = (normalized: string, field: string, aliases: string[], hints: string[]) => {
  const compactAlias = aliases.map((alias: string) => compactHeader(alias));
  if (compactAlias.some((alias) => alias === compactHeader(normalized))) {
    return true;
  }

  if (field === 'agentName') {
    const hasName = normalized.includes('name');
    const hasAgentLike = normalized.includes('agent') || normalized.includes('employee') || normalized.includes('emp') || normalized.includes('rep') || normalized.includes('associate');
    return hasName && hasAgentLike;
  }

  if (field === 'supervisor') {
    const hasSupLike = normalized.includes('supervisor') || normalized.includes('spv') || normalized.includes('manager') || normalized.includes('mgr') || normalized.includes('lead');
    return hasSupLike;
  }

  if (field === 'employeeId') {
    const hasIdLike = normalized.includes('id') || normalized.includes('ccms') || normalized.includes('employee') || normalized.includes('emp');
    return hasIdLike;
  }

  if (field === 'resolveTotalContacts') {
    const hasResolve = normalized.includes('resolve') || normalized.includes('resolved');
    const hasContact = normalized.includes('contact');
    const isNot2hrOr3d = !normalized.includes('2hr') && !normalized.includes('3d') && !normalized.includes('2 hour') && !normalized.includes('3 day');
    return hasResolve && hasContact && isNot2hrOr3d;
  }

  return hints.some((hint) => normalized.includes(hint));
};

const convertDateLike = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

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
