---
name: react-best-practices
description: React 19 performance and code-quality guidelines for the Nodus Vite SPA. Use when writing, reviewing, or refactoring React components, hooks, data fetching (TanStack Query), or when optimizing bundle size, re-renders, or load times.
license: MIT
metadata:
  author: nodus (based on Vercel Engineering rules)
  version: "1.0.0"
---

# React Best Practices (Nodus SPA)

Performance optimization guide for our React 19 + Vite SPA (no SSR/RSC — all rules are client-side). Rules are prioritized by impact to guide code generation, refactoring, and review.

Apply when:

- Writing new components, pages, or hooks
- Working with data fetching (TanStack Query) or client state (Zustand)
- Reviewing code for performance issues
- Optimizing bundle size, re-renders, or load times

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Eliminating Waterfalls | CRITICAL | `async-` |
| 2 | Bundle Size Optimization | CRITICAL | `bundle-` |
| 3 | Client-Side Data & Effects | MEDIUM-HIGH | `client-` |
| 4 | Re-render Optimization | MEDIUM | `rerender-` |
| 5 | Rendering Performance | MEDIUM | `rendering-` |
| 6 | JavaScript Performance | LOW-MEDIUM | `js-` |
| 7 | Advanced Patterns | LOW | `advanced-` |

## Quick Reference

### 1. Eliminating Waterfalls (CRITICAL)

- `async-cheap-condition-before-await` - Check cheap sync conditions before awaiting flags or remote values
- `async-defer-await` - Move await into branches where actually used
- `async-parallel` - Use Promise.all() for independent operations
- `async-dependencies` - Use better-all for partial dependencies
- `async-suspense-boundaries` - Use Suspense boundaries so independent UI parts don't block each other

### 2. Bundle Size Optimization (CRITICAL)

- `bundle-barrel-imports` - Import directly, avoid barrel files (no build-time optimizer in Vite)
- `bundle-analyzable-paths` - Prefer statically analyzable import and file-system paths
- `bundle-dynamic-imports` - React.lazy + Suspense for heavy components (with lazyWithRetry for deploy hash changes)
- `bundle-defer-third-party` - Load analytics/logging after initial render (idle callback / dynamic import)
- `bundle-conditional` - Load modules only when the feature is activated
- `bundle-preload` - Preload on hover/focus for perceived speed (TanStack Router `preload="intent"`)

### 3. Client-Side Data & Effects (MEDIUM-HIGH)

- `client-event-listeners` - Deduplicate global event listeners (shared window listener helper)
- `client-passive-event-listeners` - Use passive listeners for scroll
- `client-localstorage-schema` - Version and minimize localStorage data

### 4. Re-render Optimization (MEDIUM)

- `rerender-defer-reads` - Don't subscribe to state only used in callbacks
- `rerender-memo` - Extract expensive work into memoized components
- `rerender-memo-with-default-value` - Hoist default non-primitive props
- `rerender-dependencies` - Use primitive dependencies in effects
- `rerender-derived-state` - Subscribe to derived booleans, not raw values
- `rerender-derived-state-no-effect` - Derive state during render, not effects
- `rerender-functional-setstate` - Use functional setState for stable callbacks
- `rerender-lazy-state-init` - Pass function to useState for expensive values
- `rerender-simple-expression-in-memo` - Avoid memo for simple primitives
- `rerender-split-combined-hooks` - Split hooks with independent dependencies
- `rerender-move-effect-to-event` - Put interaction logic in event handlers
- `rerender-transitions` - Use startTransition for non-urgent updates
- `rerender-use-deferred-value` - Defer expensive renders to keep input responsive
- `rerender-use-ref-transient-values` - Use refs for transient frequent values
- `rerender-no-inline-components` - Don't define components inside components

### 5. Rendering Performance (MEDIUM)

- `rendering-animate-svg-wrapper` - Animate div wrapper, not SVG element
- `rendering-content-visibility` - Use content-visibility for long lists
- `rendering-hoist-jsx` - Extract static JSX outside components
- `rendering-svg-precision` - Reduce SVG coordinate precision
- `rendering-activity` - Use Activity component for show/hide
- `rendering-conditional-render` - Use ternary, not && for conditionals
- `rendering-usetransition-loading` - Prefer useTransition for loading state
- `rendering-resource-hints` - Resource hints: static links in index.html vs React 19 DOM APIs at runtime
- `rendering-script-defer-async` - Vite entry is deferred by spec; prefer bundling over script tags

### 6. JavaScript Performance (LOW-MEDIUM)

> Категория `js-*` — микрооптимизации: применять **только по результатам профилирования** горячего пути, не по умолчанию (наша нагрузка тривиальна, читаемость важнее).

- `js-batch-dom-css` - Group CSS changes via classes or cssText
- `js-index-maps` - Build Map for repeated lookups
- `js-cache-property-access` - Cache object properties in loops
- `js-cache-function-results` - Cache function results in module-level Map
- `js-cache-storage` - Cache localStorage/sessionStorage reads
- `js-combine-iterations` - Combine multiple filter/map into one loop
- `js-length-check-first` - Check array length before expensive comparison
- `js-early-exit` - Return early from functions
- `js-hoist-regexp` - Hoist RegExp creation outside loops
- `js-min-max-loop` - Use loop for min/max instead of sort
- `js-set-map-lookups` - Use Set/Map for O(1) lookups
- `js-tosorted-immutable` - Use toSorted() for immutability
- `js-flatmap-filter` - Use flatMap to map and filter in one pass
- `js-request-idle-callback` - Defer non-critical work to browser idle time

### 7. Advanced Patterns (LOW)

- `advanced-effect-event-deps` - Don't put `useEffectEvent` results in effect deps
- `advanced-event-handler-refs` - Store event handlers in refs
- `advanced-init-once` - Initialize app once per app load
- `advanced-use-latest` - useEffectEvent for stable callback refs

## How to Use

Read individual rule files for detailed explanations and code examples:

```
rules/async-parallel.md
rules/bundle-barrel-imports.md
```

Each rule file contains:

- Brief explanation of why it matters
- Incorrect code example with explanation
- Correct code example with explanation
- Additional context and references

Project conventions that override generic advice: `docs/architecture/patterns.md` (feature structure, query keys factory, optimistic mutations), `docs/product/ux-principles.md` (design tokens only).
