-- ============================================================
-- Force-sync every GM/commissioner's player card to their correct
-- owned team, overwriting any stale/incorrect value left over from
-- manual drafting done before the auto-assignment fix existed.
-- Run this in the SQL Editor.
-- ============================================================

update players p
set team_id = pr.team_id
from profiles pr
where p.email = pr.email
  and pr.team_id is not null;
