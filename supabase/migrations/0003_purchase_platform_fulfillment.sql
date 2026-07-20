-- Where an item was bought, and per-sale fulfillment flags.
-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

alter table public.items
  add column purchase_platform text,
  add column payment_received boolean not null default false,
  add column shipped boolean not null default false;
