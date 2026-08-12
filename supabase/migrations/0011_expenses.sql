-- Miscellaneous business expenses (supplies, shipping materials, fees, …).
-- Separate from items: these aren't inventory, they're deductible costs that
-- feed the Tax Summary. Mirrors the user's expense sheet: name, amount,
-- date, source, notes.
create table public.expenses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  amount      numeric(12,2) not null default 0 check (amount >= 0),
  spent_on    date,            -- when it was bought
  source      text,            -- where it was bought from
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index expenses_user_id_idx on public.expenses (user_id);

alter table public.expenses enable row level security;

create policy "users manage own expenses" on public.expenses
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();
