"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/(auth)/actions";
import ThemeToggle from "@/components/ThemeToggle";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/inventory", label: "Inventory" },
  { href: "/investments", label: "Investments" },
  { href: "/collection", label: "Collection" },
  { href: "/sales", label: "Sales" },
  { href: "/pending", label: "Pending" },
  { href: "/ripped", label: "For the Love of the Game" },
  { href: "/expenses", label: "Expenses" },
  { href: "/data", label: "Data" },
];

function linkClass(active: boolean) {
  return `whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium ${
    active
      ? "bg-accent text-on-accent"
      : "text-muted hover:bg-inset hover:text-ink"
  }`;
}

function mobileLinkClass(active: boolean) {
  return `rounded-xl px-3 py-2.5 text-sm font-medium ${
    active ? "bg-panel text-accent" : "text-muted hover:bg-inset"
  }`;
}

/** Package glyph from the redesign mock, in place of the old emoji. */
function Logo() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-accent text-on-accent"
    >
      <svg width="17" height="17" viewBox="0 0 17 17">
        <path
          d="M2 5 L8.5 2 L15 5 L15 12 L8.5 15 L2 12 Z M2 5 L8.5 8 L15 5 M8.5 8 L8.5 15"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

const pillButton =
  "rounded-full bg-surface px-3.5 py-2 text-sm font-medium text-ink shadow-sm hover:bg-inset";

export default function AppHeader({ email }: { email: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <header>
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex items-center gap-3 py-4">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <Logo />
            <span className="font-display text-[17px] font-bold tracking-tight">
              Resale Tracker
            </span>
          </Link>

          {/* Desktop nav. Nine links only fit on one line at xl; below that
              the hamburger takes over rather than letting the row wrap. */}
          <nav
            aria-label="Sections"
            className="ml-2 hidden items-center gap-1 rounded-full bg-surface p-1 shadow-sm xl:flex"
          >
            {LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href) ? "page" : undefined}
                className={linkClass(isActive(href))}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden truncate text-xs text-muted 2xl:inline">
              {email}
            </span>
            <ThemeToggle />
            <form action={signOut} className="hidden xl:block">
              <button type="submit" className={pillButton}>
                Sign out
              </button>
            </form>

            {/* Mobile menu toggle */}
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface text-muted shadow-sm hover:bg-inset xl:hidden"
            >
              <span className="text-lg leading-none">{open ? "✕" : "☰"}</span>
            </button>
          </div>
        </div>

        {/* Mobile menu panel */}
        {open && (
          <nav
            aria-label="Sections"
            className="mb-3 flex flex-col gap-1 rounded-2xl bg-surface p-2 shadow-sm xl:hidden"
          >
            {LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href) ? "page" : undefined}
                className={mobileLinkClass(isActive(href))}
              >
                {label}
              </Link>
            ))}
            <div className="mt-1 flex items-center justify-between gap-3 border-t border-line px-1 pt-3">
              <span className="truncate text-sm text-muted">{email}</span>
              <form action={signOut}>
                <button type="submit" className={pillButton}>
                  Sign out
                </button>
              </form>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
