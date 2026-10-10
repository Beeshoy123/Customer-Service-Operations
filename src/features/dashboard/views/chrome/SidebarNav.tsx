// Frontend redesign: fixed left sidebar navigation replacing the floating
// pill tab bar. Navigation model (three folders, title-case labels) per the
// layout blueprint; each item drives the existing `mainTab` UI state, so all
// current tab components keep working unchanged.
import React from 'react';
import { useDashboard } from '../../hooks';

export type MainTabId =
  | 'roster' | 'outliers' | 'integrity'
  | 'analysis' | 'trends' | 'dow'
  | 'apprentice' | 'burnout' | 'offenders';

interface NavItem { id: MainTabId; label: string; icon: string }
interface NavFolder { title: string; items: NavItem[] }

const NAV_MODEL: NavFolder[] = [
  {
    title: 'Floor Operations',
    items: [
      { id: 'roster',     label: 'Team Roster',             icon: '📋' },
      { id: 'outliers',   label: 'Floor Outliers / Performers', icon: '⚠️' },
      { id: 'integrity',  label: 'Integrity Match Up',      icon: '🎯' },
    ],
  },
  {
    title: 'Insights & Trends',
    items: [
      { id: 'analysis',   label: 'Floor Analysis', icon: '🤖' },
      { id: 'trends',     label: 'Trends',         icon: '📈' },
      { id: 'dow',        label: 'DOW (Day of Week)', icon: '📅' },
    ],
  },
  {
    title: 'Agent Development',
    items: [
      { id: 'apprentice', label: 'Apprentice Track',   icon: '🎓' },
      { id: 'burnout',    label: 'Behavioral Scan',    icon: '🧠' },
      { id: 'offenders',  label: 'Chronic Offenders',  icon: '🚫' },
    ],
  },
];

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
       style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s ease' }}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export const SidebarNav = React.memo(() => {
  const { uiState, uiHandlers } = useDashboard();
  const activeId: MainTabId = TAB_TO_SIDEBAR[uiState.mainTab] ?? 'roster';
  const [openFolders, setOpenFolders] = React.useState<Record<string, boolean>>(
    () => Object.fromEntries(NAV_MODEL.map(f => [f.title, true])),
  );

  return (
    <nav className="sidebar-nav" aria-label="Dashboard sections">
      <div className="sidebar-brand">
        <span className="sidebar-brand-mark" aria-hidden="true">CSO</span>
        <span className="sidebar-brand-text">Customer Service<br />Operations</span>
      </div>

      {NAV_MODEL.map(folder => {
        const open = openFolders[folder.title];
        return (
          <div key={folder.title} className={`sidebar-folder${open ? ' open' : ''}`}>
            <button
              type="button"
              className="sidebar-folder-header"
              onClick={() => setOpenFolders(s => ({ ...s, [folder.title]: !s[folder.title] }))}
              aria-expanded={open}
            >
              <span className="sidebar-chevron"><Chevron open={open} /></span>
              <span className="sidebar-folder-title">{folder.title}</span>
            </button>
            {open && (
              <ul className="sidebar-list">
                {folder.items.map(item => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`sidebar-item${activeId === item.id ? ' active' : ''}`}
                      onClick={() => uiHandlers.setMainTab(SIDEBAR_TO_TAB[item.id])}
                      aria-current={activeId === item.id ? 'page' : undefined}
                      title={item.label}
                    >
                      <span className="sidebar-item-icon" aria-hidden="true">{item.icon}</span>
                      <span>{item.label}</span>
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
