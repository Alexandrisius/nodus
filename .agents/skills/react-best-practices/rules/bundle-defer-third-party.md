---
title: Defer Non-Critical Third-Party Libraries
impact: MEDIUM
impactDescription: loads after initial render
tags: bundle, third-party, analytics, defer, dynamic-import
---

## Defer Non-Critical Third-Party Libraries

Analytics, logging, and error tracking don't block user interaction. Keep them out of the entry chunk — load them after the first paint.

Nodus is a client-rendered Vite SPA: there is no SSR pass to hide a heavy import behind. Every static `import` at the top of `main.tsx` (or of any module reachable from it) lands in the entry chunk and must be downloaded, parsed, and executed before the app can render. Vite automatically splits each dynamic `import()` into a separate async chunk, so deferring a library is a deliberate one-line decision.

**Incorrect (monitoring SDK bundled into the entry chunk):**

```tsx
// apps/web/src/main.tsx
import { createRoot } from 'react-dom/client'
import { initErrorTracker } from './monitoring/error-tracker' // heavy SDK, static import
import { App } from './app'

// Pulls the whole SDK into the entry chunk and runs it before first paint,
// although no user interaction depends on it.
initErrorTracker()

createRoot(document.getElementById('root')!).render(<App />)
```

**Correct (loads after mount, in idle time):**

```tsx
// apps/web/src/monitoring/deferred-monitoring.tsx
import { useEffect } from 'react'

export function DeferredMonitoring() {
  useEffect(() => {
    // The dynamic import() keeps the SDK out of the entry chunk.
    // Loading starts only after the first paint — in browser idle time when possible.
    let cancelled = false
    const load = () => {
      void import('./error-tracker').then(({ initErrorTracker }) => {
        if (!cancelled) initErrorTracker()
      })
    }

    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(load, { timeout: 2000 })
      return () => {
        cancelled = true
        window.cancelIdleCallback(id)
      }
    }

    const id = setTimeout(load, 0)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [])

  return null
}
```

```tsx
// apps/web/src/app.tsx
export function App() {
  return (
    <>
      <RouterProvider router={router} />
      <DeferredMonitoring />
    </>
  )
}
```

**Correct (third-party UI widget — lazy component with Suspense):**

For a non-critical *component* from a heavy library (onboarding tour, feedback widget, promo panel), use `React.lazy` so its code loads only when the component first renders:

```tsx
import { lazy, Suspense } from 'react'

// Module level — never call lazy() inside a component (see `bundle-dynamic-imports`).
const OnboardingTour = lazy(() =>
  import('./onboarding-tour').then((m) => ({ default: m.OnboardingTour })),
)

export function AppShell() {
  return (
    <>
      <Outlet />
      {/* fallback={null}: the shell stays fully usable while the tour chunk loads */}
      <Suspense fallback={null}>
        <OnboardingTour />
      </Suspense>
    </>
  )
}
```

**Notes:**

- Zero cloud (I11) still applies: "third-party" here means heavy npm dependencies and self-hosted reporters posting to our own `/api/v1` — never external SaaS beacons.
- Verify the split in the build output or bundle analyzer: the deferred library must appear as its own async chunk, not inside `index-*.js`.
- Make `init*()` functions of deferred modules idempotent — React StrictMode mounts effects twice in development.
- If the deferred work can wait even longer than idle time (e.g. pre-warming a report cache), prefer `requestIdleCallback` directly (see `js-request-idle-callback`).
