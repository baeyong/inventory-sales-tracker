-- Whether an unsold item has been listed for sale yet.
-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

alter table public.items add column listed boolean not null default false;
