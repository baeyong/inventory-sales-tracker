-- Submission ID: the cards sent to a grader together share one, so two
-- submissions on the same day stay separate and a card keeps its batch even if
-- its sent date is corrected later.
-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

alter table public.items add column submission_id uuid;

-- Cards already sent were grouped by sent date + company; give each of those
-- groups its own ID so they stay together exactly as before.
with groups as (
  select user_id, grading_submitted_at, grade_company, gen_random_uuid() as sid
  from public.items
  where grading_submitted_at is not null
  group by user_id, grading_submitted_at, grade_company
)
update public.items i
set submission_id = g.sid
from groups g
where i.user_id = g.user_id
  and i.grading_submitted_at = g.grading_submitted_at
  and i.grade_company is not distinct from g.grade_company;

create index items_user_submission_idx on public.items (user_id, submission_id);
