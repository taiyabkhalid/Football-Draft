-- ============================================================
-- Combined diagnostic: show every check constraint definition on
-- the players table at once, to compare against what the app's
-- dropdowns actually send.
--
-- App expects exactly these values:
--   offensive_position:      QB, WR, C
--   defensive_position:      CB, Safety, LB, Rush
--   position_preference:     Offense only, Defense only, Both
--   gender:                  M, F
--   injury_status:           None, Recovering, Injured
--   game_time_unavailable:   7 PM game, 8 PM game, 9 PM game, Available for all
--
-- Run this in the SQL Editor and share the result.
-- ============================================================

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'players'::regclass
  and contype = 'c'
order by conname;
