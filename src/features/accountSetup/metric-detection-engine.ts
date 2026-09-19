// metric-detection-engine.ts
//
// Given the column headers from an uploaded file, figures out which canonical metric
// each header most likely represents — using a tiered approach, cheapest and most
// certain first. See account-setup-wizard-spec.md for the full reasoning; this file
// is the actual matching logic that reasoning turns into.
//
// Tier 1: learned-alias cache — exact header text seen and confirmed before, for any
//         account, not just the current one. This is how the app "gets smarter over
//         time" without needing an AI call on every upload.
// Tier 2: concept-similarity scoring — keyword overlap against what each metric
//         actually measures, not any one account's specific wording. This is what
//         lets a brand-new account's headers get matched without hardcoding for it.
// Tier 3: disambiguation — when multiple headers plausibly match the same concept,
//         prefer wording tied to the agent/rep specifically over the account/service
//         level as a whole (e.g. "CSR CSAT" over "Overall Support CSAT").
//
// Anything left unresolved after all three tiers is handed to the setup wizard.

export type CanonicalMetricKey =
  | 'customerExperience'
  | 'resolveShortTerm'
  | 'resolveLongTerm'
  | 'salesSmartphones'
  | 'salesDataLines'
  | 'salesFiber'
  | 'salesFixedWireless'
  | 'salesHotspot'
  | 'handoffs'
  | 'dpc'
  | 'aht'
  | 'hold'
  | 'vtt'
  | 'credit'
  | 'ncw';

/** A learned mapping from exact header text to a canonical key — grows over time. */
export type LearnedAliasCache = Record<string, CanonicalMetricKey>;

/** Keywords suggesting a header is about the agent/rep specifically, not the account. */
const AGENT_SPECIFIC_KEYWORDS = ['agent', 'rep', 'csr', 'expert'];
const ACCOUNT_LEVEL_KEYWORDS = ['account', 'overall', 'service', 'support'];

/**
 * Keyword sets describing each canonical metric's *concept* — not any one account's
 * exact wording. New accounts' vocabulary gets added here over time (or picked up
 * automatically via the learned-alias cache once confirmed once), never by hardcoding
 * a whole new account's terminology up front.
 */
const CONCEPT_KEYWORDS: Record<CanonicalMetricKey, string[]> = {
  customerExperience: ['csat', 'c-sat', 'voc', 'vxs', 'nps', 'satisfaction', 'ors', 'survey'],
  resolveShortTerm: ['resolve', 'resolution', 'repeat', 'callback', 'ir', 'rr'],
  resolveLongTerm: ['resolve', 'resolution', 'repeat', 'callback', 'ir', 'rr'],
  salesSmartphones: ['phone', 'smartphone', 'mobile', 'ga', 'gross add'],
  salesDataLines: ['watch', 'tablet', 'data line'],
  salesFiber: ['fiber'],
  salesFixedWireless: ['fwa', 'fixed wireless', 'home internet', 'vhi', 'internet air'],
  salesHotspot: ['hotspot', 'portable wifi', 'mifi'],
  handoffs: ['handoff', 'hand off', 'hand-off', 'transfer'],
  dpc: ['dpc', 'disconnect'],
  aht: ['aht', 'handle time'],
  hold: ['hold'],
  vtt: ['vtt', 'view together', 'terms and conditions', 'broadband facts', 'disclosure'],
  credit: ['credit', 'occ', 'net occ'],
  ncw: ['ncw'],
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, ' ');
}

function countKeywordMatches(headerNormalized: string, keywords: string[]): number {
  return keywords.reduce((count, kw) => (headerNormalized.includes(kw) ? count + 1 : count), 0);
}

export interface MatchCandidate {
  header: string;
  canonicalKey: CanonicalMetricKey;
  /** 'learned' = exact match to a confirmed prior mapping; 'concept' = keyword-scored guess. */
  source: 'learned' | 'concept';
  score: number;
}

export interface DetectionResult {
  /** Confident matches — one header per canonical key. */
  matched: Partial<Record<CanonicalMetricKey, MatchCandidate>>;
  /** Keys where multiple headers plausibly matched and couldn't be auto-resolved. */
  ambiguous: Partial<Record<CanonicalMetricKey, MatchCandidate[]>>;
  /** Keys with no plausible header match at all — likely not tracked by this account. */
  unmatched: CanonicalMetricKey[];
}

/**
 * Runs headers through the tiered matching pipeline and returns what's confidently
 * matched, what's ambiguous (needs the wizard's disambiguation question), and what
 * has no match at all (likely just not tracked by this account).
 */
export function detectMetrics(
  headers: string[],
  learnedAliases: LearnedAliasCache
): DetectionResult {
  const candidatesByKey = Object.fromEntries(
    (Object.keys(CONCEPT_KEYWORDS) as CanonicalMetricKey[]).map((key) => [key, [] as MatchCandidate[]])
  ) as Record<CanonicalMetricKey, MatchCandidate[]>;

  for (const rawHeader of headers) {
    const normalized = normalizeHeader(rawHeader);

    // Tier 1 — learned alias cache (exact match, free, certain — always wins)
    const learnedKey = learnedAliases[normalized];
    if (learnedKey) {
      candidatesByKey[learnedKey].push({
        header: rawHeader,
        canonicalKey: learnedKey,
        source: 'learned',
        score: Infinity,
      });
      continue;
    }

    // Tier 2 — concept-similarity scoring against every metric, keep any real hits
    for (const key of Object.keys(CONCEPT_KEYWORDS) as CanonicalMetricKey[]) {
      const score = countKeywordMatches(normalized, CONCEPT_KEYWORDS[key]);
      if (score > 0) {
        candidatesByKey[key].push({ header: rawHeader, canonicalKey: key, source: 'concept', score });
      }
    }
  }

  const matched: DetectionResult['matched'] = {};
  const ambiguous: DetectionResult['ambiguous'] = {};
  const unmatched: CanonicalMetricKey[] = [];

  for (const key of Object.keys(candidatesByKey) as CanonicalMetricKey[]) {
    const candidates = candidatesByKey[key].sort((a, b) => b.score - a.score);

    if (candidates.length === 0) {
      unmatched.push(key);
      continue;
    }
    if (candidates.length === 1) {
      matched[key] = candidates[0];
      continue;
    }

    // Multiple candidates for the same concept — try the agent-vs-account preference
    // rule before giving up and handing it to the wizard.
    const agentPreferred = preferAgentSpecific(candidates);
    if (agentPreferred) {
      matched[key] = agentPreferred;
    } else {
      ambiguous[key] = candidates;
    }
  }

  return { matched, ambiguous, unmatched };
}

/**
 * When several headers match the same concept, prefer the one whose wording ties to
 * the agent/rep specifically over the account/service level as a whole (e.g. "CSR
 * CSAT" over "Overall Support CSAT"). Returns null if the preference can't cleanly
 * resolve it — the wizard should ask instead of guessing.
 */
function preferAgentSpecific(candidates: MatchCandidate[]): MatchCandidate | null {
  const scored = candidates.map((c) => {
    const normalized = normalizeHeader(c.header);
    return {
      candidate: c,
      agentScore: countKeywordMatches(normalized, AGENT_SPECIFIC_KEYWORDS),
      accountScore: countKeywordMatches(normalized, ACCOUNT_LEVEL_KEYWORDS),
    };
  });

  const agentOnly = scored.filter((s) => s.agentScore > 0 && s.accountScore === 0);
  if (agentOnly.length === 1) return agentOnly[0].candidate;

  return null; // genuinely ambiguous — let the wizard ask
}

/**
 * Records a confirmed mapping into the learned-alias cache, so this exact header
 * text is recognized instantly on every future upload — for any account, not just
 * the one it was confirmed on.
 */
export function learnAlias(
  cache: LearnedAliasCache,
  header: string,
  canonicalKey: CanonicalMetricKey
): LearnedAliasCache {
  return { ...cache, [normalizeHeader(header)]: canonicalKey };
}
