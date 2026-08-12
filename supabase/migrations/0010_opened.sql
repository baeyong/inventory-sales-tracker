-- "For the Love of the Game": sealed product you rip open leaves inventory and
-- is tracked at cost. opened_at = the date it was opened (null = not opened).
alter table public.items add column opened_at date;
create index items_opened_at_idx on public.items (opened_at);
