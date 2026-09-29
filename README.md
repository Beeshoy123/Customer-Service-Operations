# Customer Service Operations Dashboard

## Purpose

This application is built to track and analyze customer service operations performance in a single operational dashboard. It is meant to help managers and team leads monitor daily execution, identify service-quality issues, compare team performance, and surface operational trends without needing to manually build reports from raw CSV data.

In practical terms, the app turns operational data into a management view for:

- supervisor performance tracking
- agent-level operational behavior
- customer experience health
- trend and outlier detection
- coaching and action planning
- daily, weekly, and monthly operational reviews

## What this app is for

The dashboard is designed around the realities of a customer service operation, where a manager needs to watch both service outcomes and operational efficiency at the same time. The app focuses on metrics such as:

- customer satisfaction (C-Sat)
- resolution rates (2HR, 3DR)
- call handling volume
- transfer and hand-off volume
- average handle time (AHT)
- hold time
- quality and productivity balance
- movement of phone lines, VHI, and NCW metrics

This is not a generic analytics app; it is a floor-performance and operations-monitoring tool for customer service teams.

## Core flows

1. **Import** — upload CSV / TXT / TSV / XLSX files. The import wizard detects the file type and data granularity, lets you pick the correct sheet, fingerprints columns, and maps them to metrics (with validation and a mapping memory that is reused across files).
2. **Normalize** — standardize column names, date formats, and value shapes, then group records by agent and date.
3. **Aggregate** — roll data up from agent to supervisor to OAM/manager to floor level, across daily, weekly, monthly, and day-of-week timeframes.
4. **Compare to targets** — every metric is evaluated against the thresholds defined in the central metric configuration.
5. **Explore** — eight floor tabs: Roster, Outliers, Apprentice, Analysis, Trends, Correlation (Integrity Match-ups), Burnout (Behavioral Scan), and DoW Analysis.
6. **Act** — the AI assistant (Gemini) generates team, apprentice-track, and supervisor expert reports plus chart action plans, either automatically per view or on demand via Ask AI.
7. **Persist** — view state survives reloads via `localStorage` (heavy state and view state are stored under separate keys). There is no backend: all data and business logic stay in the browser.

## Operational metric model

Each metric is treated as a performance signal tied to a target. The app uses a target-based tracking model:

- green = performing at or above expectation
- red = trending below expectation or exceeding a negative threshold
- trend = directional change compared with prior time periods

Examples of the KPI logic include:

- C-Sat should stay at or above 88
- 2HR should remain at or above 92
- hand-offs should stay near or below 10
- AHT and hold should be controlled so efficiency does not collapse quality
- phone adds and operational conversion metrics must remain balanced with demand and service quality

The app is designed to answer questions like:

- Are we meeting service quality targets?
- Are we resolving contacts quickly enough?
- Is the team trending up or down compared with prior periods?
- Which supervisors or agents need coaching or support?
- Where are operational bottlenecks happening?

## Data flow in plain English

The app reads raw operational records, standardizes the column names and date formats, and groups the data into structured records by employee and date. Then it calculates summary measures at multiple levels:

- agent level
- supervisor level
- OAM or manager level
- floor-wide summary
- time-based views like daily, weekly, monthly, and day-of-week

That allows the UI to turn raw numbers into operational stories instead of just showing a spreadsheet.

## Architecture

- **Stack** — Vite + React 19 + TypeScript, client-side only. Runtime dependencies are just `react`, `react-dom`, and `xlsx`.
- **Feature-first layout** — all dashboard domain logic lives under `src/features/dashboard/`; the app shell lives in `src/App.tsx`.
- **One context** — extracted view components read the dashboard bundle (`dashData`, `metrics`, `aiTools`, `uiState`, `uiHandlers`, …) through a single `DashboardContext`, so no view needs prop drilling.
- **`App.tsx` is thin** — it holds app state, the UI/modal reducers, and the screen composition. Everything else is extracted into checked files.
- **Type-checked leaves** — extracted components are covered by `tsc`; only the remaining shell files carry `@ts-nocheck` (they are on the retirement list in the restructure plan).

Key modules:

| Module | Responsibility |
|---|---|
| `features/dashboard/config.ts` | metric definitions, labels, targets, column definitions |
| `features/dashboard/helpers.ts` | parsing, date normalization, search, aggregation |
| `features/dashboard/hooks.ts` | uploaded-data lifecycle, context, AI tools, persistence |
| `features/dashboard/metrics.ts` | derived KPI, leader, and trend summaries |
| `features/dashboard/emptyColumns.ts` | auto-hide of empty metric columns after import |
| `features/dashboard/import/*` | import pipeline (file-type and granularity detection, sheet selection, column fingerprinting/mapping, validation, merge, worker-based workbook loading) |
| `features/dashboard/upload/*` | import landing screen |
| `features/dashboard/views/tabs/*` | the eight floor tabs |
| `features/dashboard/views/modals/MainModal.tsx` | modal shell + Ask AI content + supervisor modal |
| `features/dashboard/views/chrome/*` | TopNavbar, MainStatsRow, FloorHeader |
| `features/accountSetup/*` | account profile storage and metric detection |
| `app/*` | error boundary, upload status toast, chart action-plan modal, global dashboard styles |

## Project structure

```text
src/
  App.tsx                          # app state, reducers, and screen composition
  main.tsx                         # app entry point
  app/
    chartActionPlanModal.tsx       # AI chart action-plan modal
    dashboardStyles.ts             # injected global dashboard stylesheet
    errorBoundary.tsx              # top-level error boundary
    uploadStatus.tsx               # upload progress/status toast
  components/
    dropZone.tsx                   # drag-and-drop upload zone
    menus.tsx                      # timeframe and settings controls
    shared.tsx                     # reusable charts and cards
  features/
    accountSetup/
      account-profile-schema.ts
      account-profile-storage.ts
      metric-detection-engine.ts
    dashboard/
      config.ts                    # targets, labels, and metric config
      helpers.ts                   # parsing, cleanup, aggregation, search
      hooks.ts                     # state, context, upload pipeline, AI tools
      metrics.ts                   # derived summaries and trend logic
      emptyColumns.ts              # auto-hide empty metric columns
      import/                      # import pipeline + tests
      upload/                      # import landing screen
      views/
        chrome/                    # TopNavbar, MainStatsRow, FloorHeader
        modals/MainModal.tsx       # modal shell, Ask AI content, supervisor modal
        tabs/                      # the eight floor tabs
  styles/
    index.css                      # global styling and layout rules
    App.css
```

## Tooling

| Command | What it does |
|---|---|
| `npm run dev` | start the Vite dev server |
| `npm run build` | type-check (`tsc -b`) and produce a production build in `dist/` |
| `npm run preview` | serve the production build locally |
| `npm run lint` | run `oxlint` |
| `npm test` | run the Node test suite (`tsx --test`) |

Every change is expected to keep these green:

- `npx tsc -b` — zero type errors
- `npm run lint` — zero lint errors (warnings are tolerated; the baseline is tracked)
- `npm test` — full suite passing
- the dev server serves the app without console/transform errors

## Local development

```bash
npm install
npm run dev
```

## Why this app matters

A customer service operation is judged by a balance of three things:

1. service quality
2. speed of resolution
3. efficiency of the operation

This app brings those measures together in one place so managers can identify whether the team is performing well, slipping in quality, or creating operational stress. It is essentially a command-center dashboard for service operations performance management.

## Summary

This project is a customer service operations dashboard that converts raw call-center data into a performance-management view. It is built to help teams monitor service quality, operational efficiency, and trend direction in a way that supports coaching, decision-making, and daily operational awareness.
