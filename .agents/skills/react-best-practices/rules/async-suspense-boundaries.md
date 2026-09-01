---
title: Strategic Suspense Boundaries
impact: HIGH
impactDescription: faster initial paint
tags: async, suspense, streaming, layout-shift, tanstack-query
---

## Strategic Suspense Boundaries

> **Nodus note:** we are a client-side Vite SPA — **async components do not exist here** (they are a React Server Components feature). In our stack the data source inside a `<Suspense>` boundary is TanStack Query's `useSuspenseQuery`, and promises for `use()` come from a stable source (router loader or the query cache) — never from a fetch created in the render body.

Instead of blocking the whole page on a query, use Suspense boundaries so the wrapper UI (sidebar, header, footer) paints immediately while data loads.

**Incorrect (wrapper blocked by data fetching):**

```tsx
function TasksPage() {
  const { data } = useTasks() // whole page suspends on the list

  if (!data) return <Skeleton className="page" />

  return (
    <div>
      <div>Sidebar</div>
      <div>Header</div>
      <div>
        <TaskList tasks={data.items} />
      </div>
      <div>Footer</div>
    </div>
  )
}
```

The entire layout waits for the query even though only the middle section needs it — and the loading branch usually ends up as a hand-rolled full-page spinner.

**Correct (wrapper shows immediately, the section suspends on its own):**

```tsx
function TasksPage() {
  return (
    <div>
      <div>Sidebar</div>
      <div>Header</div>
      <div>
        <Suspense fallback={<Skeleton />}>
          <TaskList />
        </Suspense>
      </div>
      <div>Footer</div>
    </div>
  )
}

function TaskList() {
  // Suspends ONLY this component; integrates with the query cache
  // (dedup, background refetch, optimistic updates keep working)
  const { data } = useSuspenseQuery(tasksQueryOptions())
  return <div>{data.items.map(renderTask)}</div>
}
```

Sidebar, Header, and Footer render immediately. Only `TaskList` waits for data. Query keys come from the feature's keys factory (patterns.md).

**Alternative (share one query across sibling components):**

```tsx
function TasksPage() {
  return (
    <div>
      <div>Sidebar</div>
      <div>Header</div>
      <Suspense fallback={<Skeleton />}>
        <TaskList />
        <TaskSummary />
      </Suspense>
      <div>Footer</div>
    </div>
  )
}

function TaskList() {
  const { data } = useSuspenseQuery(tasksQueryOptions())
  return <div>{data.items.map(renderTask)}</div>
}

function TaskSummary() {
  // Same query key → same cache entry → single request for both
  const { data } = useSuspenseQuery(tasksQueryOptions())
  return <div>{data.items.length}</div>
}
```

Both components share the same cached query — one fetch, one Suspense reveal. (The `use(promise)` API also exists in React 19 for unwrapping promises, but take the promise from a stable source like the router loader; a promise created in the render body restarts on every render.)

**When NOT to use this pattern:**

- Critical data needed for layout decisions (affects positioning)
- Small, fast queries where suspense overhead isn't worth it
- When you want to avoid layout shift (loading → content jump) — prefer TanStack Query's cached `useQuery` with placeholderData instead

**Trade-off:** Faster initial paint vs potential layout shift. Choose based on your UX priorities — and remember our default is cached data with background revalidation, so many screens need no Suspense at all.
