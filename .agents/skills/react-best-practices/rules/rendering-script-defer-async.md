---
title: Use defer or async on Script Tags
impact: HIGH
impactDescription: eliminates render-blocking
tags: rendering, script, defer, async, performance
---

## Use defer or async on Script Tags

**Impact: HIGH (eliminates render-blocking)**

Classic script tags without `defer` or `async` block HTML parsing while the script downloads and executes. This delays First Contentful Paint and Time to Interactive.

- **`defer`**: Downloads in parallel, executes after HTML parsing completes, maintains execution order
- **`async`**: Downloads in parallel, executes immediately when ready, no guaranteed order

Use `defer` for scripts that depend on the DOM or on each other. Use `async` for fully independent scripts.

**The Nodus baseline:** our own application code never hits this problem — Vite emits the entry as `<script type="module" src="/src/main.tsx">`, and module scripts are deferred by specification. The risk is any *additional* classic script dropped into `apps/web/index.html` (a self-hosted analytics beacon, a vendor widget that ships only as a script). Those must carry `defer` or `async` explicitly — a bare `<script src>` in `<head>` freezes the blank page for every user.

**Incorrect (blocks parsing of `apps/web/index.html`):**

```html
<head>
  <script src="https://analytics.nodus.by/tracker.js"></script>
  <script src="/scripts/legacy-widget.js"></script>
</head>
```

**Correct (non-blocking):**

```html
<head>
  <!-- Independent beacon — execution order doesn't matter: async -->
  <script src="https://analytics.nodus.by/tracker.js" async></script>
  <!-- Needs the parsed DOM and no other script: defer -->
  <script src="/scripts/legacy-widget.js" defer></script>
</head>
```

**Prefer bundling over script tags:**

Zero cloud (I11) means no third-party CDN scripts in runtime — anything we ship is self-hosted anyway, so a plain `<script>` tag is rarely the best delivery mechanism. An npm dependency loaded through a dynamic `import()` participates in Vite's code splitting, gets type definitions, and is pinned by the lockfile and dependency review; a script tag gets none of that. Reserve `index.html` scripts for code that genuinely cannot be bundled — for example, a beacon that must run even when the application bundle itself fails to load.

**Runtime-injected scripts:**

Scripts created in JavaScript are `async` by default — keep it that way unless execution order is strictly required:

```ts
function injectBeacon(src: string) {
  const script = document.createElement('script')
  script.src = src
  script.async = true // the default for dynamic scripts; stated for intent
  document.head.appendChild(script)
}
```

Setting `script.async = false` on dynamically inserted scripts restores document order — the dynamic equivalent of `defer`.

Reference: [MDN - Script element](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script#defer)
