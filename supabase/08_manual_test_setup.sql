-- ============================================================
-- Manual test setup: start the draft and assign a draft order.
-- Run this in the SQL Editor to test the /draft page before the
-- commissioner settings page exists.
-- ============================================================

-- Part A: mark the draft as in progress
update draft_settings set draft_status = 'in_progress' where id = 1;

-- Part B: assign a draft order (1, 2, 3...) to every team,
-- in whatever order they currently appear
with numbered as (
  select id, row_number() over (order by created_at) as rn
  from teams
)
update teams
set draft_position = numbered.rn
from numbered
where teams.id = numbered.id;

-- Quick check: confirm both worked
select name, draft_position from teams order by draft_position;
select draft_status from draft_settings;
