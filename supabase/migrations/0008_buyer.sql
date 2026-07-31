-- Who each item was sold to (name or username).
-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

alter table public.items add column buyer text;
