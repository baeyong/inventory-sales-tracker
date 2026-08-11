-- Per-item market-value lookup override.
-- market_platform: which marketplace to search (null = category default).
-- market_search:   search words override, or a full URL (null = auto-build
--                  the query from the item's own fields).
alter table public.items add column market_platform text;
alter table public.items add column market_search text;
