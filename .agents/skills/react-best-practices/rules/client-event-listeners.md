---
title: Deduplicate Global Event Listeners
impact: LOW
impactDescription: single listener for N components
tags: client, event-listeners, subscription, hooks
---

## Deduplicate Global Event Listeners

Share one DOM listener across all hook instances instead of registering one per component.

TanStack Query already deduplicates *network* requests for us, but it has nothing to do with DOM events — a global listener needs its own sharing mechanism. A module-level, reference-counted subscription manager gives exactly one `window.addEventListener` per event type no matter how many components subscribe, and detaches it when the last subscriber unmounts.

**Incorrect (N instances = N listeners):**

```tsx
function useKeyboardShortcut(key: string, callback: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === key) {
        callback()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [key, callback])
}
```

Every `useKeyboardShortcut(...)` call adds its own `keydown` listener: a toolbar with twenty shortcuts runs twenty handlers on every keystroke. Worse, an inline `callback` recreated each render makes the effect resubscribe constantly — each render tears the listener down and registers a new one.

**Correct (N instances = 1 listener):**

```tsx
// shared-window-listener.ts — module-level, ref-counted
function createSharedWindowListener<K extends keyof WindowEventMap>(type: K) {
  const subscribers = new Set<(event: WindowEventMap[K]) => void>()

  const domHandler = (event: WindowEventMap[K]) => {
    subscribers.forEach((callback) => callback(event))
  }

  return function subscribe(callback: (event: WindowEventMap[K]) => void) {
    if (subscribers.size === 0) {
      window.addEventListener(type, domHandler)
    }
    subscribers.add(callback)

    return () => {
      subscribers.delete(callback)
      if (subscribers.size === 0) {
        window.removeEventListener(type, domHandler)
      }
    }
  }
}

// One shared subscription point per event type, created once per app load.
const subscribeToKeydown = createSharedWindowListener('keydown')
```

```tsx
// use-keyboard-shortcut.ts
function useKeyboardShortcut(key: string, callback: () => void) {
  // Keep the latest callback in a ref (see `advanced-use-latest`):
  // an inline callback recreated each render must not force resubscription.
  const callbackRef = useRef(callback)
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    return subscribeToKeydown((event) => {
      // Users sit on Windows desktops — treat Ctrl and Cmd alike.
      if ((event.metaKey || event.ctrlKey) && event.key === key) {
        callbackRef.current()
      }
    })
  }, [key])
}
```

```tsx
function TasksToolbar() {
  // All three shortcuts share the single window 'keydown' listener.
  useKeyboardShortcut('k', () => openGlobalSearch())
  useKeyboardShortcut('n', () => openNewTaskDialog())
  useKeyboardShortcut('p', () => openProfile())
  // ...
}
```

**Notes:**

- The helper works for any `WindowEventMap` event type — `resize`, `online`/`offline`, `storage`, `beforeunload` — with fully typed events.
- The DOM listener attaches lazily on the first subscription and detaches when the last subscriber unmounts, so unused shortcuts cost nothing.
- Keep the subscriber set out of React state: it is transient infrastructure, not UI state. A module-level `Set` plus refs is the right tool (see `rerender-use-ref-transient-values`).
- If a shortcut must not fire while the user types, check `event.target` inside the shared handler (`HTMLInputElement` / `HTMLTextAreaElement` / `isContentEditable`) rather than adding a second listener with different options.
