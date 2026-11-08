// One agent-day record, built from a merged import row.
// Pure function (no React) so it can be tested on its own.

// Step 2: a missing value stays null; it is never turned into 0. Text that is not a
// number ("-", "n/a", "abc") also counts as missing. A real 0 stays 0.
export const toNumberOrNull = (value: any): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[%,$\s]/g, '');
  if (cleaned === '') return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

export const buildDayRecord = (row: any) => {
  const callsValue = toNumberOrNull(row.calls);
  const ahtValue = toNumberOrNull(row.aht);
  const vxsValue = toNumberOrNull(row.vxs);
  const resolve2hrValue = toNumberOrNull(row.resolve2hr);
  const resolve3dValue = toNumberOrNull(row.resolve3d);

  // Use the imported value when present, else fall back to calls (null if calls is null).
  const importedResolveTotal = toNumberOrNull(row.resolveTotalContacts);
  const resolveTotalContactsValue = importedResolveTotal !== null ? importedResolveTotal : callsValue;

  return {
    isOff: callsValue === 0,
    calls: callsValue,
    resolveTotalContacts: resolveTotalContactsValue,
    resolveTotalContacts2hr: toNumberOrNull(row.resolveTotalContacts2hr),
    resolveTotalContacts3d: toNumberOrNull(row.resolveTotalContacts3d),
    surveys: toNumberOrNull(row.surveys),
    promoters: toNumberOrNull(row.promoters),
    vxs: vxsValue,
    resolve3d: resolve3dValue,
    handoffs: toNumberOrNull(row.handoffs),
    handoffsCount: toNumberOrNull(row.handoffsCount),
    resolve2hr: resolve2hrValue,
    aht: ahtValue,
    hold: toNumberOrNull(row.hold),
    dpc: toNumberOrNull(row.dpc),
    viewTogether: toNumberOrNull(row.viewTogether),
    vtt: toNumberOrNull(row.vtt),
    vttSent: toNumberOrNull(row.vttSent),
    vttTransacted: toNumberOrNull(row.vttTransacted),
    netOcc: toNumberOrNull(row.netOcc),
    creditFreq: toNumberOrNull(row.creditFreq),
    phoneAdds: toNumberOrNull(row.phoneAdds),
    vhi: toNumberOrNull(row.vhi),
  };
};

const isPresent = (v: unknown) => v !== null && v !== undefined;

/**
 * Step 2: a later upload MERGES into the day that is already stored.
 * - a new value wins (newer upload is the newer fact; same value twice changes nothing)
 * - a missing value keeps what is stored (file B without calls does not erase file A's calls)
 * - the stored record is copied, never edited in place
 * - isOff is recomputed from the merged calls
 */
export const mergeDayRecord = (existing: any, row: any) => {
  const incoming: any = buildDayRecord(row);
  if (!existing) return incoming;

  const merged: any = { ...existing };
  for (const [field, value] of Object.entries(incoming)) {
    if (field === 'isOff' || field === 'resolveTotalContacts') continue;
    if (isPresent(value)) merged[field] = value;
  }

  // resolveTotalContacts: an imported value wins; otherwise it follows calls when it was
  // only ever "calls" (the fallback), and an older imported value is kept.
  if (isPresent(toNumberOrNull(row.resolveTotalContacts))) {
    merged.resolveTotalContacts = incoming.resolveTotalContacts;
  } else if (!isPresent(existing.resolveTotalContacts) || existing.resolveTotalContacts === existing.calls) {
    merged.resolveTotalContacts = isPresent(merged.calls) ? merged.calls : null;
  }

  merged.isOff = merged.calls === 0;
  return merged;
};

// An agent attribute (supervisor, oam): "Unknown" or empty from a file that has no such
// column must not overwrite a value we already know.
export const keepKnown = (existing: string | null | undefined, incoming: string): string => {
  const incomingIsKnown = !!incoming && incoming !== 'Unknown';
  if (incomingIsKnown) return incoming;
  return existing && existing !== 'Unknown' ? existing : incoming;
};
