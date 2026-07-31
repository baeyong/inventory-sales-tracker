-- Groups items that were sold together in one bundle sale, so the Sales page
-- can show what each item was bundled with.
-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

alter table public.items add column bundle_id uuid;

create index items_bundle_id_idx on public.items (bundle_id);
