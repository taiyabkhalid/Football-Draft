-- ============================================================
-- Support for player login + profile page.
-- Run this in the SQL Editor.
-- ============================================================

-- Draft date/time, for the "draft night" banner on the profile page
alter table draft_settings add column if not exists draft_datetime timestamptz;

-- Commissioner override to force-unlock profile editing
-- (e.g. after the draft, or to fix a mistake before the 2-hour lock)
alter table draft_settings add column if not exists profile_edits_unlocked_override boolean not null default false;

-- Let a logged-in player update only their own player row,
-- matched by email (not by team, unlike the GM/commissioner policy)
create policy "Player edits own row" on players
  for update using (email = auth.email())
  with check (email = auth.email());
