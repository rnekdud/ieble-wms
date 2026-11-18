import { isAndroidApp } from './native-environment'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import AppErrorBoundary from './components/AppErrorBoundary'
// Keep shared styles ahead of business overrides even when workspace JavaScript loads lazily.
import './components/workspace/rack-barcode.css'
import './components/workspace/warehouse-plan.css'
import './components/workspace/warehouse-3d.css'
import './components/workspace/products.css'
import './components/workspace/receipts.css'
import './components/workspace/workspace.css'
import './business-ui.css'
import './design-tokens.css'
import './theme.css'

// The existing Vite entry is also used by the USB Live Reload WebView.
if (import.meta.env.DEV && isAndroidApp()) void import('./android-live').then(({ startAndroidLive }) => startAndroidLive())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary><App /></AppErrorBoundary>
  </StrictMode>,
)
