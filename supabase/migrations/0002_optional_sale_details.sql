-- Sold items no longer require a payout or platform: a sale is defined by
-- its date, and details can be filled in later (e.g. by a second import).
-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

alter table public.items drop constraint sale_fields_all_or_none;

alter table public.items add constraint sale_fields_require_date check (
  sale_date is not null or (sale_platform is null and sale_payout is null)
);
