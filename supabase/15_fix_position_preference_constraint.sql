-- ============================================================
-- Fix: the live constraint said 'Both Offense and Defense', but the
-- app's dropdown sends 'Both'. Align the database to match the app.
-- Run this in the SQL Editor.
-- ============================================================

alter table players drop constraint players_position_preference_check;
alter table players add constraint players_position_preference_check
  check (position_preference in ('Offense only', 'Defense only', 'Both'));
