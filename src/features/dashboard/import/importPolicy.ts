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
  const normalized = normalizeHeader(header);
  if (!normalized) return null;

  for (const [field, config] of Object.entries(FIELD_ALIASES)) {
    const aliases = config.aliases ?? [];
    const directMatch = aliases.some((alias: string) => normalizeHeader(alias) === normalized || compactHeader(alias) === compactHeader(header));
    if (directMatch) return field;

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
    const [first, second, third] = trimmed.split(/[\/\-]/g);
    const year = third?.length === 2 ? `20${third}` : third;
    const month = String(first.length === 4 ? first : second).padStart(2, '0');
    const day = String(first.length === 4 ? second : first).padStart(2, '0');
    if (year && month && day) return `${year}-${month}-${day}`;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
};

export const normalizeImportedValue = (field: string | null, value: unknown): string | number | null => {
  if (value === null || value === undefined) return null;

  const stringValue = String(value).trim();
  if (!stringValue) return null;

  const policy = field ? FIELD_ALIASES[field] : null;
  if (policy?.kind === 'percent') {
    const percentNumber = Number(stringValue.replace(/[%,$\s]/g, ''));
    if (!Number.isNaN(percentNumber)) return percentNumber;
  }

  if (policy?.kind === 'number') {
    const numeric = Number(stringValue.replace(/[$,%\s]/g, ''));
    if (!Number.isNaN(numeric)) return numeric;
  }

  if (policy?.kind === 'date') {
    const dateValue = convertDateLike(stringValue);
    if (dateValue) return dateValue;
  }

  const plainNumeric = Number(stringValue.replace(/[$,%\s]/g, ''));
  if (!Number.isNaN(plainNumeric) && stringValue !== '') {
    return plainNumeric;
  }

  return stringValue;
};
