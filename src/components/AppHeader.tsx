"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/(auth)/actions";
import ThemeToggle from "@/components/ThemeToggle";

type NavLink = { href: string; label: string };
type NavEntry = NavLink | { label: string; items: NavLink[] };

// Seven top-level entries; the holding areas and the sales views sit under a
// menu each, with their own tabs on the page itself. Opened boxes and Grading
// stand alone.
const NAV: NavEntry[] = [
  { href: "/dashboard", label: "Dashboard" },
  {
    label: "Holdings",
    items: [
      { href: "/inventory", label: "Inventory" },
      { href: "/investments", label: "Investments" },
      { href: "/collection", label: "Collection" },
    ],
  },
  { href: "/ripped", label: "Opened" },
  { href: "/grading", label: "Grading" },
  {
    label: "Sales",
    items: [
      { href: "/sales", label: "All sales" },
      { href: "/pending", label: "Pending" },
    ],
  },
  { href: "/expenses", label: "Expenses" },
  { href: "/data", label: "Data" },
];

function Chevron() {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
      <path
        d="M1 3.5 L5 7 L9 3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Package glyph from the redesign mock. */
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

const pill = (active: boolean) =>
  `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-[13px] py-2 text-xs ${
    active
      ? "bg-accent font-semibold text-on-accent"
      : "font-medium text-ink-2 hover:bg-inset"
  }`;

const signOutCls =
  "rounded-full bg-surface px-3.5 py-[9px] text-xs font-medium text-ink shadow-pill hover:bg-inset";

/** A top-level pill that opens a small menu of the pages under it. */
function NavMenu({
  label,
  items,
  active,
  isActive,
}: {
  label: string;
  items: NavLink[];
  active: boolean;
  isActive: (href: string) => boolean;
}) {
  const pathname = usePathname();
  // Remember which page the menu was opened on, so moving to another page
  // closes it without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpenOn(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenOn(null);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpenOn(open ? null : pathname)}
        className={pill(active)}
      >
        {label}
        <Chevron />
      </button>
      {open && (
        <ul className="card absolute left-0 top-full z-40 mt-2 min-w-44 p-1.5">
          {items.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={isActive(l.href) ? "page" : undefined}
                className={`block rounded-xl px-3 py-2 text-[13px] ${
                  isActive(l.href)
                    ? "bg-soft font-semibold text-on-soft"
                    : "text-ink-2 hover:bg-inset"
                }`}
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AppHeader({ email }: { email: string }) {
  const pathname = usePathname();
  const [menuOn, setMenuOn] = useState<string | null>(null);
  const menuOpen = menuOn === pathname;

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <header className="px-4 sm:px-8">
      <div className="flex items-center gap-3.5 py-4">
        <Link href="/dashboard" className="flex items-center gap-3.5">
          <Logo />
          <span className="disp text-[17px] font-bold">Resale Tracker</span>
        </Link>

        <nav
          aria-label="Sections"
          className="ml-2.5 hidden items-center gap-1 rounded-full bg-surface p-1 lg:flex"
        >
          {NAV.map((entry) =>
            "items" in entry ? (
              <NavMenu
                key={entry.label}
                label={entry.label}
                items={entry.items}
                active={entry.items.some((l) => isActive(l.href))}
                isActive={isActive}
              />
            ) : (
              <Link
                key={entry.href}
                href={entry.href}
                aria-current={isActive(entry.href) ? "page" : undefined}
                className={pill(isActive(entry.href))}
              >
                {entry.label}
              </Link>
            )
          )}
        </nav>

        <span className="grow" />
        <span className="hidden truncate text-xs text-muted xl:inline">
          {email}
        </span>
        <ThemeToggle />
        <form action={signOut} className="hidden lg:block">
          <button type="submit" className={signOutCls}>
            Sign out
          </button>
        </form>

        <button
          type="button"
          onClick={() => setMenuOn(menuOpen ? null : pathname)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface text-ink shadow-pill hover:bg-inset lg:hidden"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            {menuOpen ? (
              <path
                d="M4 4 L14 14 M14 4 L4 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            ) : (
              <path
                d="M2 5 H16 M2 9 H16 M2 13 H16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            )}
          </svg>
        </button>
      </div>

      {/* Phone / narrow menu: every page, grouped as on desktop. */}
      {menuOpen && (
        <nav aria-label="Sections" className="card mb-3 p-2 lg:hidden">
          {NAV.map((entry) =>
            "items" in entry ? (
              <div key={entry.label} className="mt-1">
                <div className="cap px-3 pb-1 pt-2">{entry.label}</div>
                {entry.items.map((l) => (
                  <MobileLink key={l.href} link={l} active={isActive(l.href)} />
                ))}
              </div>
            ) : (
              <MobileLink
                key={entry.href}
                link={entry}
                active={isActive(entry.href)}
              />
            )
          )}
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-line px-2 pt-3">
            <span className="truncate text-sm text-muted">{email}</span>
            <form action={signOut}>
              <button type="submit" className={signOutCls}>
                Sign out
              </button>
            </form>
          </div>
        </nav>
      )}
    </header>
  );
}

function MobileLink({ link, active }: { link: NavLink; active: boolean }) {
  return (
    <Link
      href={link.href}
      aria-current={active ? "page" : undefined}
      className={`block rounded-xl px-3 py-2.5 text-sm ${
        active ? "bg-soft font-semibold text-on-soft" : "text-ink-2 hover:bg-inset"
      }`}
    >
      {link.label}
    </Link>
  );
}
