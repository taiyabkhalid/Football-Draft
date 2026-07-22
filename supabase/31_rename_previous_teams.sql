-- ============================================================
-- Rename previous_team values to match updated dropdown labels:
--   Warriors        -> Water Warriors
--   Huskies         -> City Huskies
--   Purple Dragons  -> Purple Cobras
-- 'None' is no longer a selectable option (removed from the app dropdown).
-- ============================================================

update players set previous_team = 'Water Warriors' where previous_team = 'Warriors';
update players set previous_team = 'City Huskies' where previous_team = 'Huskies';
update players set previous_team = 'Purple Cobras' where previous_team = 'Purple Dragons';
