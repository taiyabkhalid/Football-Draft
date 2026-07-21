-- ============================================================
-- Reset the draft for fresh testing.
-- - Clears all draft pick history (also resets the pick counter,
--   since it's calculated from the number of picks).
-- - Returns every drafted player to the available pool, EXCEPT
--   GMs/commissioner, who stay on their own team as intended.
-- - Resets draft status back to not_started so you can restart
--   cleanly (re-randomize order, etc.).
-- Run this in the SQL Editor.
-- ============================================================

-- Clear pick history
delete from draft_picks;

-- Return drafted players to the pool - but NOT gm/commissioner,
-- who are meant to stay assigned to their own team regardless
update players
set team_id = null, draft_pick_number = null
where email not in (select email from profiles where team_id is not null);

-- Reset draft status so you can start fresh
update draft_settings set draft_status = 'not_started' where id = 1;

-- Optional: also clear the draft order, if you want to re-randomize
-- it fresh next time (uncomment to run)
-- update teams set draft_position = null;
