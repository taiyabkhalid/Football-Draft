-- ============================================================
-- Auth & Role-Based Permissions
-- Run this AFTER schema.sql, in the same SQL Editor
-- ============================================================

-- Links a Supabase Auth login to a role and (for GMs) a team
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('gm','commissioner')),
  team_id uuid references teams(id),  -- only set for role = 'gm'
  created_at timestamptz default now()
);

alter table profiles enable row level security;

-- Anyone logged in can see the full profiles list (needed so the app can
-- show "which GM manages which team" on the draft board)
create policy "Logged in users can read profiles" on profiles
  for select using (auth.role() = 'authenticated');

-- Only the commissioner can create/edit profiles (i.e. assign GMs to teams)
create policy "Commissioner manages profiles" on profiles
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'commissioner')
  ) with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'commissioner')
  );

-- ============================================================
-- Replace the wide-open policies from schema.sql with role-based ones
-- ============================================================

-- TEAMS: everyone can view (needed for draft board), but only the owning
-- GM or the commissioner can edit a team (e.g. rename it)
drop policy if exists "Allow all writes" on teams;

create policy "GM edits own team, commissioner edits any" on teams
  for update using (
    id = (select team_id from profiles where id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and role = 'commissioner')
  ) with check (
    id = (select team_id from profiles where id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and role = 'commissioner')
  );

create policy "Only commissioner creates/deletes teams" on teams
  for insert with check (
    exists (select 1 from profiles where id = auth.uid() and role = 'commissioner')
  );

create policy "Only commissioner deletes teams" on teams
  for delete using (
    exists (select 1 from profiles where id = auth.uid() and role = 'commissioner')
  );

-- PLAYERS: registration stays fully open (players fill out their own
-- profile without logging in). Editing is more restricted:
--   - The commissioner can edit/remove any player (e.g. "no longer playing")
--   - A GM can only assign a player to THEIR OWN team (i.e. drafting),
--     and only to a currently-undrafted player
drop policy if exists "Allow all writes" on players;

create policy "Anyone can register as a player" on players
  for insert with check (true);

create policy "GM drafts to own team, commissioner edits any" on players
  for update using (
    team_id is null  -- undrafted players can be picked up
    or team_id = (select team_id from profiles where id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and role = 'commissioner')
  ) with check (
    team_id = (select team_id from profiles where id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and role = 'commissioner')
  );

create policy "Only commissioner deletes players" on players
  for delete using (
    exists (select 1 from profiles where id = auth.uid() and role = 'commissioner')
  );

-- DRAFT SETTINGS: only the commissioner can change league-wide rules
drop policy if exists "Allow all writes" on draft_settings;

create policy "Only commissioner edits settings" on draft_settings
  for update using (
    exists (select 1 from profiles where id = auth.uid() and role = 'commissioner')
  ) with check (
    exists (select 1 from profiles where id = auth.uid() and role = 'commissioner')
  );

-- DRAFT PICKS: a GM can log a pick only for their own team; commissioner can log/edit any
drop policy if exists "Allow all writes" on draft_picks;

create policy "GM logs own team's pick, commissioner logs any" on draft_picks
  for insert with check (
    team_id = (select team_id from profiles where id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and role = 'commissioner')
  );

create policy "Only commissioner edits/deletes pick history" on draft_picks
  for update using (
    exists (select 1 from profiles where id = auth.uid() and role = 'commissioner')
  );

create policy "Only commissioner deletes picks" on draft_picks
  for delete using (
    exists (select 1 from profiles where id = auth.uid() and role = 'commissioner')
  );
