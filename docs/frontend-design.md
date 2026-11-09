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

---

## 1. Background and colors

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

---

## 5. Headers and text

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

**Preferences**
- Sidebar expand/collapse is smooth, with labels fading out (built in step 2).
- Cards lift slightly on hover (built in step 4).
- Entrance animation: cards fade and slide up when a tab opens, one after another (staggered).
- Number count-up: stat numbers tick up to their value.
- Sparkline draw: the mini graph lines draw themselves in.
- Smooth tab switching: content fades between pages.
- Glow transition: the mint glow eases onto the active sidebar icon instead of snapping.
- Everything is switched off for people who have reduced motion turned on in their device settings.

**Prompt**

```
I am revamping my React 19 + TypeScript + Vite dashboard (plain CSS, no UI or icon libraries, no animation libraries, no new dependencies). I will upload the repo zip. The sidebar, glass cards and stat cards are already restyled.

Task: Add the animation layer only.
- Entrance animation: when a tab opens, its cards fade in and slide up about 12-16px, staggered by roughly 60ms each (use a CSS variable like --i for the index). Keep each animation under 500ms.
- Number count-up: build a small reusable React hook/component (for example useCountUp) that animates stat numbers from 0 to their value over about 800ms using requestAnimationFrame with an ease-out curve. It must handle decimals, percentages and currency formatting, and must show the final value immediately if the value changes rapidly or the user prefers reduced motion.
- Sparkline draw: for the inline SVG sparklines, animate stroke-dashoffset so the line draws itself in over about 900ms.
- Tab switching: fade (and a tiny slide) the workspace content when the active tab changes, without remounting heavy components unnecessarily and without any layout jump.
- Glow transition: the mint glow on the active sidebar icon should ease between items (transition on background, box-shadow and transform) instead of snapping.
- Wrap all motion in @media (prefers-reduced-motion: no-preference) so it is disabled for people who prefer reduced motion.
- Only animate transform and opacity where possible, for smooth performance.
- Do not change data logic or component behavior.

Style reference: a polished dashboard where cards float in one after another, numbers tick up, small graph lines draw themselves, and the active menu glow slides smoothly between items.

When done, list every file changed and run the build to confirm it passes.
```
