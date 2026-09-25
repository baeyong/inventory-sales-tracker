-- Personal Collection: keepers you are not selling at all. Like Investments
-- they leave Inventory, but they are not business stock held for sale, so the
-- Tax Summary reports their cost on its own line.
-- personal_at = the date it was moved there (null = not in the collection).
-- Nothing is backfilled: items move over by hand from Inventory.
alter table public.items add column personal_at date;
create index items_personal_at_idx on public.items (personal_at);
