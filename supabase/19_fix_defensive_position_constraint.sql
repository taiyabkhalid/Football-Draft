-- ============================================================
-- Fix: the live constraint said 'Rusher', but the app's dropdown
-- sends 'Rush'. Align the database to match the app.
-- Run this in the SQL Editor.
-- ============================================================

alter table players drop constraint players_defensive_position_check;
alter table players add constraint players_defensive_position_check
  check (defensive_position in ('CB', 'Safety', 'LB', 'Rush'));
