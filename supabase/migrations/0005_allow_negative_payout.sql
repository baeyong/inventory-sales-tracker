-- A sale's net payout can be negative (fees exceeding the sale price).
-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

alter table public.items drop constraint if exists items_sale_payout_check;
