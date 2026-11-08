# CLAUDE.md: Customer-Service-Operations

Vite + React + TypeScript call-center metrics dashboard. Imports Excel/CSV (300K+ rows, Excel serial dates) in a Web Worker, merges by agent + date, shows floor/supervisor/agent views.

**The plan lives in `docs/suggestions.md`.** Read it first. It has the audit, the 10-step checklist and the full rules. Tick a step's `[ ]` box in the same commit that finishes it.

The owner (Beeshoy) is a call-center team leader and a **beginner at coding**.

## Talk to him
- Brief and direct. Tables and small diagrams instead of paragraphs. Visual first, then a few lines of explanation.
- One idea at a time. Plain words; explain jargon once. When teaching, end with one small practice question.
- Numbers, not adjectives. Mark claims **ran** (executed) or **read** (code only). Admit mistakes plainly.
- Before proposing new work, give honest feedback on what already exists.

## Change the code
1. **Propose first and wait for his OK.** One checklist step at a time. No unsolicited changes.
2. Confirm data and math first. Test with real-scale data in a real browser, not only mocks.
3. Edit existing code. Do not rebuild.
4. UI: dark theme with color-coding. Show an HTML mock-up and get confirmation before building any design.
5. Mapping and alias fixes go **only** in `src/features/dashboard/import/importPolicy.ts`.
6. Before every commit run: `npx tsc -b`, `npm test`, `npm run lint`, `npm run build`. Baseline 2026-11-08: tsc clean, 274/274 tests pass.
7. **Commit straight to `main`. No branches, no pull requests.** One commit per step.

## Safety: this repo is PUBLIC
- Never commit real agent data (no CSV/XLSX/XLS, no real names or IDs, no screenshots of real data). Fake names only.
- Never commit secrets or tokens. Never ask him to paste a token into a chat.
- No employer name or account details in the repo.
- Agent-level data stays on his PC: no cloud upload; AI calls off by default.
- If `git push` fails, attach the repo with push access and tell him plainly.

## Traps already found
- Count columns must stay counts (do not divide by row count).
- Merge by agent + date only. Do not put supervisor or location in the merge key.
- Missing is not 0. Keep it null.
- His timezone is Africa/Cairo: `Sep 2026` must not become Aug 31. DD/MM dates are normal for him.
- Never invent numbers.
