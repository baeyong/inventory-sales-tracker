-- Style code for sneakers (e.g. "DZ5485-612"): the manufacturer's SKU, which
-- StockX and GOAT search by exactly, so the value lookup lands on the right
-- shoe instead of a fuzzy name match.
-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

alter table public.items add column style_code text;
