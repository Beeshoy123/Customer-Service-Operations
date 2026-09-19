// account-profile-schema.ts
//
// The persisted "account profile" — one per account (Verizon Consumer, AT&T Business,
// Western Union, etc.) — captures every answer the setup wizard collects, so the
// wizard only ever runs once per account, not once per upload.
//
// This is the concrete shape derived from account-setup-wizard-spec.md. Read that file
// for the *why* behind each field; this file is the *what*. Any change here should stay
// consistent with that spec, and vice versa.

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

/** How a metric's raw value was obtained from the source file. */
export type DataShape =
  | 'ready-rate'   // a pre-computed rate/percentage column was found directly
  | 'raw-counts'   // raw counts found in the main sheet, computed via a formula
  | 'linked-list'; // per-event data lives in another sheet/file, needs grouping

/** Where a metric's supporting data physically lives, and what was matched. */
export interface DataLocation {
  shape: DataShape;
  /** The column header(s) that were matched, kept for audit/debugging. */
  matchedColumns: string[];
  /**
   * Only set when shape === 'linked-list'. Location varies by account (confirmed
   * during Metric 2's design) — sometimes another tab in the same workbook,
   * sometimes a separate uploaded file entirely.
   */
  linkedSource?: {
    location: 'same-workbook' | 'separate-file';
    sheetName?: string;
    agentNameColumn: string;
    intervalColumn: string;
    callIdColumn?: string;
  };
}

/** A contiguous numeric band on a rating scale (promoter/detractor bands, etc.). */
export interface ScaleBand {
  min: number;
  max: number;
}

/** How a target is derived — a flat number, or scaled dynamically by team size. */
export type TargetStyle =
  | { kind: 'flat'; value: number }
  | { kind: 'dynamic-per-agent'; multiplier: number };

// ---------------------------------------------------------------------------
// Metric 1 — Customer experience (VOC / VXS / C-Sat / ORS / NPS)
// ---------------------------------------------------------------------------

export interface CustomerExperienceConfig {
  /** Display label for this account — e.g. "C-Sat", "VOC", "CSR CSAT", "NPS". */
  label: string;
  data: DataLocation;
  /**
   * Only present when data.shape === 'raw-counts' — a ready-rate column doesn't need
   * scale/band classification, since the account's own system already computed it.
   */
  classification?: {
    calcStyle: 'csat-percentage' | 'nps';
    scale: ScaleBand;          // e.g. { min: 1, max: 5 } or { min: 0, max: 10 }
    promoterRange: ScaleBand;  // top N of the scale
    detractorRange: ScaleBand; // bottom N of the scale — captured even under CSAT%,
                               // since CSAT% only *uses* the promoter count, but the
                               // full mapping is still worth capturing up front
  };
  target: number;
}

// ---------------------------------------------------------------------------
// Metric 2 — Resolve rate / Issue resolution (IR) / Repeat rate (RR)
// ---------------------------------------------------------------------------

export interface ResolveRateFlavorConfig {
  tracked: boolean;
  /** The account's actual window, e.g. "2 hour", "1 hour", "3 day", "7 day". */
  windowLabel: string;
  data: DataLocation;
  target: number;
}

export interface ResolveRateConfig {
  shortTerm: ResolveRateFlavorConfig;
  longTerm: ResolveRateFlavorConfig;
}

// ---------------------------------------------------------------------------
// Metric 3 — Sales (Gross Adds)
// ---------------------------------------------------------------------------

export interface SalesLineItemConfig {
  tracked: boolean;
  /** Display label for this account, e.g. "Phone Lines", "GA Smartphones". */
  label: string;
  matchedColumn?: string;
  targetStyle: TargetStyle;
}

export interface SalesConfig {
  mobile: {
    smartphones: SalesLineItemConfig;
    dataLines: SalesLineItemConfig; // watches, tablets, etc. — optional, different
                                     // incentive structure than smartphones
    /** Only set if the CSV also/instead provides a combined total directly. */
    totalMobilityColumn?: string;
  };
  internet: {
    fiber: SalesLineItemConfig;
    fixedWireless: SalesLineItemConfig; // "VHI" for Verizon Consumer, a different
                                         // label for AT&T Business — same concept
    hotspot: SalesLineItemConfig;
    totalInternetColumn?: string;
  };
  /**
   * Optional integrity/gaming check (Verizon's example: cross-reference against
   * DPC). Not universal — most accounts will leave this unset entirely.
   */
  integrityCheck?: {
    crossReferenceMetric: 'dpc' | string;
  };
}

// ---------------------------------------------------------------------------
// Metric 4 — Hand-offs / Transfer rate
// ---------------------------------------------------------------------------

export interface HandoffsConfig {
  /** "Hand-offs" (Verizon) or "Transfer Rate" (general industry). */
  label: string;
  data: DataLocation;
  target: number;
}

// ---------------------------------------------------------------------------
// Metric 5 — DPC (Disconnects Per Call) — optional Verizon-style integrity check
// ---------------------------------------------------------------------------

export interface DpcConfig {
  tracked: boolean;
  data?: DataLocation;
  target?: number;
}

// ---------------------------------------------------------------------------
// AHT & Hold — basic call-weighted averages
// ---------------------------------------------------------------------------

export interface AhtHoldConfig {
  aht: { data: DataLocation; target: number };
  hold: {
    data: DataLocation;
    target: number;
    /** Only build/select the percentage variant if a specific account needs it. */
    calcStyle: 'average-time' | 'percentage-of-call-time';
  };
}

// ---------------------------------------------------------------------------
// Metric 6 — VTT / required disclosure message rate — optional
// ---------------------------------------------------------------------------

export interface VttConfig {
  tracked: boolean;
  /** The specific required message(s) for this account — can be more than one. */
  requiredMessages: Array<
    'view-together' | 'terms-and-conditions' | 'broadband-facts' | string
  >;
  data?: DataLocation;
  target?: number;
}

// ---------------------------------------------------------------------------
// Metric 7 — Credit
// ---------------------------------------------------------------------------

export interface CreditConfig {
  calcStyle: 'per-call-average' | 'total-amount' | 'frequency';
  /** "Net OCC" for Verizon's per-call-average style; "Credit" elsewhere. */
  label: string;
  data: DataLocation;
  target: number;
  /** Lower-is-better by convention — confirm per account rather than assume. */
  lowerIsBetter: boolean;
}

// ---------------------------------------------------------------------------
// NCW % — Verizon-only, optional, derived (no independent detection needed)
// ---------------------------------------------------------------------------

export interface NcwConfig {
  tracked: boolean;
  target?: number;
}

// ---------------------------------------------------------------------------
// The full account profile
// ---------------------------------------------------------------------------

export interface AccountProfile {
  /** Unique key, e.g. "verizon-consumer", "att-business", "western-union". */
  accountName: string;
  createdAt: string;
  updatedAt: string;

  customerExperience: CustomerExperienceConfig;
  resolveRate: ResolveRateConfig;
  sales: SalesConfig;
  handoffs: HandoffsConfig;
  dpc: DpcConfig;
  ahtHold: AhtHoldConfig;
  vtt: VttConfig;
  credit: CreditConfig;
  ncw: NcwConfig;
}
