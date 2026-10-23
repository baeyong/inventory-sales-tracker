-- Grading: plan which raw cards are worth sending in, track them at the
-- grader, and add the fee to the card's cost once it's paid.
-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run
--
-- grading_cost:          what grading this card actually cost (tier + shipping),
--                        added on top of purchase_price for profit. Null = never
--                        sent in; kept apart so the original price survives.
-- plan_to_grade:         a raw card you're weighing up for grading.
-- grade_values:          what it's worth at each grade, e.g.
--                        {"raw": 20, "10": 150, "9": 60, "8": 35}
-- grade_odds:            your % chance of each grade, e.g. {"10": 40, "9": 50}
-- grade_pop:             PSA pop counts, for reference, e.g. {"10": 80, "9": 1200}
-- grading_submitted_at:  sent to the grader (null = not sent)
-- grading_returned_at:   came back (null = still out)
-- grade_predicted:       the grade you expected when you sent it in
-- cert_number:           the slab's certification number

alter table public.items add column grading_cost numeric check (grading_cost >= 0);
alter table public.items add column plan_to_grade boolean not null default false;
alter table public.items add column grade_values jsonb;
alter table public.items add column grade_odds jsonb;
alter table public.items add column grade_pop jsonb;
alter table public.items add column grading_submitted_at date;
alter table public.items add column grading_returned_at date;
alter table public.items add column grade_predicted text;
alter table public.items add column cert_number text;
