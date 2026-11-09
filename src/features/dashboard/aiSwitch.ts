// Master switch for every feature that sends data to an AI model
// (team/supervisor reports, action plan, correlation, day-of-week, apprentice, Ask AI).
//
// FROZEN (decision 2026-11-09): the features stay in the app, but they are switched off and
// show "under construction". Nothing from the dashboard data is sent to any AI model.
// This is a code setting on purpose, not a button, so it cannot be turned on by accident.
// Turning it on later needs a decision on HOW the AI works (local model, copy-paste of an
// anonymous brief, or a paid API) - see docs/suggestions.md, Step 4 and Decision 2.
export const AI_ENABLED = false;

export const AI_UNDER_CONSTRUCTION_TEXT =
  'Under construction: this feature is not yet developed. Nothing from your data is sent to any AI.';
