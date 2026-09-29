import React from 'react';

// Extracted from App.tsx (Phase 1 move-only refactor) — behavior must stay identical.

// ─── Error Boundary ──────────────────────────────────────
export class ErrorBoundary extends React.Component<{ children?: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Dashboard error boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b0f19', color: '#e2e8f0', padding: '32px' }}>
          <div style={{ maxWidth: 520, width: '100%', background: '#111827', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 16, padding: 24 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 24, color: '#ffffff' }}>Dashboard Error</h2>
            <p style={{ margin: '0 0 16px', color: '#cbd5e1', lineHeight: 1.6 }}>
              The dashboard hit an unexpected error and needs to reload. This is a UI-level failure, not a data-loss issue.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                padding: '10px 16px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Reload dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
