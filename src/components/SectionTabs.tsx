import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

// The pill row under the header that switches between the pages of one
// section — Holdings (Inventory, Investments, Collection, Opened) and Sales
// (All sales, Pending). Each tab carries its count so you can see at a glance
// where things are.
type Tab = {
  href: string;
  label: string;
  count: number;
  /** Pending shows its count as an amber badge — it's a to-do, not a total. */
  alert?: boolean;
};

function Tabs({
  label,
  tabs,
  active,
}: {
  label: string;
  tabs: Tab[];
  active: string;
}) {
  return (
    <nav
      aria-label={label}
      className="flex max-w-full flex-wrap gap-1 self-start rounded-full bg-surface p-1 shadow-pill"
    >
      {tabs.map((t) => {
        const on = t.href === active;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-[13px] py-2 text-xs ${
              on
                ? "bg-ink font-semibold text-ground"
                : "font-medium text-ink-2 hover:bg-inset"
            }`}
          >
            {t.label}
            {t.alert && !on && t.count > 0 ? (
              <span className="tnum rounded-full bg-warn-surface px-[7px] py-0.5 text-[11px] font-semibold text-warn">
                {t.count}
              </span>
            ) : (
              <span className={`tnum ${on ? "opacity-75" : ""}`}>{t.count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export async function HoldingsTabs({
  active,
}: {
  active: "/inventory" | "/investments" | "/collection" | "/ripped";
}) {
  const supabase = await createClient();
  const count = () =>
    supabase.from("items").select("id", { count: "exact", head: true });
  const [inv, invest, keep, opened] = await Promise.all([
    count()
      .is("sale_date", null)
      .is("opened_at", null)
      .is("invested_at", null)
      .is("personal_at", null),
    count().not("invested_at", "is", null),
    count().not("personal_at", "is", null),
    count().not("opened_at", "is", null),
  ]);
  return (
    <Tabs
      label="Holdings"
      active={active}
      tabs={[
        { href: "/inventory", label: "Inventory", count: inv.count ?? 0 },
        { href: "/investments", label: "Investments", count: invest.count ?? 0 },
        { href: "/collection", label: "Collection", count: keep.count ?? 0 },
        { href: "/ripped", label: "Opened", count: opened.count ?? 0 },
      ]}
    />
  );
}

export async function SalesTabs({ active }: { active: "/sales" | "/pending" }) {
  const supabase = await createClient();
  const count = () =>
    supabase
      .from("items")
      .select("id", { count: "exact", head: true })
      .not("sale_date", "is", null);
  const [all, pending] = await Promise.all([
    count(),
    count().or("payment_received.eq.false,shipped.eq.false"),
  ]);
  return (
    <Tabs
      label="Sales views"
      active={active}
      tabs={[
        { href: "/sales", label: "All sales", count: all.count ?? 0 },
        {
          href: "/pending",
          label: "Pending",
          count: pending.count ?? 0,
          alert: true,
        },
      ]}
    />
  );
}
