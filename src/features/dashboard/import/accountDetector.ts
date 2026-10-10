// accountDetector.ts — auto-detect which saved account an import belongs to,
// so the upload screen never has to ask "which account?" up front.
//
// Strategy (data-driven, cheap): for every saved account profile, count how
// many of its remembered metric columns (matchedColumns captured by the
// ImportPreviewModal wizard at setup time) actually appear as headers in the
// scanned workbook(s). The account with the strongest overlap wins.
//
// Confidence rules:
//   - need at least 2 distinct matched-column hits; and
//   - the winner must be strictly ahead of the runner-up (no ties).
// Otherwise we return null and the caller falls back to asking the user —
// surfaced inside the existing mapping wizard, not on the drop zone.
//
// Matching is deliberately loose (case-insensitive substring both ways) since
// remembered headers are normalized snapshots of real column names like
// "AHT" vs "Avg Handle Time (Sec)".

import { listAccountNames, loadAccountProfile } from '../../accountSetup/account-profile-storage';

type ProfileLike = {
  accountName?: string;
  [sectionKey: string]: unknown;
};

const collectMatchedColumns = (profile: ProfileLike | null): string[] => {
  if (!profile || typeof profile !== 'object') return [];
  const found = new Set<string>();
  for (const value of Object.values(profile)) {
    const data = (value as { data?: { matchedColumns?: unknown } })?.data;
    const cols = data?.matchedColumns;
    if (Array.isArray(cols)) {
      for (const col of cols) {
        if (typeof col === 'string' && col.trim().length >= 3) found.add(col.trim().toLowerCase());
      }
    }
  }
  return Array.from(found);
};

const headerMatchesColumn = (header: string, column: string): boolean =>
  header === column || header.includes(column) || column.includes(header);

// Account aliases: shorthand tokens that appear in workbook file/sheet names
// and cell text. "VZ" is the common internal shorthand for Verizon — files
// containing it belong to the "Verizon Consumer" account unless the name also
// mentions "fios" (then it's the Fios account). Matching uses word boundaries
// so "VZ" never fires inside words like "revize" or "KVZone".
type AliasRule = { token: RegExp; account: string };

const ACCOUNT_ALIASES: AliasRule[] = [
  { token: /\bfios\b/, account: 'verizon fios' },
  { token: /\bvz\b/, account: 'verizon consumer' },
];

/**
 * Returns a saved account name when one of the scanned names contains a known
 * alias token (e.g. "VZ" → Verizon Consumer), or null if nothing matches.
 * Only ever returns an account that actually exists among saved accounts.
 */
export function detectAccountFromAliases(
  names: Array<string | null | undefined>,
  savedAccounts: string[],
): string | null {
  const raw = (names || []).filter(
    (name): name is string => typeof name === 'string' && name.trim().length > 0,
  );
  if (raw.length === 0) return null;
  // Two haystack layers:
  //  - lower: plain lowercase text (matches \bvz\b inside snake/kebab names)
  //  - sep:   non-alphanumerics collapsed to spaces, so file names like
  //           "VZ_Operations_Q3.csv" expose the token "vz" to word boundaries.
  const lower = raw.map((name) => name.toLowerCase());
  const sep = lower.map((name) => name.replace(/[^a-z0-9]+/g, ' ').trim());

  // More specific aliases win first (fios beats generic VZ).
  for (const rule of ACCOUNT_ALIASES) {
    const hit = lower.some((t) => rule.token.test(t)) || sep.some((t) => rule.token.test(t));
    if (!hit) continue;
    const match = savedAccounts.find(
      (account) => account.trim().toLowerCase() === rule.account,
    );
    if (match) return match;
  }
  return null;
}

/**
 * Alias-aware variant of detectAccountFromData: tries the cheap alias tokens
 * first (file/sheet names and sampled cell text — e.g. a workbook full of "VZ"
 * rows belongs to Verizon Consumer), then falls back to the matched-column
 * fingerprint scoring used by plain auto-detection.
 */
export function detectAccountWithAliases(
  names: Array<string | null | undefined>,
  options: { savedAccounts?: string[] } = {},
): string | null {
  const saved = options.savedAccounts ?? listAccountNames();
  const aliasHit = detectAccountFromAliases(names, saved);
  if (aliasHit) return aliasHit;
  return detectAccountFromData(names);
}

/**
 * Returns the best-matching saved account name for the given file/sheet names,
 * or null when no confident match exists.
 */
export function detectAccountFromData(names: Array<string | null | undefined>): string | null {
  const haystacks = (names || [])
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
    .map((name) => name.toLowerCase());
  if (haystacks.length === 0) return null;

  let bestName: string | null = null;
  let bestScore = 0;
  let runnerUpScore = 0;

  for (const accountName of listAccountNames()) {
    const columns = collectMatchedColumns(loadAccountProfile(accountName) as ProfileLike | null);
    if (columns.length === 0) continue;
    let score = 0;
    for (const column of columns) {
      if (haystacks.some((haystack) => headerMatchesColumn(haystack, column))) score += 1;
    }
    if (score > bestScore) {
      runnerUpScore = bestScore;
      bestScore = score;
      bestName = accountName;
    } else if (score > runnerUpScore) {
      runnerUpScore = score;
    }
  }

  if (!bestName || bestScore < 2) return null;
  if (bestScore <= runnerUpScore) return null; // ambiguous — let the wizard ask
  return bestName;
}
