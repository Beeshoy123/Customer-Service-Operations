// Shared building blocks for the redesigned tabs: line icons (no emoji), the standard tab
// frame (icon + title on the left, controls on the right, content fills the rest), the
// two-or-more way toggle and the empty state. Look only; no data or behaviour in here.
import React from 'react';

export type IconName =
  | 'add' | 'calendar' | 'metrics' | 'exit' | 'search' | 'roster' | 'outliers' | 'repeat'
  | 'trends' | 'apprentice' | 'dow' | 'analysis' | 'match' | 'pulse' | 'copy' | 'check' | 'cross';

const PATHS: Record<IconName, React.ReactNode> = {
  add: (<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M12 11v6M9 14h6" /></>),
  calendar: (<><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /></>),
  metrics: (<><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>),
  exit: (<><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" /><path d="M15 8l4 4-4 4M19 12H9" /></>),
  search: (<><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></>),
  roster: (<><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4h6v3H9zM9 12h6M9 16h4" /></>),
  outliers: (<><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17h.01" /></>),
  repeat: (<><path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2" /><path d="M20 4v5h-5M4 20v-5h5" /></>),
  trends: (<><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>),
  apprentice: (<><path d="M2 9l10-5 10 5-10 5z" /><path d="M6 11v5c3 2 9 2 12 0v-5" /></>),
  dow: (<><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /></>),
  analysis: (<><path d="M4 20V10M10 20V4M16 20v-8M22 20H2" /></>),
  match: (<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><path d="M12 12h.01" /></>),
  pulse: (<><path d="M3 12h4l3-8 4 16 3-8h4" /></>),
  check: (<><path d="M5 12l5 5 9-10" /></>),
  cross: (<><path d="M6 6l12 12M18 6L6 18" /></>),
  copy: (<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></>),
};

export const Icon = ({ name, size = 20 }: { name: IconName; size?: number }) => (
  <svg className="cso-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {PATHS[name]}
  </svg>
);

// ─── Standard tab frame ───────────────────────────────────────────────
// Same look on every tab: icon badge + title (+ one muted line) on the left, toggles and
// buttons on the right, the content below. The content area scrolls inside itself.
interface TabFrameProps {
  icon: IconName;
  title: string;
  subtitle?: React.ReactNode;
  controls?: React.ReactNode;
  children: React.ReactNode;
}

export const TabFrame = ({ icon, title, subtitle, controls, children }: TabFrameProps) => (
  <div className="tab-frame">
    <div className="tab-toolbar">
      <div className="tab-title">
        <span className="tab-icon"><Icon name={icon} size={18} /></span>
        <div className="tab-title-text">
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      {controls ? <div className="tab-controls">{controls}</div> : null}
    </div>
    <div className="tab-content">{children}</div>
  </div>
);

// ─── Toggle (2+ choices) ──────────────────────────────────────────────
interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (next: T) => void;
}

export const Segmented = <T extends string>({ label, value, options, onChange }: SegmentedProps<T>) => (
  <div className="seg-toggle" role="group" aria-label={label}>
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        className={`seg-toggle-btn${option.value === value ? ' active' : ''}`}
        aria-pressed={option.value === value}
        onClick={() => onChange(option.value)}
      >
        {option.label}
      </button>
    ))}
  </div>
);

// ─── Empty state: icon, one line, one hint ────────────────────────────
export const EmptyState = ({ icon, title, hint }: { icon: IconName; title: string; hint?: string }) => (
  <div className="empty-state">
    <span className="empty-state-icon"><Icon name={icon} size={28} /></span>
    <strong>{title}</strong>
    {hint ? <span>{hint}</span> : null}
  </div>
);
