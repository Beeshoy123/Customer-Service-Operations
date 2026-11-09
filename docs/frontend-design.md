# Revamp Design

Design preferences and ready-to-use build prompts for the Customer Service Operations dashboard.

**Repo:** `Beeshoy123/Customer-Service-Operations`
**Style reference:** Instagram reels by @code.xr, "Dashboard V22" (colors, cards) and "Glassy Dashboard V24" (expanded sidebar, greeting, stat cards).

---

## Project context (paste this at the start of every prompt)

- Stack: React 19, TypeScript, Vite, plain CSS. No UI library, no icon library, no animation library.
- Current sidebar: `src/features/dashboard/views/chrome/SidebarNav.tsx`, styled in `src/styles/layout.css`.
- App shell: `src/App.tsx`. Other styles: `src/styles/dashboard.css`, `src/styles/index.css`, `src/styles/App.css`.
- The sidebar has 3 groups and 9 pages. Each item calls `uiHandlers.setMainTab(...)`. All of this must keep working exactly as it does now.
- Rule: do not add any new dependencies. Draw icons as inline SVG.
- Rule: do not change data logic, import logic, or tests. This is a visual and layout revamp.

### Shared design tokens (approximate starting values, tune by eye)

- Page base: soft mint-grey `#E9F0EC`
- Forest green (sidebar, hero areas): `#1F4D3F`
- Mint glow (active states): `#7BE0B0`
- Peach accent: `#F6A77C`
- Pastel tints: mint `#DDF3E8`, peach `#FCE3D4`, light blue `#DCEBF7`
- Glass surface: `rgba(255,255,255,0.55)` with `backdrop-filter: blur(16px)`
- Corner radius: large, around 20 to 28px on cards, full round on the sidebar
- Shadows: soft and wide, for example `0 10px 30px rgba(31,77,63,0.10)`

---

## Recommended build order

1. Background and colors
2. Sidebar
3. Page layout
4. Cards
5. Headers and text
6. Animation (last, since it builds on the finished cards, sidebar and layout)

Review each step in the browser before moving to the next.

**Status at a glance (checked against the code 2026-11-09)**

| # | Part | Status | Still open |
|---|---|---|---|
| 1 | Background and colors | done (1a, 1b) | 19 inline colors; hard borders to soft shadows (left over from step 1) |
| 2 | Sidebar | done | search box and profile block (no data for them) |
| 3 | Page layout | done (shell, table box, compact cards) | bento tiles for the 5 chart tabs; sticky header row in the 3 other table tabs |
| 4 | Cards | done (cards only) | trend badge and sparkline (no real trend data yet, F4/F7); italic accent on stat cards |
| 5 | Headers and text | partly done (header) | italic accent on the stat cards (waits with the trend badge) |
| 6 | Animation | A and B done | C (sparkline draw-in) waits for sparklines |

---

## 1. Background and colors

**Status, split in two commits (decided 2026-11-09):**
- **1a built 2026-11-09:** shared color names in `src/styles/index.css` (prefixed `--cso-`: base, forest, forest-deep, mint, peach, three tints, shadow, canvas gradient). The page behind everything (`.analyst-dashboard`) now uses the soft mint/peach/blue gradient, fixed in place. The sidebar reads its colors from these names. Radii and glass tokens are not added yet: they arrive with step 4 (Cards), when they are first used.
- **1b built 2026-11-09:** top bar and its buttons and dropdown panels are forest; metric cards, table header and chat panel are forest-deep; the old blue accents became mint on dark parts and forest on light parts (search focus, outline button, AI button, slider). The slate utility classes (`bg-slate-800/900`, `border-slate-700/800`, `stroke-slate-800`) now paint green, so the card chips, inner tiles and gauge rings match. Inside the cards only, red and the two greys are lighter so they stay readable (red 6.6:1, slate-400 5.5:1, slate-500 4.9:1, ran). Red, amber and green status colors are unchanged. Colors only: card shape, glass, rounded corners and hover lift stay for steps 4 to 6.
- **Not recolored (inline colors in code, 19 spots):** dark text colors on light surfaces (kept on purpose), the blue loading spinners (`shared.tsx`, `MainModal.tsx`, `FloorAnalysisTab.tsx`), the crash screen (`errorBoundary.tsx`) and the dead block in `App.tsx`. Revisit with the frontend-debt item in Step 9.
- **Known old bug, visible now:** the labels "MONTH-END STRATEGY" and "DAILY EXECUTION" on the metric cards use classes that do not exist (`bg-red-900`, `text-red-300`, `bg-opacity-20`), so they show as dark text. Invisible on the old near-black card, faint on green. Part of the "undefined Tailwind-style classes" debt in Step 9.
- Hard borders to soft shadows: left for step 4 with the cards.

**Preferences**
- Use the V22 palette: mint-grey base, forest green, mint glow, peach accents.
- Soft frosted gradient behind everything, so the glass effect is visible.
- Very rounded corners throughout.
- Soft shadows instead of hard borders.

**Prompt**

```
I am revamping my React 19 + TypeScript + Vite dashboard (plain CSS, no UI or icon libraries, no new dependencies). I will upload the repo zip.

Task: Build the color and background foundation only.
- Define CSS custom properties (design tokens) in src/styles/index.css for: page base (soft mint-grey), forest green, mint glow, peach accent, pastel tints (mint, peach, light blue), glass surface, radii (large, around 20-28px), and soft shadows.
- Replace the current dark blue/slate colors across the app with these tokens.
- Add a soft, subtle multi-color gradient behind the whole app (mint, a hint of peach, a hint of light blue) so frosted glass surfaces have something to blur.
- Replace hard borders with soft shadows wherever practical.
- Do not change layout, sidebar behavior, or any logic.

Style reference: a light, airy dashboard with a pale mint-grey background, deep forest-green accents, mint-green glow on active elements, and peach highlights.

When done, list every file changed and run the build to confirm it passes.
```

---

## 2. Sidebar

**Status: built 2026-11-09** in `SidebarNav.tsx` and `layout.css`. Left out on purpose because the app has no data for them: the search box and the profile block. The number-badge prop exists but nothing passes a number yet. The folder headings still open and close when the panel is full. Colors are set on `.sidebar-nav` for now; they move to shared tokens in step 1 (Background and colors).

**Preferences**
- Collapses to icons only or expands to icons + words, using one toggle button.
- Smooth expand/collapse animation.
- Hover labels (tooltips) when collapsed.
- Remembers the collapsed/expanded choice after refresh.
- Self-drawn line icons instead of emoji, with no icon library.
- Floating style: a rounded panel with a gap from the screen edges.
- Collapsed look: slim forest-green pill with a mint glow on the active icon.
- Extras: search box at the top, number badges on items, profile block at the bottom.
- Same 9 pages and 3 groups, behaving exactly as now.

**Prompt**

```
I am revamping my React 19 + TypeScript + Vite dashboard (plain CSS, no UI or icon libraries, no new dependencies). I will upload the repo zip. The current sidebar is in src/features/dashboard/views/chrome/SidebarNav.tsx and src/styles/layout.css.

Task: Rebuild the sidebar only.
- Keep the same NAV_MODEL: 3 groups and 9 items, and keep the exports MainTabId, SIDEBAR_TO_TAB, TAB_TO_SIDEBAR and the setMainTab click behavior unchanged.
- Add a single toggle button that switches between expanded (icon + label) and collapsed (icons only, a slim rounded pill).
- Animate the width change smoothly (CSS transition). Labels fade out as it collapses.
- In collapsed mode, show a tooltip with the item's name on hover and keyboard focus.
- Save the collapsed/expanded state in localStorage and restore it on load.
- Replace the emoji icons with simple line icons drawn as inline SVG components (consistent 20px size, stroke style). No icon library.
- Make the sidebar floating: a rounded panel with a margin gap from the screen edges, full height minus the gap.
- Colors: forest-green panel, mint-green glow on the active item, white text and icons.
- Extras: a search box at the top (collapses to a search icon), optional number badges on items (support a badge prop, do not invent data), and a profile block at the bottom (collapses to an avatar circle).
- Keep it accessible: aria-expanded on the toggle, aria-current on the active item, visible focus states.
- Do not change any other component.

Style reference: a slim dark-green floating pill sidebar with a glowing mint active icon; expanded, it shows labels, group headings, a search box and a profile block.

When done, list every file changed and run the build to confirm it passes.
```

---

## 3. Page layout

**Status: built 2026-11-09 (shell, table box, compact cards). Bento tiles still open.**
- Page locked to the screen height (`100dvh`); top bar, header and both KPI cards stay put; only the tab panel scrolls. On a very short screen the workspace scrolls so the panel never shrinks below 260 px.
- Team Roster: only the table scrolls, in its own box, and its header row sticks.
- KPI cards and header made compact (all content kept): cards 496 px to 281 px, header 149 px to 108 px at 1366x768 (ran, fake data).
- Panel height now: 1366x768 = 265 px, 1920x1080 = 577 px, 1024x768 = 261 px (ran). The approved mock-up promised about 294 px at 1366x768; the real cards hold more than the mock-up showed (up to 4 gauges plus tiles), so they could not shrink to 170 px.
- Checked: `tools/e2e_page_layout.py`, 31 of 31 (3 sizes, all 9 tabs, no page scroll, no sideways overflow, sticky header).
- Still open: bento tiles for the 5 chart tabs (own mock-up first); sticky header row in Apprentice, Day of Week and Offenders (their tables sit inside clipping wrappers).

**Preferences**
- The page is locked to the screen height with no page-level scrolling.
- Only the table scrolls, inside its own panel, with a sticky header row.
- This applies to all tabs, not just Team Roster.
- Bento layout: tiles of mixed sizes fitted together on one screen.

**Prompt**

```
I am revamping my React 19 + TypeScript + Vite dashboard (plain CSS, no UI or icon libraries, no new dependencies). I will upload the repo zip. The app shell is in src/App.tsx with styles in src/styles/layout.css and src/styles/dashboard.css.

Task: Fix the page layout only.
- Lock the app to the viewport height (100vh / 100dvh) so the page itself never scrolls. The sidebar stays in place, and the main workspace fills the rest.
- In every tab (especially Team Roster), only the data table should scroll, inside its own panel (overflow: auto with min-height: 0 on the flex/grid parents). Make the table header row sticky so it stays visible while scrolling.
- Titles, filters and stat cards stay fixed at the top and never scroll away.
- Arrange the content of each tab in a bento grid: CSS Grid tiles of mixed sizes (some wide, some tall, some small) that fit on one screen. Use grid-template-areas so it is easy to adjust.
- Check the layout at 1366x768, 1920x1080 and a narrow tablet width, so nothing overflows the page.
- Do not change data logic or component behavior.

Style reference: a dashboard where all the cards fit on one screen like tiles, and long lists scroll inside their own box while the rest of the page stays put.

When done, list every file changed and run the build to confirm it passes.
```

---

## 4. Cards

**Preferences**
- Glass style: frosted, semi-transparent.
- Pastel colors with small tags (a tiny rounded label such as "Top performer" or "At risk", each in its own soft color).
- Hero cards turned into stat cards: big number, small label, small trend badge such as "+5%", and a mini line graph (sparkline), with the italic accent word.
- Soft shadows instead of hard borders.
- Very round corners.
- Hover lift: the card rises slightly on hover.

**Prompt**

```
I am revamping my React 19 + TypeScript + Vite dashboard (plain CSS, no UI or icon libraries, no new dependencies). I will upload the repo zip.

Task: Restyle all cards.
- Glass style: semi-transparent white background, backdrop-filter blur, soft wide shadow, no hard border, very large rounded corners.
- Add pastel variants (mint, peach, light blue) and a small tag component (rounded chip with soft background) that cards can use for status labels. Use the tag only where the existing data already has a meaningful status; do not invent data.
- Find my existing hero cards and convert them into stat cards: a large number, a small label, a small trend badge (for example +5%, green or peach depending on direction), and a tiny inline SVG sparkline when the data supports it. Keep using the same data and calculations.
- Hover lift: on hover, translateY(-5px) with a smooth transition and a slightly stronger shadow.
- Respect prefers-reduced-motion by disabling the lift.
- Do not change data logic.

Style reference: frosted white cards on a soft mint background, with big numbers, a small trend badge, and a tiny sparkline line; pastel mint, peach and light-blue accent cards with small tags.

When done, list every file changed and run the build to confirm it passes.
```

**Status: cards built 2026-11-09** (glass, option A chosen from the mock-up) in `MainStatsRow.tsx`, `shared.tsx` (`DonutChart`), `layout.css`, `dashboard.css`, `index.css`. Checked in Chromium on fake data (ran): both KPI cards render with no console errors, the hover lift moves 5px and does not move with reduced motion, no sideways scroll at 560px wide. Checks run later on the same code (2026-11-09, ran): `npx tsc -b` clean, `npm test` 429 of 429, `npm run lint` 0 errors (105 warnings, same as baseline), `npm run build` passes.

| Part of the prompt | Done | Notes |
|---|---|---|
| Glass card, blur, soft shadow, no hard border, 28px corners | yes | `.metric-card`; tokens `--cso-glass`, `--cso-radius-card`, `--cso-shadow-hover` |
| Pastel variants | yes | Metric tiles are mint (on target), peach (off target) or white (no value or no target) |
| Small tag component | yes | `.kpi-chip` (blue, call counts), `.kpi-pill` (peach card label, fixes the invisible "MONTH-END STRATEGY" / "DAILY EXECUTION"), `.donut-tag` ("On target" / "Off target" under each gauge) |
| Hover lift, reduced motion respected | yes | `translateY(-5px)`, only inside the no-reduced-motion block |
| Stat card: big number + small label | yes | Each tile also shows "value minus target" (for example "+8.40 vs target") |
| Trend badge (+5%) and sparkline | **no, waits** | There is no real trend data yet (always +0.00%, item X5/F4). Not invented. Comes with F4/F7 |
| Italic accent word on the stat cards | **no, waits** | Goes with the trend badge work |

- Gauge and text colors are for light cards only. Contrast measured (ran): text at least 4.8:1, rings at least 3.1:1.
- The two copied tile blocks became one `KpiTile` component (this also does part of S17; the single briefing hero is still open).

---

## 5. Headers and text

**Status: header built 2026-11-09** (`FloorHeader.tsx`, `layout.css`, new `headerInfo.ts`). Checked in Chromium on fake data: 16 of 16 checks (ran, `tools/e2e_header.py`). The stat-card italic touch waits for step 4 (Cards).

| Part | What it does now | Notes |
|---|---|---|
| Greeting | "Good morning / afternoon / evening" by the browser clock (12:00 and 18:00 switch) + today's date, day first ("Monday 9 November 2026") | `getGreeting`, `formatToday` |
| Italic accent | Title is "Team A *Floor*": the word "Floor" in italic Georgia serif (system font, nothing to download) | The meaning does not depend on italic. "Smoothly" or "today" were not used: one is a claim the data does not prove, the other is wrong in monthly view |
| "N agents need attention" | Count of Chronic Offenders (a KPI missed 3+ months in a row, same rule as that tab). Hidden when there is no data, fewer than 3 months, or nobody qualifies (never "0 agents") | Revisit when the two offender systems merge (X6). 3,000 agents x 12 months: chip shows 300, page loads in about 1 s (ran) |
| Header card | Glass look from section 4's list (white 62%, blur 16px, 24px corners, soft shadow), left-aligned | Date arrows and search unchanged |


**Preferences**
- Greeting header, for example "Good afternoon" with today's date and a line such as "3 agents need attention".
- Italic accent word in headlines: one word set in a curly italic serif for a premium feel (for example "Your floor is running *smoothly*").
- Stat cards use the same italic touch.

**Prompt**

```
I am revamping my React 19 + TypeScript + Vite dashboard (plain CSS, no UI or icon libraries, no new dependencies). I will upload the repo zip.

Task: Add the greeting header and the italic accent typography.
- Add a greeting header at the top of the main workspace: "Good morning / afternoon / evening" based on the current time, today's date, and a one-line summary such as "N agents need attention". Compute N from existing data only (for example the outliers or chronic offenders already calculated in the app). If the data is not available on a tab, show only the greeting and date.
- Use an italic accent word in headlines: set one word in a curly italic serif font (use a system serif stack such as "Georgia, 'Times New Roman', serif" in italic; no web-font dependency) while the rest stays in the normal sans-serif.
- Apply the same italic accent to the main headline of the stat cards.
- Keep headings readable and accessible (do not rely on italic alone to convey meaning).
- Do not change any data logic.

Style reference: a headline like "Work's always *better* together" or "Your studio is on a *roll* this week", with the italic word in a soft serif, above a small grey subtitle.

When done, list every file changed and run the build to confirm it passes.
```

---

## 6. Animation

All animation uses plain CSS and small bits of React. No animation library.

**Status (2026-11-09):** parts A and B are built and browser-tested on fake data (15 of 15 checks, ran). Re-checked after the glass cards and the new header landed: still 15 of 15, no animation left running, and the 5px hover lift still works after the entrance (ran). Part C waits for sparklines.

| Part | What | Where | Status |
|---|---|---|---|
| A | Two KPI cards and the tab panel rise in (14px, 60ms apart, 0.42s) | `layout.css` (`cso-rise`) | done |
| A | Tab switch: new panel fades in with an 8px rise (0.28s); `key={mainTab}` replays it | `layout.css` (`cso-tab-in`), `App.tsx` | done |
| A | One mint glow slides to the active sidebar item; follows folder open/close and panel collapse | `SidebarNav.tsx`, `layout.css` (`.sidebar-glow`) | done |
| B | Numbers count up over 800ms (ease-out); new value takes over from the number on screen | `views/chrome/CountUp.tsx`, `MainStatsRow.tsx` | done |
| C | Sparkline line draws itself in (900ms, `stroke-dashoffset`) | none yet | parked until sparklines exist (F4/F7) |

**Rules that hold**
- All motion sits inside `@media (prefers-reduced-motion: no-preference)`; `CountUp` also shows the final number at once when reduced motion is on or `matchMedia` is missing.
- Only `transform` and `opacity` animate (the glow also eases width and height).
- The entrance uses fill-mode `backwards`, so the end state never blocks the card hover lift.
- Sidebar expand/collapse (step 2) and the card hover lift (step 4) were built earlier.

**Prompt for part C (use when sparklines exist)**

```
React 19 + TypeScript + Vite dashboard, plain CSS, no new dependencies. Parts A and B of docs/frontend-design.md section 6 are done.

Task: animate the inline SVG sparklines only. The line draws itself in over about 900ms by animating stroke-dashoffset (set stroke-dasharray from the path length). Wrap it in @media (prefers-reduced-motion: no-preference). Do not change data logic or component behavior.

Run tsc -b, npm test, npm run lint and npm run build before committing to main.
```
