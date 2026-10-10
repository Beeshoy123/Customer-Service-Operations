// Chronic Offenders — placeholder view (redesign blueprint).
// The multi-month tracking grid logic will be built inside this view later;
// intentionally empty of data wiring for now.
import React from 'react';

export const FloorOffendersTab = React.memo(() => (
  <div className="offenders-placeholder">
    <div className="offenders-placeholder-icon" aria-hidden="true">🚫</div>
    <h3 className="workspace-title">Chronic Offenders</h3>
    <p className="offenders-placeholder-text">
      Multi-month tracking grid coming soon. This view will surface repeat
      offenders across imported months with trend-based flagging.
    </p>
  </div>
));
