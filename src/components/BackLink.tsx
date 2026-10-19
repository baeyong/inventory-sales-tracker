import Link from "next/link";

/** "‹ Inventory" above a detail or form page. */
export default function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 self-start text-[13px] text-ink-2 hover:text-ink"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path
          d="M7.5 2 L3.5 6 L7.5 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
      {label}
    </Link>
  );
}
