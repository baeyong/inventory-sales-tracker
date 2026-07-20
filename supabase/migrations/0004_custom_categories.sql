-- Categories become free text so users can define their own.
-- Card-specific fields (set, number, grade…) apply to any category whose
-- name contains "card".
-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

alter table public.items alter column category type text using category::text;

update public.items set category = 'General' where category = 'general';
update public.items set category = 'Cards' where category = 'card';

alter table public.items alter column category set default 'General';

drop type item_category;
