# Dashboard Improvement To-Do List

## Priority 1 — Critical stability and correctness

### App reliability

- [ ] Hardcoded OAM names for phase detection
- [ ] searchedOams computed 3x in 3 different components
- [ ] supAgentsList/liveSupObj computed in modal render body

### Data safety and persistence

- [ ] No backend — all business logic and data storage runs client-side
- [ ] No environment/config separation
- [ ] Business logic is tightly coupled to React hooks

### Existing code cleanup already completed

- [x] Memoize getAgentDataForTimeframe
- [x] Extract agentMatchesSearch to top-level
- [x] Fix double calculateTrend call in supervisorStats
- [x] Remove dead code: LEADERSHIP_DATA and apiKey
- [x] Guard AI auto-triggers + reset on re-upload
- [x] React.memo on always-mounted components
- [x] Stable uiState and uiHandlers references
- [x] searchQuery parsed 12 times per render
- [x] agents.filter(agentMatchesSearch) ran 6+ times per render
- [x] closeModal fired 14 sequential setState calls
- [x] 12 UI display states → one useReducer
- [x] SupervisorModalContent ran 8 filter/sort ops in render body
- [x] FloorApprenticeTab filtered agents directly in render body
- [x] days array defined twice inside hook body
- [x] colors array defined inside runChartData useMemo
- [x] 6 components received all 5 prop bundles — prop drilling
- [x] Add drag-to-upload zone
- [x] new Date() constructed inside agentDataCache loop per date per agent

## Priority 2 — Architecture and maintainability

- [x] AI calls have no resilience layer — no timeout, retry, or abort
- [ ] 41 inline style={{}} objects in JSX
- [ ] 47 inline arrow functions in JSX event handlers create new references every render
- [ ] DASHBOARD_STYLES re-injected via dangerouslySetInnerHTML every render
- [ ] MTD and Daily metric cards duplicate ~80 lines of identical JSX logic
- [ ] Inline conditional className chains reduce code readability without using a utility like clsx
- [ ] 8 of the most important navigation destinations are hidden behind one unlabeled icon button

## Priority 3 — UX and accessibility

- [ ] Emoji used as the entire icon system — unprofessional and inaccessible
- [ ] Hover-to-reveal opacity buttons in TopNavbar fail basic accessibility and touch-device standards
- [ ] Red used as a neutral accent label color, conflicting with its universal 'error/danger' meaning
- [ ] Search input has no visible indication of its comma-separated multi-value syntax beyond placeholder text
- [ ] No visible upload/empty state guidance for first-time users
- [ ] Inconsistent button affordance — some primary actions are pill-shaped icon buttons, others are labeled rectangular buttons
- [ ] No skeleton/loading state for the initial metric cards before data resolves

## Priority 4 — Performance and optimization

- [ ] DASHBOARD_STYLES is defined inside the App component render tree
- [ ] supBurnoutList filtered raw inside a JSX IIFE on every supervisor modal render
- [ ] COL_DEFINITIONS.filter/map called 14 times in render paths
- [ ] Object.keys(uiState.visibleCols) called 4 times inline in FloorRosterTab render body
- [ ] 2 leaked setTimeouts on upload status — no cleanup if component unmounts
- [ ] getWeekNumber called repeatedly on the same date strings with no caching
- [ ] runChartData builds date set by iterating all historicalData values on every recalculation
- [ ] No skeleton/loading state for the initial metric cards before data resolves

## Notes

This prioritized version keeps the highest-risk reliability items first, followed by architecture and maintainability, then UX/accessibility, and finally optimization cleanup.

## Working rule

- [ ] If a task is fixed or intentionally accepted, remove it from the active backlog immediately.
- [ ] Keep only open, actionable issues in the main to-do list.
- [ ] Historical completed work should live in commit history or a separate archive, not in the active list.
- [ ] Revisit the backlog after each cleanup pass and delete stale solved items.

This rule keeps the list focused on what still needs work instead of accumulating items that were already resolved.
