-- Cached eBay price comps per item, pulled on demand via the eBay Browse API.
-- Currently active-listing prices; swappable for sold comps (Marketplace
-- Insights) later without schema changes. checked_at gates the hourly refresh.
alter table public.items add column ebay_comp_low numeric(12,2);
alter table public.items add column ebay_comp_median numeric(12,2);
alter table public.items add column ebay_comp_high numeric(12,2);
alter table public.items add column ebay_comp_count integer;
alter table public.items add column ebay_comp_checked_at timestamptz;
