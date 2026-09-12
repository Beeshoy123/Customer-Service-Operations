# Dashboard Repo

A React + TypeScript + Vite operations dashboard for monitoring floor performance, supervisor trends, and AI-driven coaching insights.

## Overview

This app ingests CSV/TXT/TSV operational data, normalizes the records, and presents a multi-tab performance dashboard with:

- supervisor and agent rollups
- daily, weekly, monthly, and day-of-week views
- trend and outlier analysis
- AI-assisted reporting panels
- upload and filtering workflows

The project is structured to keep behavior stable while separating business logic, shared UI, and app orchestration.

## Tech Stack

- React 19
- TypeScript
- Vite
- CSS-based dashboard styling

## Project Structure

```text
src/
  App.tsx                  # top-level composition and app shell
  main.tsx                 # application entry point
  dashboard/
    config.ts              # metric config, defaults, targets, colors
    helpers.ts             # parsing, aggregation, scoring, and date utilities
    hooks.ts               # dashboard state and AI tool wiring
    metrics.ts             # derived metric calculations for the dashboard
  components/
    menus.tsx              # reusable timeframe and metric toggle menus
    shared.tsx             # shared cards, charts, and dashboard primitives
  styles/
    index.css              # app-level styles
```

## Local Development

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

## Notes on Architecture

- Keep business logic in the dashboard modules instead of inline in the app component.
- Prefer shared helper functions over repeated local calculations.
- Preserve a single source of truth for metrics, targets, and trend definitions.
- Keep the app-level component focused on composition and orchestration rather than raw dashboard logic.

## Data Flow

1. CSV data is uploaded from the dashboard.
2. Fields are detected and normalized in the helper layer.
3. Aggregated metrics are built from the historical data model.
4. Derived values feed the charts, roster, and AI insight panels.
5. UI controls filter or adjust the timeframe without changing the underlying dataset.

## Maintainer Guidance

When making changes:

- update the shared config before changing dashboard logic
- keep helper functions reusable and testable
- avoid duplicating metric calculations inside component files
- prefer small, focused modules over large monolithic render blocks

This project is intentionally organized for maintainability and easier future expansion without changing existing behavior.
