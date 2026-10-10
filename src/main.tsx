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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
