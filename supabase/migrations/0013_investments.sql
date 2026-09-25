-- Investments: items you're holding long-term rather than flipping soon.
-- They leave Inventory for their own page but are still owned, unsold assets.
-- invested_at = the date it was moved to Investments (null = normal inventory).
alter table public.items add column invested_at date;
create index items_invested_at_idx on public.items (invested_at);
