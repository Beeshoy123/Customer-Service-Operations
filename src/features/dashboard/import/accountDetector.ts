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
