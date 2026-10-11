"""
Senior-analyst inspection of resolve/repeat metric structure in Q2.csv.

Usage:
    python3 inspect_resolve_metrics.py [path/to/Q2.csv]   # defaults to ./Q2.csv

Answers three questions:
  1. dtype + non-null counts for the five key columns.
  2. Distribution of Resolve_3Day_Count conditional on CallsAnswered (esp. = 1).
  3. Whether Resolve_3Day_Count encodes REPEATS (1 = failure) or RESOLUTIONS (1 = success).
"""

import sys
import pandas as pd

CSV_PATH = sys.argv[1] if len(sys.argv) > 1 else "Q2.csv"

KEY_COLS = [
    "CallsAnswered",
    "Resolve_Total_Contacts",
    "Resolve_Same_Day_Count",
    "Resolve_3Day_Count",
    "RECOVERYKEY",
]

df = pd.read_csv(CSV_PATH)

missing = [c for c in KEY_COLS if c not in df.columns]
if missing:
    print(f"!! Columns not found: {missing}")
    print(f"Available columns: {list(df.columns)}")
    sys.exit(1)

# ---------------------------------------------------------------- 1
print("=" * 70)
print("1. DATA TYPES & NON-NULL COUNTS")
print("=" * 70)
info = pd.DataFrame({
    "dtype": df[KEY_COLS].dtypes,
    "non_null": df[KEY_COLS].notna().sum(),
    "null": df[KEY_COLS].isna().sum(),
    "total_rows": len(df),
})
info["pct_non_null"] = (info["non_null"] / info["total_rows"] * 100).round(1).astype(str) + "%"
print(info.to_string())

# NaN-vs-zero sanity: are blanks truly NaN or zero-filled?
for col in ["Resolve_Same_Day_Count", "Resolve_3Day_Count"]:
    vals = pd.to_numeric(df[col], errors="coerce")
    print(f"\n{col}: unique values -> {sorted(vals.dropna().unique().tolist())[:15]}")

# ---------------------------------------------------------------- 2
print("\n" + "=" * 70)
print("2. Resolve_3Day_Count DISTRIBUTION CONDITIONAL ON CallsAnswered")
print("=" * 70)
calls = pd.to_numeric(df["CallsAnswered"], errors="coerce")
r3 = pd.to_numeric(df["Resolve_3Day_Count"], errors="coerce")

# Build the table manually: counts per value + NaN count, then row proportions.
counts = pd.crosstab(calls, r3, dropna=False)          # NaN becomes its own column
counts.columns = [f"r3={v}" if pd.notna(v) else "r3=NaN" for v in counts.columns]
props = pd.crosstab(calls, r3, normalize="index", dropna=False) * 100
props.columns = [f"{c}%" if pd.notna(c) else "NaN%" for c in props.columns]

summary = counts.join(props.round(1)).rename_axis("CallsAnswered").reset_index()
print(summary.to_string(index=False))

one_call = calls == 1
if one_call.any():
    sub = r3[one_call]
    n = len(sub)
    print(f"\n>>> When CallsAnswered == 1 (n={n}):")
    for v in sorted(sub.dropna().unique()):
        print(f"    Resolve_3Day_Count == {v}: {(sub == v).sum()} rows ({(sub == v).mean()*100:.1f}%)")
    print(f"    NaN:                 {sub.isna().sum()} rows ({sub.isna().mean()*100:.1f}%)")

# ---------------------------------------------------------------- 3
print("\n" + "=" * 70)
print("3. SEMANTICS TEST — does Resolve_3Day_Count mean REPEAT (failure) or RESOLVED (success)?")
print("=" * 70)

tot = pd.to_numeric(df["Resolve_Total_Contacts"], errors="coerce")
sd = pd.to_numeric(df["Resolve_Same_Day_Count"], errors="coerce")

# Test A: identity Total = SameDay + 3Day (+ beyond-3day)? If 3Day is a *count of contacts*,
# it should add up with the other contact-count columns rather than behave like a rate.
resid = tot - sd - r3
print(f"A. Total - SameDay - 3Day residual: median={resid.median()}, "
      f"min={resid.min()}, max={resid.max()}, "
      f"share exactly 0: {(resid == 0).mean()*100:.1f}%")

# Test B: single-contact calls. One call cannot produce a repeat AND a same-day resolution
# simultaneously; whichever column is ~always 0 when Total_Contacts==1 tells us it counts
# the complementary event.
single = tot == 1
if single.any():
    print(f"B. Rows where Resolve_Total_Contacts == 1 (n={single.sum()}):")
    print(f"     mean Resolve_Same_Day_Count = {sd[single].mean():.3f}")
    print(f"     mean Resolve_3Day_Count     = {r3[single].mean():.3f}")

# Test C: correlation with volume. Repeat/failure counts scale with contacts handled;
# so do resolution counts — disambiguate via SameDay complementarity instead:
pair = pd.DataFrame({"sd": sd, "r3": r3}).dropna()
both_positive = ((pair.sd > 0) & (pair.r3 > 0)).mean()
print(f"C. Rows with BOTH SameDay>0 and 3Day>0: {both_positive*100:.1f}% "
      "(near 0% => the two columns partition the same population, i.e. both count SUCCESS)")

# Test D: monotonicity vs total contacts.
grp = df.assign(tot=tot, r3=r3).dropna(subset=["tot", "r3"]).groupby("tot")["r3"].mean()
print("D. Mean Resolve_3Day_Count by Resolve_Total_Contacts:")
print(grp.head(8).round(3).to_string())

print("""
HOW TO READ THE VERDICT
  * If (A) residuals cluster at 0 and (C) shows near-mutual-exclusivity with Same-Day,
    Resolve_3Day_Count is a SUCCESS-side bucketed count (resolved within 3 days but not
    same-day) -> 1 means RESOLVED.
  * If instead 3Day rises monotonically with Total_Contacts while SameDay stays flat, and
    single-contact rows show r3>0 alongside sd>0, treat it as a REPEAT/failure count ->
    1 means NOT resolved within 3 days.
  * NaN pattern from section 2 is decisive too: NaN only where no contact was made
    (CallsAnswered==0/blank) implies 'no measurable outcome' rather than 'zero repeats'.
""")
