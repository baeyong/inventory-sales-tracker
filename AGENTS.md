<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- Everything below is hand-written. The block above is generated; don't edit it. -->

# How to work in this repo

This is one person's tracker, not a platform. It should stay small enough that
one person can read all of it. Fewer concepts beats more flexibility.

## Scope

- Make the smallest change that does the job. Nothing speculative — no options,
  config flags, or abstractions for a future that hasn't arrived.
- Don't restructure code you weren't asked to touch. If you spot a problem,
  say so and let the owner decide.
- Don't add a dependency without asking first. The current list is short on
  purpose.
- Deleting code counts as progress. Dead code is a bug: `src/lib/supabase/client.ts`
  is imported nowhere and should go.
- Nothing paid. No per-call APIs or subscription services.

## Don't copy a component — extract it

The worst code here is copy-paste. `RippedTable`, `InvestmentsTable` and
`CollectionTable` are the same component three times over; the last two differ
by about sixteen lines. That happened one "just like the last one" at a time.

- A new page that needs an existing table with different columns means
  **factor out the shared shell** (search, sort, mobile cards, empty state) —
  not another 200-line copy.
- Reuse what exists: `SortHeader`, `MobileSort`, `PageStats`, `formatMoney`,
  `formatDate`, `matchesSearch`, `sortItems`.
- A second copy is a smell. A third is a refactor you do before adding yours.

Two files are already too big: `src/app/(app)/actions.ts` (~1,300 lines) and
`src/components/SalesTable.tsx` (~930). They should shrink, not grow. Prefer
extracting over appending.

## Follow the existing grain

These patterns are settled. Match them instead of inventing a parallel way:

- **Reads** happen in Server Components, which query Supabase directly and pass
  plain props down to client components.
- **Writes** go through server actions in `src/app/(app)/actions.ts`. No route
  handlers (the auth callback is the sole exception), no querying the database
  from the browser.
- **Validation** is Zod. Form actions return `{ error, values }` so a failed
  submit doesn't wipe what was typed.
- **Security** is row-level security in Postgres — every table has a
  `auth.uid() = user_id` policy. Actions still add `.eq("user_id", user.id)`;
  keep both.
- **Lifecycle state** is a nullable date column on `items` (`sale_date`,
  `opened_at`, `invested_at`, `personal_at`). They're mutually exclusive, and
  that's guarded in the action with `.is(...)` — the database doesn't enforce
  it, so don't skip the guard.
- **Money** is `numeric(12,2)`, rendered with `formatMoney`. Dates render with
  `formatDate`.
- **Schema changes** need a new numbered file in `supabase/migrations/`. They
  are applied by hand in the Supabase SQL editor, so always say which migration
  has to be run, and remember a code rollback won't undo it.

## Comments

Explain *why*, never *what*. The existing comments are the standard: they
record the decision or the trap, not a narration of the line below. Don't
remove them to tidy up.

## Finishing

- `npx tsc --noEmit` and `npm run build` must both pass before you call
  something done.
- Say plainly what you did not verify — an unrun migration, a missing API key,
  a path you couldn't exercise. Don't imply more confidence than you have.
- Every change goes on a branch and lands on `master` through a pull request
  the owner merges. Never commit straight to `master`; merging is what deploys.
