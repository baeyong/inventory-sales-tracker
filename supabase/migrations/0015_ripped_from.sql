-- Link a pulled card back to the sealed box it came out of, so the box's cost
-- can be divided across everything pulled from it.
--
-- on delete set null: deleting a box must not delete the cards you pulled from
-- it — they stay in inventory, just unassigned.
-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

alter table public.items
  add column ripped_from_id uuid references public.items(id) on delete set null;

create index if not exists items_ripped_from_id_idx
  on public.items(ripped_from_id);
