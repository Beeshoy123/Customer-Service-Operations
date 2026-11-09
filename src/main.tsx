import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import './features/dashboard/import/ImportPreviewModal.css'
// Dashboard rules load last so they win same-specificity ties against the two
// sheets above — this preserves the cascade the App-injected <style> tag had
// (it lived in <body>, after every stylesheet in <head>).
import './styles/dashboard.css'
// Frontend redesign: two-column shell (sidebar + workspace) overrides.
import './styles/layout.css'
import App from './App.tsx'
import { preloadPersistedDashboardState } from './features/dashboard/persistence'

// Saved data now lives in IndexedDB (async), so load it before the first screen.
// A failed load must never block the app: it just starts empty, as before.
preloadPersistedDashboardState()
  .catch((error) => console.warn('Could not load saved dashboard data:', error))
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
