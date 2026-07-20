-- Inventory & Sales Tracker schema
-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

create type item_category as enum ('general', 'card');
create type card_condition as enum ('raw', 'graded');

create table public.items (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category       item_category not null,
  name           text not null,
  description    text,
  purchase_price numeric(12,2) not null check (purchase_price >= 0),  -- total cost for the lot
  purchase_date  date,
  quantity       integer not null default 1 check (quantity >= 1),    -- lot size, sold as a unit

  -- card-only fields (null for general items)
  card_set       text,
  card_number    text,
  player         text,            -- player or character
  condition      card_condition,
  grade_company  text,            -- PSA, BGS, SGC, CGC, ...
  grade          text,            -- text so BGS half-grades like 9.5 work

  -- sale fields: all null = unsold; all set = sold
  sale_date      date,
  sale_platform  text,
  sale_payout    numeric(12,2) check (sale_payout >= 0),  -- NET total received

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint sale_fields_all_or_none check (
    (sale_date is null and sale_platform is null and sale_payout is null) or
    (sale_date is not null and sale_platform is not null and sale_payout is not null)
  )
);

create index items_user_id_idx   on public.items (user_id);
create index items_user_sold_idx on public.items (user_id, sale_date);

alter table public.items enable row level security;

create policy "users manage own items" on public.items
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create trigger items_set_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();
