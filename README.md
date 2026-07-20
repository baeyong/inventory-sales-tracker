# 📦 Resale Tracker

Personal inventory & sales tracker for reselling — sneakers, sports cards,
Pokémon cards, and everything else worth flipping.

**Live app:** https://inventory-sales-tracker-beta.vercel.app/

## What it does

- **Inventory** — every item you own: cost, where you bought it, category,
  card details (set / number / grade), and whether it's listed for sale yet
- **Sales** — payouts, profit per item, and Paid / Shipped checkboxes
- **Pending** — a to-do board of sales still waiting on money or shipping
- **Dashboard** — realized profit, monthly profit chart, and per-category
  breakdown
- **Import** — upload any spreadsheet (.xlsx / .csv); columns are matched by
  fuzzy guessing plus a short clarifying chat, duplicates are detected,
  categories are auto-inferred from item names, and re-imports fill in
  missing details instead of duplicating
- **Filters & search** — date / category / listed filters, plus typo-tolerant
  live search across all item fields

## Stack

- [Next.js](https://nextjs.org) (App Router) — hosted on Vercel
- [Supabase](https://supabase.com) — Postgres, auth, row-level security
- Tailwind CSS, Recharts, SheetJS, Zod

## Local development

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and fill in the Supabase project URL and
anon key (Supabase dashboard → Project Settings → Data API / API Keys).

## Database migrations

Schema lives in [`supabase/migrations/`](supabase/migrations/). Migrations are
applied manually: paste each file into the Supabase **SQL Editor** in numeric
order. When a code change ships with a new migration file, run it **before**
deploying.

## Deploying

Pushes to `master` auto-deploy via Vercel:

```bash
git add -A
git commit -m "describe the change"
git push
```

Production environment variables (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`) are configured in the Vercel project
settings, not in the repo.
