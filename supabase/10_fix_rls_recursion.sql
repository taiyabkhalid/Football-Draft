-- ============================================================
-- Fix: infinite recursion in RLS policies.
-- The previous policies checked "is this user a commissioner?" by
-- querying the profiles table from WITHIN a profiles policy (and
-- from policies on other tables), which under RLS re-triggers the
-- same policy check forever. These two functions run with elevated
-- privileges internally (bypassing RLS for just this one lookup),
-- breaking the loop.
-- Run this in the SQL Editor.
-- ============================================================

create or replace function public.my_profile_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.my_profile_team_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select team_id from public.profiles where id = auth.uid();
$$;

-- ---- Rebuild every policy that previously queried profiles directly ----

drop policy if exists "Commissioner manages profiles" on profiles;
create policy "Commissioner manages profiles" on profiles
  for all using (public.my_profile_role() = 'commissioner')
  with check (public.my_profile_role() = 'commissioner');

drop policy if exists "GM edits own team, commissioner edits any" on teams;
create policy "GM edits own team, commissioner edits any" on teams
  for update using (
    id = public.my_profile_team_id() or public.my_profile_role() = 'commissioner'
  ) with check (
    id = public.my_profile_team_id() or public.my_profile_role() = 'commissioner'
  );

drop policy if exists "Only commissioner creates/deletes teams" on teams;
create policy "Only commissioner creates/deletes teams" on teams
  for insert with check (public.my_profile_role() = 'commissioner');

drop policy if exists "Only commissioner deletes teams" on teams;
create policy "Only commissioner deletes teams" on teams
  for delete using (public.my_profile_role() = 'commissioner');

drop policy if exists "GM drafts to own team, commissioner edits any" on players;
create policy "GM drafts to own team, commissioner edits any" on players
  for update using (
    team_id is null
    or team_id = public.my_profile_team_id()
    or public.my_profile_role() = 'commissioner'
  ) with check (
    team_id = public.my_profile_team_id() or public.my_profile_role() = 'commissioner'
  );

drop policy if exists "Only commissioner deletes players" on players;
create policy "Only commissioner deletes players" on players
  for delete using (public.my_profile_role() = 'commissioner');

drop policy if exists "Only commissioner edits settings" on draft_settings;
create policy "Only commissioner edits settings" on draft_settings
  for update using (public.my_profile_role() = 'commissioner')
  with check (public.my_profile_role() = 'commissioner');

drop policy if exists "GM logs own team's pick, commissioner logs any" on draft_picks;
create policy "GM logs own team's pick, commissioner logs any" on draft_picks
  for insert with check (
    team_id = public.my_profile_team_id() or public.my_profile_role() = 'commissioner'
  );

drop policy if exists "Only commissioner edits/deletes pick history" on draft_picks;
create policy "Only commissioner edits/deletes pick history" on draft_picks
  for update using (public.my_profile_role() = 'commissioner');

drop policy if exists "Only commissioner deletes picks" on draft_picks;
create policy "Only commissioner deletes picks" on draft_picks
  for delete using (public.my_profile_role() = 'commissioner');
