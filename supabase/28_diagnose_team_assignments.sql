-- ============================================================
-- Diagnostic: show every team, who's assigned to it, and whether
-- that person is a GM/commissioner (expected) or something else
-- (unexpected - would explain Winners showing 3 players).
-- Run this in the SQL Editor and share the result.
-- ============================================================

select
  t.name as team_name,
  p.full_name as player_name,
  p.email as player_email,
  pr.role as profile_role,
  pr.team_id as profile_team_id
from teams t
left join players p on p.team_id = t.id
left join profiles pr on pr.email = p.email
order by t.name, p.full_name;
