// Frontend redesign: fixed left sidebar navigation replacing the floating
// pill tab bar. Navigation model (three folders, title-case labels) per the
// layout blueprint; each item drives the existing `mainTab` UI state, so all
// current tab components keep working unchanged.
import React from 'react';
import { useDashboard } from '../../hooks';
import { safeStorage, storageKeys } from '../../storage';

export type MainTabId =
  | 'roster' | 'outliers' | 'integrity'
  | 'analysis' | 'trends' | 'dow'
  | 'apprentice' | 'burnout' | 'offenders';

// `badge` is optional on purpose: nothing passes one yet, so no badge shows.
// Add one only when the app already has a real number for that page.
interface NavItem { id: MainTabId; label: string; badge?: number }
interface NavFolder { title: string; items: NavItem[] }

const NAV_MODEL: NavFolder[] = [
  {
    title: 'Floor Operations',
    items: [
      { id: 'roster',     label: 'Team Roster' },
      { id: 'outliers',   label: 'Floor Outliers / Performers' },
      { id: 'integrity',  label: 'Integrity Match Up' },
    ],
  },
  {
    title: 'Insights & Trends',
    items: [
      { id: 'analysis',   label: 'Floor Analysis' },
      { id: 'trends',     label: 'Trends' },
      { id: 'dow',        label: 'DOW (Day of Week)' },
    ],
  },
  {
    title: 'Agent Development',
    items: [
      { id: 'apprentice', label: 'Apprentice Track' },
      { id: 'burnout',    label: 'Behavioral Scan' },
      { id: 'offenders',  label: 'Chronic Offenders' },
    ],
  },
];

// Line icons drawn as inline SVG (no icon library). 24x24 grid, stroke only.
const ICON_SHAPES: Record<MainTabId, React.ReactNode> = {
  roster: (<><rect x="5" y="4" width="14" height="17" rx="2.5" /><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" /></>),
  outliers: (<><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17v.01" /></>),
  integrity: (<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r=".6" /></>),
  analysis: (<path d="M5 20V10M12 20V4M19 20v-7" />),
  trends: (<><path d="M3 17l6-6 4 4 8-9" /><path d="M15 6h6v6" /></>),
  dow: (<><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M8 3v4M16 3v4M4 10h16" /></>),
  apprentice: (<><path d="M2 9l10-5 10 5-10 5z" /><path d="M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5" /></>),
  burnout: (<path d="M3 12h4l3-7 4 14 3-7h4" />),
  offenders: (<><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>),
};

const NavIcon = ({ id }: { id: MainTabId }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
       aria-hidden="true" focusable="false">
    {ICON_SHAPES[id]}
  </svg>
);

// Narrow screens always show the slim icon pill (the full panel would cover the page).
const NARROW_QUERY = '(max-width: 1024px)';
const canMatchMedia = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = React.useState<boolean>(() => canMatchMedia() && window.matchMedia(NARROW_QUERY).matches);
  React.useEffect(() => {
    if (!canMatchMedia()) return undefined;
    const mq = window.matchMedia(NARROW_QUERY);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

// Sidebar ids → mainTab values consumed by the workspace switcher.
// 'integrity' reuses the correlation view; 'offenders' is a placeholder tab.
export const SIDEBAR_TO_TAB: Record<MainTabId, string> = {
  roster: 'roster', outliers: 'outliers', integrity: 'correlation',
  analysis: 'analysis', trends: 'trends', dow: 'dow',
  apprentice: 'apprentice', burnout: 'burnout', offenders: 'offenders',
};

// Tab values (e.g. set by cross-tab "jump to roster" links) → active sidebar id.
export const TAB_TO_SIDEBAR: Record<string, MainTabId> = Object.fromEntries(
  Object.entries(SIDEBAR_TO_TAB).map(([k, v]) => [v, k as MainTabId]),
);

const Chevron = ({ open }: { open: boolean }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
       className={`sidebar-chevron-icon${open ? ' open' : ''}`} aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
);

const ToggleArrow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 6l-6 6 6 6" />
  </svg>
);

export const SidebarNav = React.memo(() => {
  const { uiState, uiHandlers } = useDashboard();
  const activeId: MainTabId = TAB_TO_SIDEBAR[uiState.mainTab] ?? 'roster';
  const [openFolders, setOpenFolders] = React.useState<Record<string, boolean>>(
    () => Object.fromEntries(NAV_MODEL.map(f => [f.title, true])),
  );

  // Expanded/collapsed choice is remembered through the storage facade.
  const [userCollapsed, setUserCollapsed] = React.useState<boolean>(
    () => safeStorage.getItem(storageKeys.sidebarCollapsed) === 'true',
  );
  const narrow = useIsNarrow();
  const collapsed = userCollapsed || narrow;

  // Sliding glow: one mint highlight that moves to the active item (part A of
  // the animation plan). It is measured from the real button, so it follows the
  // folders opening/closing and the panel width change.
  const navRef = React.useRef<HTMLElement>(null);
  const [glow, setGlow] = React.useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const measureGlow = React.useCallback(() => {
    const nav = navRef.current;
    const item = nav?.querySelector<HTMLElement>('.sidebar-item.active');
    if (!nav || !item) { setGlow(null); return; }
    const n = nav.getBoundingClientRect();
    const r = item.getBoundingClientRect();
    const next = { x: r.left - n.left, y: r.top - n.top + nav.scrollTop, w: r.width, h: r.height };
    setGlow(g => (g && g.x === next.x && g.y === next.y && g.w === next.w && g.h === next.h ? g : next));
  }, []);
  React.useLayoutEffect(measureGlow, [measureGlow, activeId, collapsed, openFolders]);
  React.useEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measureGlow);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [measureGlow]);

  // The workspace column reads this flag from <html> (see layout.css) so it
  // slides in step with the panel without App.tsx knowing about it.
  React.useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.sidebar = collapsed ? 'collapsed' : 'expanded';
    return () => { delete root.dataset.sidebar; };
  }, [collapsed]);

  const toggleCollapsed = () => {
    const next = !userCollapsed;
    setUserCollapsed(next);
    safeStorage.setItem(storageKeys.sidebarCollapsed, String(next));
  };

  return (
    <nav ref={navRef} id="dashboard-sidebar" className={`sidebar-nav${collapsed ? ' collapsed' : ''}`} aria-label="Dashboard sections">
      {glow && (
        <span
          className="sidebar-glow"
          aria-hidden="true"
          style={{ width: glow.w, height: glow.h, transform: `translate(${glow.x}px, ${glow.y}px)` }}
        />
      )}
      <div className="sidebar-brand">
        <span className="sidebar-brand-mark" aria-hidden="true">CSO</span>
        <span className="sidebar-brand-text">Customer Service<br />Operations</span>
        {!narrow && (
          <button
            type="button"
            className="sidebar-toggle"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-controls="dashboard-sidebar"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ToggleArrow />
          </button>
        )}
      </div>

      {NAV_MODEL.map(folder => {
        const open = openFolders[folder.title];
        // Collapsed pill always lists every icon, whatever the folder state.
        const showItems = open || collapsed;
        return (
          <div key={folder.title} className={`sidebar-folder${open ? ' open' : ''}`}>
            <button
              type="button"
              className="sidebar-folder-header"
              onClick={() => setOpenFolders(s => ({ ...s, [folder.title]: !s[folder.title] }))}
              aria-expanded={open}
              tabIndex={collapsed ? -1 : undefined}
            >
              <span className="sidebar-folder-title">{folder.title}</span>
              <span className="sidebar-chevron"><Chevron open={open} /></span>
            </button>
            {showItems && (
              <ul className="sidebar-list">
                {folder.items.map(item => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`sidebar-item${activeId === item.id ? ' active' : ''}`}
                      onClick={() => uiHandlers.setMainTab(SIDEBAR_TO_TAB[item.id])}
                      aria-current={activeId === item.id ? 'page' : undefined}
                      title={collapsed ? undefined : item.label}
                      data-tip={item.label}
                    >
                      <span className="sidebar-item-icon"><NavIcon id={item.id} /></span>
                      <span className="sidebar-item-label">{item.label}</span>
                      {item.badge != null && item.badge > 0 && (
                        <span className="sidebar-badge">{item.badge}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
});
