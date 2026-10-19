"use client";

import { useSyncExternalStore } from "react";

// The class on <html> is the source of truth — the inline script in layout.tsx
// has already set it before this mounts — so subscribe to it rather than copy
// it into state.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

const isDark = () => document.documentElement.classList.contains("dark");
// The server can't know the theme; null keeps the first render unlabelled.
const unknownOnServer = () => null;

/** Light/dark switch. */
export default function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, isDark, unknownOnServer);
  const ready = dark !== null;

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // Private browsing or blocked storage: the choice just won't persist.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      // Until mounted we don't know the theme, so stay unlabelled rather than
      // claiming the wrong one.
      aria-label={
        ready ? (dark ? "Switch to light theme" : "Switch to dark theme") : "Switch theme"
      }
      aria-pressed={ready ? dark : undefined}
      title={ready ? (dark ? "Light mode" : "Dark mode") : undefined}
      className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface text-ink-2 shadow-pill hover:bg-inset hover:text-ink"
    >
      {ready && dark ? (
        // Sun: clicking goes back to light.
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="3.1" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3.1 3.1l1.1 1.1M11.8 11.8l1.1 1.1M12.9 3.1l-1.1 1.1M4.2 11.8l-1.1 1.1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        // Moon: clicking goes dark.
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M13.2 10.1A5.6 5.6 0 0 1 5.9 2.8a5.6 5.6 0 1 0 7.3 7.3Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
