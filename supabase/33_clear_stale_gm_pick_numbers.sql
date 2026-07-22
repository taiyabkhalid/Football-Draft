-- ============================================================
-- Clean up stale draft_pick_number values on GM/commissioner rows.
-- Two players (Tom GM1 on Seahawks, Taiyab Khalid/commissioner on
-- Storm 2.0) had draft_pick_number = 2 left over from early testing,
-- even though they were never actually drafted through the app —
-- they were auto-assigned to their team as GM/commissioner.
-- This caused them to sort AFTER real draft picks in "View by Team"
-- instead of being anchored first. The app-side sort logic has
-- also been made independent of this field going forward (it now
-- anchors on profiles.role rather than draft_pick_number), but this
-- migration clears the bad historical data too.
-- ============================================================

update players
set draft_pick_number = null
where email in (select email from profiles where team_id is not null)
and draft_pick_number is not null;
