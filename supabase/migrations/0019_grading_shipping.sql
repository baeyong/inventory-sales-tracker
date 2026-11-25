-- Shipping paid to send a submission in, kept apart from what the grader
-- charged. Like the fee, a submission's shipping is split evenly across its
-- cards and each share is part of that card's cost.
-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

alter table public.items add column grading_shipping numeric(12, 2);
