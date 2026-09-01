---
title: Dynamic Imports for Heavy Components
impact: CRITICAL
impactDescription: directly affects TTI and LCP
tags: bundle, dynamic-import, code-splitting, react-lazy, suspense
---

## Dynamic Imports for Heavy Components

Use `React.lazy` with `Suspense` to lazy-load large components not needed on initial render. Vite emits every dynamic `import()` as a separate chunk that the browser fetches on demand.

Nodus pages carry genuinely heavy widgets: the Gantt chart on project pages, the PDF/document viewer for correspondence, rich text editors, XLSX previews. Statically imported, each of them inflates the entry chunk that *every* user pays for on *every* load — including users who never open those pages.

**Incorrect (Gantt library bundles with the main chunk, ~300 KB):**

```tsx
import { GanttChart } from './gantt-chart' // wraps a heavy third-party gantt library

function ProjectScheduleTab({ projectId }: { projectId: string }) {
  return <GanttChart projectId={projectId} />
}
```

**Correct (Gantt loads on demand):**

```tsx
import { lazy, Suspense } from 'react'
import { Skeleton } from '@nodus/ui'

// lazy() must live at module level — calling it during render recreates
// the component every render, resetting its state and refetching the chunk.
const GanttChart = lazy(() =>
  // Named export → map it to the default export that lazy() expects.
  import('./gantt-chart').then((m) => ({ default: m.GanttChart })),
)

function ProjectScheduleTab({ projectId }: { projectId: string }) {
  return (
    // Skeleton, not a spinner: the chunk can take >300 ms on a slow link,
    // and a stable placeholder avoids layout jump when it arrives.
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <GanttChart projectId={projectId} />
    </Suspense>
  )
}
```

**Guard against stale chunks after a deploy:**

A lazy chunk fails to load when a new deploy replaced the hashed chunk filenames while the user still runs the previous build (`Failed to fetch dynamically imported module`). Wrap `lazy()` so the app recovers by reloading exactly once, then surfaces the error to the nearest `ErrorBoundary` if the reload didn't fix it:

```tsx
// apps/web/src/shared/lib/lazy-with-retry.ts
import { lazy, type ComponentType } from 'react'

const RELOAD_FLAG = 'lazy-chunk-reload'

export function lazyWithRetry<P>(
  factory: () => Promise<{ default: ComponentType<P> }>,
) {
  return lazy(async (): Promise<{ default: ComponentType<P> }> => {
    try {
      const module = await factory()
      sessionStorage.removeItem(RELOAD_FLAG) // chunks are healthy again
      return module
    } catch (error) {
      if (!sessionStorage.getItem(RELOAD_FLAG)) {
        // First failure: a fresh deploy likely replaced the chunks — reload once
        // to pick up the new index.html and matching chunk URLs.
        sessionStorage.setItem(RELOAD_FLAG, '1')
        window.location.reload()
        return new Promise<never>(() => {}) // reload replaces the page anyway
      }
      // Already reloaded once — let the ErrorBoundary show a recoverable state.
      throw error
    }
  })
}
```

Always pair a `Suspense` boundary for lazy content with an `ErrorBoundary` above it, so a failed chunk shows a localized error with a retry path instead of unmounting the whole route.

**Route-level vs component-level code splitting:**

- Entire pages: prefer TanStack Router's code-split routes, so the route chunk — component plus its data dependencies — loads only on navigation to that route.
- Heavy widgets inside a page (editor, viewer, chart): `React.lazy` as above.
- Combine with intent preloading (see `bundle-preload`): fire `import('./gantt-chart')` on hover/focus, so the chunk is already in the HTTP cache when the user clicks.

Verify the split in the build output: the heavy library must appear as its own async chunk, not inside the entry `index-*.js`.
