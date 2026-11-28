-- Lots, locked cost allocation, year-end write-downs and Personal Collection
-- transfers — the records behind the Schedule C cost-of-goods-sold report.
-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run
--
-- Existing data is left exactly as it is: every new column on items is
-- nullable or defaults to 0, so current items stay standalone items at their
-- current cost. Money in the new tables and columns is integer cents (bigint).
--
-- Opening a lot, closing a year, reopening one and moving items to/from the
-- Personal Collection each run as one database function, so they happen
-- completely or not at all. The functions run as the calling user
-- (security invoker), so row-level security still applies inside them.

-- ---------------------------------------------------------------------------
-- Settings

create table public.user_settings (
  user_id              uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  bulk_threshold_cents integer not null default 300 check (bulk_threshold_cents >= 0),
  updated_at           timestamptz not null default now()
);

alter table public.user_settings enable row level security;
create policy "users manage own settings" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Lots: sealed purchases that get opened into items.
-- opened_on null = unopened, and then the lot is inventory at its own cost.

create table public.lots (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name              text not null,
  category          text not null default 'General',  -- default for pulled items
  purchased_on      date not null,
  purchase_platform text,
  total_cost_cents  bigint not null check (total_cost_cents >= 0),  -- incl. tax/shipping
  notes             text,
  receipt_path      text,          -- object in the private "receipts" bucket
  est_value_cents   bigint check (est_value_cents >= 0),  -- while unopened
  writedown_cents   bigint not null default 0 check (writedown_cents >= 0),
  opened_on         date,
  bulk_count        integer not null default 0 check (bulk_count >= 0),
  bulk_note         text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint lots_writedown_within_cost check (writedown_cents <= total_cost_cents)
);

create index lots_user_purchased_idx on public.lots (user_id, purchased_on);

alter table public.lots enable row level security;
create policy "users manage own lots" on public.lots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger lots_set_updated_at
  before update on public.lots
  for each row execute function public.set_updated_at();

-- Every allocation run, append-only: version 1 is the open, later versions are
-- re-allocations and must say why. lines = [{item_id, name, value_cents,
-- sellable, cost_cents}]. loss_cents = the whole basis when nothing was
-- sellable.
create table public.lot_allocations (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lot_id               uuid not null references public.lots(id) on delete cascade,
  version              integer not null check (version >= 1),
  allocated_on         date not null,
  reason               text,
  basis_cents          bigint not null,
  threshold_cents      integer not null,
  sellable_value_cents bigint not null,
  loss_cents           bigint not null default 0,
  bulk_count           integer not null default 0,
  lines                jsonb not null default '[]'::jsonb,
  created_at           timestamptz not null default now(),
  unique (lot_id, version),
  constraint lot_allocations_reason_on_reallocate check (version = 1 or reason is not null)
);

alter table public.lot_allocations enable row level security;
-- No update/delete policies: the log can only grow.
create policy "users read own allocations" on public.lot_allocations
  for select using (auth.uid() = user_id);
create policy "users add own allocations" on public.lot_allocations
  for insert with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Items: link to a lot, write-downs, and the sale's fee breakdown.
-- sale_payout stays the net figure profit is measured from.

alter table public.items
  add column lot_id uuid references public.lots(id) on delete restrict,
  add column writedown_cents bigint not null default 0 check (writedown_cents >= 0),
  add column sale_gross_cents bigint check (sale_gross_cents >= 0),
  add column sale_fees_cents bigint check (sale_fees_cents >= 0),
  add column sale_shipping_cents bigint check (sale_shipping_cents >= 0);

create index items_lot_id_idx on public.items (lot_id);

-- ---------------------------------------------------------------------------
-- Year-end close: a dated snapshot per tax year. One live close per year;
-- reopening keeps the row (reopened_at set) and reverses its write-downs.

create table public.year_end_closes (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tax_year           integer not null check (tax_year between 2000 and 2100),
  closed_on          date not null,
  basis_before_cents bigint not null default 0,
  market_cents       bigint not null default 0,
  writedown_cents    bigint not null default 0,
  ending_cents       bigint not null default 0,
  reopened_at        timestamptz,
  reopen_reason      text,
  created_at         timestamptz not null default now()
);

create unique index year_end_closes_one_live
  on public.year_end_closes (user_id, tax_year) where reopened_at is null;

alter table public.year_end_closes enable row level security;
create policy "users read own closes" on public.year_end_closes
  for select using (auth.uid() = user_id);
create policy "users add own closes" on public.year_end_closes
  for insert with check (auth.uid() = user_id);
create policy "users update own closes" on public.year_end_closes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.year_end_lines (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  close_id           uuid not null references public.year_end_closes(id) on delete cascade,
  kind               text not null check (kind in ('item', 'lot')),
  item_id            uuid references public.items(id) on delete set null,
  lot_id             uuid references public.lots(id) on delete set null,
  name               text not null,   -- kept so history survives a delete
  category           text,
  basis_before_cents bigint not null,
  market_cents       bigint not null,
  writedown_cents    bigint not null check (writedown_cents >= 0),
  basis_after_cents  bigint not null
);

create index year_end_lines_close_idx on public.year_end_lines (close_id);
create index year_end_lines_item_idx on public.year_end_lines (item_id);
create index year_end_lines_lot_idx on public.year_end_lines (lot_id);

alter table public.year_end_lines enable row level security;
create policy "users read own close lines" on public.year_end_lines
  for select using (auth.uid() = user_id);
create policy "users add own close lines" on public.year_end_lines
  for insert with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Moves between business inventory and the Personal Collection, at the
-- item's basis that day. Append-only. Items already in the collection before
-- this migration have no record; the report counts them from personal_at.

create table public.inventory_transfers (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_id        uuid references public.items(id) on delete set null,
  name           text not null,
  direction      text not null check (direction in ('to_personal', 'to_inventory')),
  transferred_on date not null,
  basis_cents    bigint not null,
  created_at     timestamptz not null default now()
);

create index inventory_transfers_user_date_idx on public.inventory_transfers (user_id, transferred_on);
create index inventory_transfers_item_idx on public.inventory_transfers (item_id);

alter table public.inventory_transfers enable row level security;
create policy "users read own transfers" on public.inventory_transfers
  for select using (auth.uid() = user_id);
create policy "users add own transfers" on public.inventory_transfers
  for insert with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Receipts: a private bucket, one folder per user (<user id>/<file>).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

create policy "users read own receipts" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users upload own receipts" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users delete own receipts" on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- allocate_lot: open a lot (version 1) or re-allocate it (later versions).
--
-- p_lines: [{item_id?, name, category?, value_cents, sellable, cost_cents}]
--   - lines without item_id create new items (must be sellable — bulk is
--     only counted, never created)
--   - on a re-allocation every item already in the lot must be listed
-- The costs are worked out by the app (src/lib/allocation.ts); this checks
-- they add up to the lot's basis before writing anything.

create or replace function public.allocate_lot(
  p_lot_id          uuid,
  p_allocated_on    date,
  p_reason          text,
  p_threshold_cents integer,
  p_bulk_count      integer,
  p_bulk_note       text,
  p_lines           jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_lot            public.lots%rowtype;
  v_basis          bigint;
  v_version        integer;
  v_cost_sum       bigint;
  v_sellable_value bigint;
  v_loss           bigint;
  v_line           jsonb;
  v_item_id        uuid;
  v_category       text;
  v_existing       integer;
  v_listed         integer;
  v_out            jsonb := '[]'::jsonb;
begin
  select * into v_lot from public.lots
   where id = p_lot_id and user_id = auth.uid()
   for update;
  if not found then
    raise exception 'Lot not found.';
  end if;
  if jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Lines must be a list.';
  end if;

  v_basis := v_lot.total_cost_cents - v_lot.writedown_cents;
  select coalesce(max(version), 0) + 1 into v_version
    from public.lot_allocations where lot_id = p_lot_id;

  if v_version = 1 then
    if v_lot.opened_on is not null then
      raise exception 'This lot is already open.';
    end if;
    if exists (select 1 from jsonb_array_elements(p_lines) l where l ? 'item_id' and l->>'item_id' is not null) then
      raise exception 'Opening a lot only adds new items.';
    end if;
  else
    if p_reason is null or btrim(p_reason) = '' then
      raise exception 'Say why you are re-allocating.';
    end if;
    select count(*) into v_existing from public.items where lot_id = p_lot_id;
    select count(distinct i.id) into v_listed
      from jsonb_array_elements(p_lines) l
      join public.items i on i.id = (l->>'item_id')::uuid and i.lot_id = p_lot_id
     where l->>'item_id' is not null;
    if v_listed <> v_existing then
      raise exception 'A re-allocation must include every item already in the lot.';
    end if;
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_lines) l
     where (l->>'cost_cents')::bigint < 0
        or (l->>'value_cents')::bigint < 0
        or ((l->>'sellable')::boolean and (l->>'value_cents')::bigint = 0)
        or (not (l->>'sellable')::boolean and (l->>'cost_cents')::bigint <> 0)
        or (l->>'item_id' is null and not (l->>'sellable')::boolean)
        or (l->>'item_id' is null and coalesce(btrim(l->>'name'), '') = '')
  ) then
    raise exception 'Invalid allocation line.';
  end if;

  select coalesce(sum((l->>'cost_cents')::bigint), 0),
         coalesce(sum(case when (l->>'sellable')::boolean then (l->>'value_cents')::bigint else 0 end), 0)
    into v_cost_sum, v_sellable_value
    from jsonb_array_elements(p_lines) l;

  if v_sellable_value = 0 then
    v_loss := v_basis;
    if v_cost_sum <> 0 then
      raise exception 'With nothing sellable, every cost must be 0.';
    end if;
  else
    v_loss := 0;
    if v_cost_sum <> v_basis then
      raise exception 'Allocated costs (%) must add up to the lot''s cost (%).', v_cost_sum, v_basis;
    end if;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    if v_line->>'item_id' is not null then
      v_item_id := (v_line->>'item_id')::uuid;
      update public.items
         set purchase_price = (v_line->>'cost_cents')::bigint / 100.0,
             est_value = round((v_line->>'value_cents')::bigint / 100.0, 2)
       where id = v_item_id and lot_id = p_lot_id;
    else
      v_category := coalesce(nullif(btrim(v_line->>'category'), ''), v_lot.category);
      insert into public.items (
        user_id, lot_id, category, name, purchase_price, purchase_date,
        purchase_platform, est_value, quantity, condition
      ) values (
        auth.uid(), p_lot_id, v_category, btrim(v_line->>'name'),
        (v_line->>'cost_cents')::bigint / 100.0, v_lot.purchased_on,
        v_lot.purchase_platform, round((v_line->>'value_cents')::bigint / 100.0, 2), 1,
        case when v_category ~* 'card' then 'raw'::card_condition end
      ) returning id into v_item_id;
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'item_id', v_item_id,
      'name', coalesce(btrim(v_line->>'name'), ''),
      'value_cents', (v_line->>'value_cents')::bigint,
      'sellable', (v_line->>'sellable')::boolean,
      'cost_cents', (v_line->>'cost_cents')::bigint
    ));
  end loop;

  update public.lots
     set opened_on = coalesce(opened_on, p_allocated_on),
         bulk_count = greatest(coalesce(p_bulk_count, 0), 0),
         bulk_note = nullif(btrim(coalesce(p_bulk_note, '')), '')
   where id = p_lot_id;

  insert into public.lot_allocations (
    user_id, lot_id, version, allocated_on, reason, basis_cents,
    threshold_cents, sellable_value_cents, loss_cents, bulk_count, lines
  ) values (
    auth.uid(), p_lot_id, v_version, p_allocated_on,
    nullif(btrim(coalesce(p_reason, '')), ''), v_basis, p_threshold_cents,
    v_sellable_value, v_loss, greatest(coalesce(p_bulk_count, 0), 0), v_out
  );

  return jsonb_build_object('version', v_version, 'loss_cents', v_loss);
end
$$;

-- ---------------------------------------------------------------------------
-- close_year: save the year-end snapshot and apply its write-downs.
--
-- p_lines: [{kind, id, name, category, basis_before_cents, market_cents,
--            update_estimate}]
-- The write-down is recomputed here (never write up), and pushed onto the
-- item's or lot's writedown_cents so it becomes the basis from now on.

create or replace function public.close_year(
  p_tax_year  integer,
  p_closed_on date,
  p_lines     jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_close_id uuid;
  v_line     jsonb;
  v_basis    bigint;
  v_market   bigint;
  v_wd       bigint;
  v_id       uuid;
  v_lot      public.lots%rowtype;
  v_t_basis  bigint := 0;
  v_t_market bigint := 0;
  v_t_wd     bigint := 0;
begin
  if exists (select 1 from public.year_end_closes
              where user_id = auth.uid() and tax_year > p_tax_year and reopened_at is null) then
    raise exception 'A later year is already closed. Reopen it first.';
  end if;
  if exists (select 1 from public.year_end_closes
              where user_id = auth.uid() and tax_year = p_tax_year and reopened_at is null) then
    raise exception '% is already closed.', p_tax_year;
  end if;

  insert into public.year_end_closes (user_id, tax_year, closed_on)
  values (auth.uid(), p_tax_year, p_closed_on)
  returning id into v_close_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_id := (v_line->>'id')::uuid;
    v_basis := (v_line->>'basis_before_cents')::bigint;
    v_market := (v_line->>'market_cents')::bigint;
    if v_market < 0 or v_basis < 0 then
      raise exception 'Amounts must be 0 or more.';
    end if;
    v_wd := greatest(v_basis - v_market, 0);

    if v_line->>'kind' = 'item' then
      update public.items
         set writedown_cents = writedown_cents + v_wd,
             est_value = case when (v_line->>'update_estimate')::boolean
                              then round(v_market / 100.0, 2) else est_value end
       where id = v_id and user_id = auth.uid();
      if not found then
        raise exception 'Item % not found.', v_id;
      end if;
    elsif v_line->>'kind' = 'lot' then
      select * into v_lot from public.lots where id = v_id and user_id = auth.uid() for update;
      if not found then
        raise exception 'Lot % not found.', v_id;
      end if;
      if v_wd > 0 and v_lot.opened_on is not null then
        raise exception 'Lot "%" has been opened, so it can''t be written down.', v_lot.name;
      end if;
      update public.lots
         set writedown_cents = writedown_cents + v_wd,
             est_value_cents = case when (v_line->>'update_estimate')::boolean
                                    then v_market else est_value_cents end
       where id = v_id;
    else
      raise exception 'Unknown line kind.';
    end if;

    insert into public.year_end_lines (
      user_id, close_id, kind, item_id, lot_id, name, category,
      basis_before_cents, market_cents, writedown_cents, basis_after_cents
    ) values (
      auth.uid(), v_close_id, v_line->>'kind',
      case when v_line->>'kind' = 'item' then v_id end,
      case when v_line->>'kind' = 'lot' then v_id end,
      coalesce(v_line->>'name', ''), v_line->>'category',
      v_basis, v_market, v_wd, v_basis - v_wd
    );

    v_t_basis := v_t_basis + v_basis;
    v_t_market := v_t_market + v_market;
    v_t_wd := v_t_wd + v_wd;
  end loop;

  update public.year_end_closes
     set basis_before_cents = v_t_basis,
         market_cents = v_t_market,
         writedown_cents = v_t_wd,
         ending_cents = v_t_basis - v_t_wd
   where id = v_close_id;

  return v_close_id;
end
$$;

-- reopen_year: mark a close superseded and reverse its write-downs. Only the
-- latest closed year can be reopened, and not once a written-down lot has
-- been opened (its cost is already split across items).

create or replace function public.reopen_year(
  p_close_id uuid,
  p_reason   text
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_close public.year_end_closes%rowtype;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Say why you are reopening the year.';
  end if;
  select * into v_close from public.year_end_closes
   where id = p_close_id and user_id = auth.uid() and reopened_at is null
   for update;
  if not found then
    raise exception 'That close was not found or is already reopened.';
  end if;
  if exists (select 1 from public.year_end_closes
              where user_id = auth.uid() and tax_year > v_close.tax_year and reopened_at is null) then
    raise exception 'Reopen the later year first.';
  end if;
  if exists (select 1 from public.year_end_lines l
               join public.lots lt on lt.id = l.lot_id
              where l.close_id = p_close_id and l.writedown_cents > 0 and lt.opened_on is not null) then
    raise exception 'A lot written down in this close has since been opened, so the close can''t be reversed.';
  end if;

  update public.items i
     set writedown_cents = greatest(i.writedown_cents - l.writedown_cents, 0)
    from public.year_end_lines l
   where l.close_id = p_close_id and l.item_id = i.id and l.writedown_cents > 0;

  update public.lots t
     set writedown_cents = greatest(t.writedown_cents - l.writedown_cents, 0)
    from public.year_end_lines l
   where l.close_id = p_close_id and l.lot_id = t.id and l.writedown_cents > 0;

  update public.year_end_closes
     set reopened_at = now(), reopen_reason = btrim(p_reason)
   where id = p_close_id;
end
$$;

-- move_to_personal / move_from_personal: flip personal_at and record the
-- transfer at the item's basis, together.

create or replace function public.move_to_personal(
  p_ids uuid[],
  p_on  date
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  with moved as (
    update public.items
       set personal_at = p_on
     where id = any(p_ids)
       and user_id = auth.uid()
       and sale_date is null
       and opened_at is null
       and invested_at is null
       and personal_at is null
    returning id, name, purchase_price, grading_cost, grading_shipping, writedown_cents
  )
  insert into public.inventory_transfers (user_id, item_id, name, direction, transferred_on, basis_cents)
  select auth.uid(), id, name, 'to_personal', p_on,
         round((purchase_price + coalesce(grading_cost, 0) + coalesce(grading_shipping, 0)) * 100)::bigint
           - writedown_cents
    from moved;
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

create or replace function public.move_from_personal(
  p_ids uuid[],
  p_on  date
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  with moved as (
    update public.items
       set personal_at = null
     where id = any(p_ids)
       and user_id = auth.uid()
       and personal_at is not null
    returning id, name, purchase_price, grading_cost, grading_shipping, writedown_cents
  )
  insert into public.inventory_transfers (user_id, item_id, name, direction, transferred_on, basis_cents)
  select auth.uid(), id, name, 'to_inventory', p_on,
         round((purchase_price + coalesce(grading_cost, 0) + coalesce(grading_shipping, 0)) * 100)::bigint
           - writedown_cents
    from moved;
  get diagnostics v_count = row_count;
  return v_count;
end
$$;
