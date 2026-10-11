"""
Backend aggregation logic for the dashboard's supervisor/agent rollups.

Two strict micro-average (pooled-sum) computations, per the Q2.csv data specs:

  1. Supervisor CSAT %   = Sum(VXS_Overall_Rep_Pass) / Sum(VXS_Overall_Rep_Cnt) * 100
     - Grouped by `SPV ` directly across raw interaction rows.
     - NEVER a macro-average (average of agent averages) — that skews up to
       ~10 pp when agents have unequal survey volumes.
     - Zero-survey supervisors/gracefully return 0.0 (render as "N/A").

  2. Hand-Offs (Transfers):
     A. Transfer Rate (%)            = Sum(Transfer_Flag) / Sum(CallsAnswered) * 100
     B. Avg Daily Hand-offs/Agent    = Sum(Transfer_Flag) / unique (EmployeeName, ReportDate) pairs
     - Filter FIRST by date/month range and supervisor; no cross-month fallback.
     - Total calls == 0 or no active agents -> explicit 0.0 / N/A.

Usage:
    python3 csat_handoffs_aggregation.py [path/to/Q2.csv]
"""

import sys
import pandas as pd
import numpy as np


def compute_supervisor_csat(df: pd.DataFrame, month: int = None, year: int = None) -> pd.DataFrame:
    """Strict micro-average (pooled sum) CSAT per supervisor.

    Returns DataFrame: ['SPV', 'Total_Surveys', 'Promoters', 'CSAT_Micro_%']
    """
    required_cols = ['ReportDate', 'SPV ', 'VXS_Overall_Rep_Pass', 'VXS_Overall_Rep_Cnt']
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    data = df.copy()
    data['ReportDate'] = pd.to_datetime(data['ReportDate'], errors='coerce')
    if month is not None:
        data = data[data['ReportDate'].dt.month == int(month)]
    if year is not None:
        data = data[data['ReportDate'].dt.year == int(year)]

    data['SPV '] = data['SPV '].astype(str).str.strip()
    data = data[data['SPV '].ne('') & data['SPV '].str.lower().ne('nan')]

    data['VXS_Overall_Rep_Pass'] = pd.to_numeric(data['VXS_Overall_Rep_Pass'], errors='coerce')
    data['VXS_Overall_Rep_Cnt'] = pd.to_numeric(data['VXS_Overall_Rep_Cnt'], errors='coerce')

    grouped = data.groupby('SPV ').agg(
        Total_Surveys=('VXS_Overall_Rep_Cnt', 'sum'),
        Promoters=('VXS_Overall_Rep_Pass', 'sum'),
    ).reset_index().rename(columns={'SPV ': 'SPV'})

    # Micro-average with zero-denominator guard: NaN where no surveys, then 0.0.
    grouped['CSAT_Micro_%'] = np.where(
        grouped['Total_Surveys'] > 0,
        (grouped['Promoters'] / grouped['Total_Surveys']) * 100,
        np.nan,
    )
    grouped['CSAT_Display'] = grouped['CSAT_Micro_%'].map(
        lambda v: 'N/A' if pd.isna(v) else f"{v:.2f}%"
    )
    return grouped.sort_values('CSAT_Micro_%', ascending=False, na_position='last')


def compute_handoffs_metrics(
    df: pd.DataFrame,
    start_date=None,
    end_date=None,
    month: int = None,
    year: int = None,
    supervisor: str = None,
) -> dict:
    """Hand-offs metrics. Filters raw rows FIRST, then pools sums.

    Edge cases: empty range / zero calls / no active agents -> explicit 0.0 + note,
    never numbers leaked from other months.
    """
    required_cols = ['ReportDate', 'SPV ', 'EmployeeName', 'Transfer_Flag', 'CallsAnswered']
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    data = df.copy()
    data['ReportDate'] = pd.to_datetime(data['ReportDate'], errors='coerce')
    data['Transfer_Flag'] = pd.to_numeric(data['Transfer_Flag'], errors='coerce')
    data['CallsAnswered'] = pd.to_numeric(data['CallsAnswered'], errors='coerce')
    data['SPV '] = data['SPV '].astype(str).str.strip()
    data['EmployeeName'] = data['EmployeeName'].astype(str).str.strip()
    data = data.dropna(subset=['ReportDate'])

    # --- 1. FILTER FIRST ---
    if start_date is not None:
        data = data[data['ReportDate'] >= pd.to_datetime(start_date)]
    if end_date is not None:
        data = data[data['ReportDate'] <= pd.to_datetime(end_date)]
    if month is not None:
        data = data[data['ReportDate'].dt.month == int(month)]
    if year is not None:
        data = data[data['ReportDate'].dt.year == int(year)]
    if supervisor is not None:
        data = data[data['SPV '].str.contains(str(supervisor), case=False, na=False, regex=False)]

    EMPTY_RESULT = {
        'total_calls': 0,
        'total_transfers': 0,
        'transfer_rate_pct': 0.0,
        'avg_daily_handoffs_per_agent': 0.0,
        'active_agents': 0,
        'agent_rollup': pd.DataFrame(columns=[
            'EmployeeName', 'Total_Calls', 'Total_Transfers',
            'Transfer_Rate_Pct', 'Active_Days', 'Avg_Daily_Handoffs',
        ]),
        'note': 'No qualifying rows in the selected range — returning 0.0/N-A (no cross-month fallback).',
    }

    if data.empty:
        return EMPTY_RESULT

    total_calls = float(data['CallsAnswered'].fillna(0).sum())
    total_transfers = float(data['Transfer_Flag'].fillna(0).sum())

    # --- 2A. Transfer Rate (%) micro-average ---
    transfer_rate_pct = (total_transfers / total_calls * 100) if total_calls > 0 else 0.0

    # --- 2B. Avg daily hand-offs per agent over unique (EmployeeName, ReportDate) pairs ---
    named = data[data['EmployeeName'].ne('') & data['EmployeeName'].str.lower().ne('nan')]
    work_days = named.groupby(['EmployeeName', named['ReportDate'].dt.date], sort=False).size()
    unique_agent_days = int(len(work_days))
    avg_daily_handoffs = (total_transfers / unique_agent_days) if unique_agent_days > 0 else 0.0

    # Agent-level rollup (same micro logic per agent)
    agent_grouped = (
        named.groupby('EmployeeName')
        .agg(
            Total_Calls=('CallsAnswered', lambda s: s.fillna(0).sum()),
            Total_Transfers=('Transfer_Flag', lambda s: s.fillna(0).sum()),
            Active_Days=('ReportDate', lambda s: s.dt.date.nunique()),
        )
        .reset_index()
    )
    agent_grouped['Transfer_Rate_Pct'] = np.where(
        agent_grouped['Total_Calls'] > 0,
        (agent_grouped['Total_Transfers'] / agent_grouped['Total_Calls']) * 100,
        0.0,
    )
    agent_grouped['Avg_Daily_Handoffs'] = np.where(
        agent_grouped['Active_Days'] > 0,
        agent_grouped['Total_Transfers'] / agent_grouped['Active_Days'],
        0.0,
    )
    agent_grouped = agent_grouped.sort_values('Total_Transfers', ascending=False)

    active_agents = int((agent_grouped['Total_Calls'] > 0).sum())
    if active_agents == 0:
        return {**EMPTY_RESULT, 'agent_rollup': agent_grouped}

    return {
        'total_calls': round(total_calls, 2),
        'total_transfers': round(total_transfers, 2),
        'transfer_rate_pct': round(float(transfer_rate_pct), 2),
        'avg_daily_handoffs_per_agent': round(float(avg_daily_handoffs), 3),
        'active_agents': active_agents,
        'agent_rollup': agent_grouped.round({
            'Total_Calls': 0, 'Total_Transfers': 0,
            'Transfer_Rate_Pct': 2, 'Avg_Daily_Handoffs': 3,
        }),
    }


if __name__ == '__main__':
    path = sys.argv[1] if len(sys.argv) > 1 else 'Q2.csv'
    df = pd.read_csv(path)

    print('=' * 60)
    print('SUPERVISOR CSAT — MICRO (POOLED SUM), ALL MONTHS')
    print('=' * 60)
    print(compute_supervisor_csat(df).to_string(index=False))

    print()
    print('=' * 60)
    print('HAND-OFFS — EXAMPLE: May, supervisor Shobita')
    print('=' * 60)
    res = compute_handoffs_metrics(df, month=5, supervisor='Shobita')
    for k in ('total_calls', 'total_transfers', 'transfer_rate_pct',
              'avg_daily_handoffs_per_agent', 'active_agents'):
        print(f'{k:32s}: {res[k]}')
    print(res['agent_rollup'].head(10).to_string(index=False))
