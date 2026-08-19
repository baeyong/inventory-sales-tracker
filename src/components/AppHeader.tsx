"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/(auth)/actions";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/inventory", label: "Inventory" },
  { href: "/sales", label: "Sales" },
  { href: "/pending", label: "Pending" },
  { href: "/ripped", label: "For the Love of the Game" },
  { href: "/expenses", label: "Expenses" },
  { href: "/data", label: "Data" },
];

function linkClass(active: boolean) {
  return `rounded-md px-3 py-2 text-sm font-medium ${
    active
      ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
  }`;
}

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
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex items-center gap-4 py-3">
          <Link href="/dashboard" className="text-base font-bold">
            📦 Resale Tracker
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 md:flex">
            {LINKS.map(({ href, label }) => (
              <Link key={href} href={href} className={linkClass(isActive(href))}>
                {label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-zinc-500 lg:inline">
              {email}
            </span>
            <form action={signOut} className="hidden md:block">
              <button
                type="submit"
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Sign out
              </button>
            </form>

            {/* Mobile menu toggle */}
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-300 text-zinc-600 hover:bg-zinc-100 md:hidden dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <span className="text-lg leading-none">{open ? "✕" : "☰"}</span>
            </button>
          </div>
        </div>

        {/* Mobile menu panel */}
        {open && (
          <nav className="flex flex-col gap-1 border-t border-zinc-100 pb-3 pt-2 md:hidden dark:border-zinc-800">
            {LINKS.map(({ href, label }) => (
              <Link key={href} href={href} className={linkClass(isActive(href))}>
                {label}
              </Link>
            ))}
            <div className="mt-2 flex items-center justify-between border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <span className="truncate text-sm text-zinc-500">{email}</span>
              <form action={signOut}>
                <button
                  type="submit"
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
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
