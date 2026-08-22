-- What you reckon an item is worth right now, typed in by hand from comps.
-- Nullable: most items won't have an estimate, and null must stay distinct
-- from 0 so "worthless" and "not yet valued" don't look the same.
-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

alter table public.items add column est_value numeric;
