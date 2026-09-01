---
title: Use Resource Hints for Critical Resources
impact: HIGH
impactDescription: reduces load time for critical resources
tags: rendering, preload, preconnect, prefetch, resource-hints
---

## Use Resource Hints for Critical Resources

**Impact: HIGH (reduces load time for critical resources)**

Resource hints tell the browser about resources it will need soon. In the Nodus Vite SPA there are two delivery channels, and choosing the right one matters:

1. **Static hints in `index.html`** — plain `<link>` tags. They start fetching *before any JavaScript runs*, so they are the only channel early enough for resources the very first render needs (fonts, preconnect to the API or file-storage origin).
2. **React DOM hint APIs** (`react-dom`, React 19) — called during render; React hoists a deduplicated `<link>` into `<head>`. They fire only once the JS bundle executes, so use them for resources discovered at runtime: a feature that connects to another origin when it mounts, or an asset needed by a likely next step.

React DOM provides:

- **`prefetchDNS(href)`**: Resolve DNS for a domain you expect to connect to
- **`preconnect(href)`**: Establish connection (DNS + TCP + TLS) to a server
- **`preload(href, options)`**: Fetch a resource (stylesheet, font, script, image) you'll use soon
- **`preloadModule(href)`**: Fetch an ES module you'll use soon
- **`preinit(href, options)`**: Fetch and evaluate a stylesheet or script
- **`preinitModule(href)`**: Fetch and evaluate an ES module

**Example (static hints in `index.html` — first-render resources):**

```html
<!-- apps/web/index.html -->
<head>
  <!-- If files are served from a separate origin (MinIO behind Caddy), warm the
       connection before the first attachment request is made. -->
  <link rel="preconnect" href="https://files.nodus.by" />
  <!-- Fonts are self-hosted (zero cloud — no font CDNs). Preload only the weights
       used above the fold; each preloaded font competes with the JS bundle. -->
  <link
    rel="preload"
    href="/fonts/inter-latin-cyrillic-400.woff2"
    as="font"
    type="font/woff2"
    crossorigin
  />
</head>
```

**Example (React DOM hints — runtime-discovered resources):**

```tsx
import { preconnect, prefetchDNS } from 'react-dom'

function FilesFeature() {
  // Called during render; React dedupes the hint across re-renders and instances.
  // The connection is warm by the time the user opens the first attachment.
  preconnect('https://files.nodus.by')

  return <AttachmentList />
}

function ReportingDashboard() {
  // A host the dashboard may query later — a cheap DNS prefetch is enough.
  prefetchDNS('https://files.nodus.by')

  return <Dashboard />
}
```

**Example (preload an asset only when a feature needs it):**

```tsx
import { preload } from 'react-dom'

function DocumentPrintView() {
  // The print layout uses a condensed font the rest of the app never loads —
  // start fetching it as soon as this view renders, not when @font-face matches.
  preload('/fonts/inter-condensed-400.woff2', {
    as: 'font',
    type: 'font/woff2',
    crossOrigin: 'anonymous',
  })

  return <PrintLayout />
}
```

**Do NOT hard-code chunk URLs — preload routes through the router:**

`preloadModule('/assets/gantt-By4xQ2.js')` looks tempting, but Vite hashes chunk filenames, so every deploy silently invalidates the hard-coded path. Preload the *route* instead and let TanStack Router resolve the real chunk:

```tsx
import { Link } from '@tanstack/react-router'

function ProjectNav({ projectId }: { projectId: string }) {
  return (
    <nav>
      {/* preload="intent": fetch the route chunk and its loader data on hover/focus,
          before the click. preloadDelay (ms) debounces accidental mouse passes. */}
      <Link
        to="/projects/$projectId/gantt"
        params={{ projectId }}
        preload="intent"
        preloadDelay={100}
      >
        График проекта
      </Link>
    </nav>
  )
}
```

For triggers that are not links, call `router.preloadRoute({ to: '/projects/$projectId/gantt', params })`. For a heavy component *inside* a page, fire its dynamic `import()` on hover (see `bundle-preload`) — the same mechanism one level down.

**When to use each:**

| API | Use case |
|-----|----------|
| `prefetchDNS` | Origins you'll connect to later |
| `preconnect` | API or file origins you'll fetch from immediately |
| `preload` | Critical resources needed for the current view (fonts above the fold) |
| `preloadModule` | Raw ES modules — rare here; prefer router/component preloading |
| `preinit` | Stylesheets/scripts that must execute early |
| `preinitModule` | ES modules that must execute early — rare in a bundled SPA |

**Cautions:**

- Each preconnect holds sockets open; more than ~4 origins wastes resources. `prefetchDNS` is the cheap fallback for "maybe later" hosts.
- `preload` fetches at high priority — preloading too many assets steals bandwidth from the entry bundle and makes everything slower. Audit hints after adding them.
- Everything hinted at must be self-hosted (I11): fonts, files, and API origins are ours; there are no third-party CDNs to warm up.

Reference: [React DOM Resource Preloading APIs](https://react.dev/reference/react-dom#resource-preloading-apis)
