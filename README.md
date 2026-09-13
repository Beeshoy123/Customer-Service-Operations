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

## Core logic of the app

The system follows a simple operational flow:

1. Upload operational data from CSV/TXT/TSV files.
2. Detect the relevant columns and normalize the raw data.
3. Parse and aggregate records by agent, supervisor, OAM, date, and time period.
4. Compare results against target thresholds defined in the central metric configuration.
5. Roll values up to summary views for team and floor reporting.
6. Highlight outliers, trends, and risk areas.
7. Surface coaching insights and action-oriented recommendations.

The business logic is split across the dashboard layer so the app remains maintainable:

- config.ts holds the metric definitions and operational targets
- helpers.ts handles parsing, date normalization, searching, and aggregation
- hooks.ts manages the uploaded data lifecycle and application state
- metrics.ts derives the rolled-up KPI and trend summaries shown in the UI

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

## Why this app matters

A customer service operation is judged by a balance of three things:

1. service quality
2. speed of resolution
3. efficiency of the operation

This app brings those measures together in one place so managers can identify whether the team is performing well, slipping in quality, or creating operational stress. It is essentially a command-center dashboard for service operations performance management.

## Project structure

```text
src/
  App.tsx                          # main shell and screen orchestration
  main.tsx                         # app entry point
  components/
    menus.tsx                      # timeframe and settings controls
    shared.tsx                     # reusable charts and cards
  dashboard/
    config.ts                      # targets, labels, and default metric config
    helpers.ts                     # parsing, cleanup, aggregation, and search logic
    hooks.ts                       # state and upload pipeline
    metrics.ts                     # derived summary calculations and trend logic
  features/
    dashboard/
      index.ts                    # feature re-exports
      config.ts                   # feature config export layer
      helpers.ts                  # feature helper export layer
      hooks.ts                    # feature hook export layer
      metrics.ts                  # feature metrics export layer
  styles/
    index.css                     # global styling and layout rules
```

## Local development

```bash
npm install
npm run dev
```

## Summary

This project is a customer service operations dashboard that converts raw call-center data into a performance-management view. It is built to help teams monitor service quality, operational efficiency, and trend direction in a way that supports coaching, decision-making, and daily operational awareness.
