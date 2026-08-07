-- ============================================================
-- Football Draft App - Database Functions
-- Full export of every function in the public schema, generated
-- directly from the live Supabase project so this stays a true
-- record of what's actually deployed.
-- ============================================================

-- ============================================================
-- Function: acts_for_team(p_team_id uuid)
-- ============================================================
CREATE OR REPLACE FUNCTION public.acts_for_team(p_team_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  my_email text;
  my_team_id uuid;
  is_proxy boolean;
begin
  select lower(u.email) into my_email from auth.users u where u.id = auth.uid();
  if my_email is null then
    return false;
  end if;

  select team_id into my_team_id from profiles where email = my_email;
  if my_team_id = p_team_id then
    return true;
  end if;

  select exists (
    select 1 from teams
    where id = p_team_id
      and my_email = any (
        select trim(both ' ' from lower(x)) from unnest(string_to_array(proxy_email, ',')) as x
      )
  ) into is_proxy;

  return is_proxy;
end;
$function$
;

-- ============================================================
-- Function: add_to_rankings(p_player_id uuid)
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_to_rankings(p_player_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  acting_team_id uuid;
begin
  acting_team_id := public.my_acting_team_id();
  if acting_team_id is null then
    raise exception 'You are not currently acting for any team';
  end if;

  if exists (select 1 from team_rankings where team_id = acting_team_id and player_id = p_player_id) then
    return;
  end if;

  update team_rankings set rank_order = rank_order + 1 where team_id = acting_team_id;

  insert into team_rankings (team_id, player_id, rank_order)
  values (acting_team_id, p_player_id, 0);
end;
$function$
;

-- ============================================================
-- Function: advance_pick_clock()
-- ============================================================
CREATE OR REPLACE FUNCTION public.advance_pick_clock()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  total_players integer;
  total_picks_made integer;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Must be logged in';
  end if;

  select count(*) into total_players from players where is_active = true;
  select count(*) into total_picks_made from draft_picks;

  update draft_settings set current_pick_started_at = now() where id = 1;

  if total_picks_made >= total_players then
    update draft_settings set draft_status = 'completed' where id = 1;
  end if;
end;
$function$
;

-- ============================================================
-- Function: auto_confirm_email()
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_confirm_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.email_confirmed_at := now();
  return new;
end;
$function$
;

-- ============================================================
-- Function: clear_gm(target_team_id uuid)
-- ============================================================
CREATE OR REPLACE FUNCTION public.clear_gm(target_team_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  gm_email text;
begin
  if public.my_profile_role() != 'commissioner' then
    raise exception 'Only the commissioner can clear a team''s GM';
  end if;

  select email into gm_email from profiles where team_id = target_team_id and role = 'gm';
  if gm_email is null then
    raise exception 'This team does not have a GM to clear';
  end if;

  delete from profiles where email = gm_email;
  update players set team_id = null where email = gm_email;
end;
$function$
;

-- ============================================================
-- Function: delete_team(target_team_id uuid)
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_team(target_team_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  roster_count integer;
  pick_count integer;
begin
  if public.my_profile_role() != 'commissioner' then
    raise exception 'Only the commissioner can remove a team';
  end if;

  select count(*) into roster_count
  from players p
  where p.team_id = target_team_id
    and p.email not in (select email from profiles where team_id = target_team_id);

  if roster_count > 0 then
    raise exception 'This team still has drafted players on its roster - reassign or remove them first';
  end if;

  select count(*) into pick_count from draft_picks where team_id = target_team_id;
  if pick_count > 0 then
    raise exception 'This team has draft picks on record and cannot be removed';
  end if;

  update players set team_id = null where team_id = target_team_id;
  delete from profiles where team_id = target_team_id and role = 'gm';
  update profiles set team_id = null where team_id = target_team_id and role = 'commissioner';

  delete from teams where id = target_team_id;

  -- Close any gap this leaves in the draft order so positions stay contiguous 1..N
  with ordered as (
    select id, row_number() over (order by draft_position) as new_position
    from teams
  )
  update teams t set draft_position = o.new_position
  from ordered o
  where t.id = o.id;
end;
$function$
;

-- ============================================================
-- Function: demote_commissioner(target_email text)
-- ============================================================
CREATE OR REPLACE FUNCTION public.demote_commissioner(target_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  target_is_primary boolean;
  target_team_id uuid;
begin
  if not public.my_profile_is_primary() then
    raise exception 'Only the primary commissioner can remove a co-commissioner';
  end if;

  select is_primary, team_id into target_is_primary, target_team_id from profiles where email = target_email;

  if target_is_primary then
    raise exception 'The primary commissioner can''t be removed';
  end if;

  if target_team_id is not null then
    update profiles set role = 'gm' where email = target_email;
  else
    delete from profiles where email = target_email;
  end if;
end;
$function$
;

-- ============================================================
-- Function: draft_position_for_pick(p_pick_number integer, p_num_teams integer, p_draft_type text)
-- ============================================================
CREATE OR REPLACE FUNCTION public.draft_position_for_pick(p_pick_number integer, p_num_teams integer, p_draft_type text)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  round_num integer;
  index_in_round integer;
begin
  round_num := ceil(p_pick_number::numeric / p_num_teams);
  index_in_round := p_pick_number - (round_num - 1) * p_num_teams;
  if p_draft_type = 'snake' and mod(round_num, 2) = 0 then
    return p_num_teams - index_in_round + 1;
  else
    return index_in_round;
  end if;
end;
$function$
;

-- ============================================================
-- Function: ensure_own_profile_row()
-- ============================================================
CREATE OR REPLACE FUNCTION public.ensure_own_profile_row()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  my_email text;
begin
  select lower(u.email) into my_email from auth.users u where u.id = auth.uid();
  if my_email is null then
    raise exception 'Must be logged in';
  end if;

  insert into profiles (id, email, role, team_id, is_primary, has_seen_gm_tour)
  values (auth.uid(), my_email, null, null, false, false)
  on conflict (id) do nothing;
end;
$function$
;

-- ============================================================
-- Function: get_extended_round(p_clock_pick_number integer)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_extended_round(p_clock_pick_number integer)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  settings_row record;
  pool_size integer;
  max_normal_round integer;
  nth_skip integer;
  skip_pick_numbers integer[];
  skip_pick_num integer;
  skip_team_id uuid;
  candidate_round integer;
  is_free boolean;
  assigned_teams uuid[] := array[]::uuid[];
  assigned_rounds integer[] := array[]::integer[];
  result_round integer;
  i integer;
  k integer;
begin
  select * into settings_row from draft_settings where id = 1;
  select count(*)::integer into pool_size from players where is_active = true;
  pool_size := greatest(pool_size - settings_row.num_teams, 0);
  max_normal_round := ceil(pool_size::numeric / settings_row.num_teams);

  nth_skip := p_clock_pick_number - pool_size;
  if nth_skip < 1 then
    return null;
  end if;

  select array_agg(pick_number order by pick_number) into skip_pick_numbers
  from draft_picks where player_id is null;

  if skip_pick_numbers is null or array_length(skip_pick_numbers, 1) < nth_skip then
    return null;
  end if;

  for i in 1..nth_skip loop
    skip_pick_num := skip_pick_numbers[i];
    skip_team_id := public.get_team_on_clock(skip_pick_num);

    candidate_round := 1;
    loop
      is_free := true;
      for k in 1..coalesce(array_length(assigned_teams, 1), 0) loop
        if assigned_teams[k] = skip_team_id and assigned_rounds[k] = candidate_round then
          is_free := false;
          exit;
        end if;
      end loop;
      exit when is_free;
      candidate_round := candidate_round + 1;
    end loop;

    assigned_teams := assigned_teams || skip_team_id;
    assigned_rounds := assigned_rounds || candidate_round;

    if i = nth_skip then
      result_round := candidate_round;
    end if;
  end loop;

  return max_normal_round + result_round;
end;
$function$
;

-- ============================================================
-- Function: get_my_gm_contact()
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_gm_contact()
 RETURNS TABLE(phone text, email text, full_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  my_email text;
  my_team_id uuid;
  gm_email text;
begin
  select lower(u.email) into my_email from auth.users u where u.id = auth.uid();
  if my_email is null then
    raise exception 'Must be logged in';
  end if;

  select pl.team_id into my_team_id from players pl where pl.email = my_email;
  if my_team_id is null then
    return;
  end if;

  select p.email into gm_email from profiles p where p.team_id = my_team_id limit 1;
  if gm_email is null then
    return;
  end if;

  return query select pl.phone, pl.email, pl.full_name from players pl where pl.email = gm_email;
end;
$function$
;

-- ============================================================
-- Function: get_team_contacts(p_team_id uuid)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_team_contacts(p_team_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(player_id uuid, phone text, email text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  my_email text;
  my_team_id uuid;
  is_commissioner boolean;
  is_authorized boolean;
begin
  select lower(u.email) into my_email from auth.users u where u.id = auth.uid();
  if my_email is null then
    raise exception 'Must be logged in';
  end if;

  select (pr.role = 'commissioner') into is_commissioner from profiles pr where pr.email = my_email;
  is_commissioner := coalesce(is_commissioner, false);

  if p_team_id is null then
    if not is_commissioner then
      raise exception 'Only the commissioner can request contacts for all teams at once';
    end if;
    return query select p.id, p.phone, p.email from players p where p.team_id is not null;
  end if;

  if is_commissioner then
    is_authorized := true;
  else
    select pr.team_id into my_team_id from profiles pr where pr.email = my_email;
    is_authorized := coalesce(
      (my_team_id is not null and my_team_id = p_team_id) or exists (
        select 1 from teams t
        where t.id = p_team_id
          and my_email = any (
            select trim(both ' ' from lower(x)) from unnest(string_to_array(t.proxy_email, ',')) as x
          )
      ),
      false
    );
  end if;

  if not is_authorized then
    raise exception 'Not authorized to view contact info for this team';
  end if;

  return query select p.id, p.phone, p.email from players p where p.team_id = p_team_id;
end;
$function$
;

-- ============================================================
-- Function: get_team_on_clock(p_clock_pick_number integer)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_team_on_clock(p_clock_pick_number integer)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  settings_row record;
  pool_size integer;
  nth_skip integer;
  skip_pick_number integer;
  resolved_position integer;
  resolved_team_id uuid;
begin
  select * into settings_row from draft_settings where id = 1;

  select count(*)::integer into pool_size from players where is_active = true;
  pool_size := greatest(pool_size - settings_row.num_teams, 0);

  if p_clock_pick_number <= pool_size then
    resolved_position := public.draft_position_for_pick(p_clock_pick_number, settings_row.num_teams, settings_row.draft_type);
    select id into resolved_team_id from teams where draft_position = resolved_position;
    return resolved_team_id;
  end if;

  nth_skip := p_clock_pick_number - pool_size;
  select pick_number into skip_pick_number
  from draft_picks
  where player_id is null
  order by pick_number
  offset (nth_skip - 1) limit 1;

  if skip_pick_number is null then
    return null;
  end if;

  -- Recursive resolution: this handles a skip chain of any depth (a
  -- makeup pick that was itself skipped, whose makeup was also skipped,
  -- etc.) rather than assuming every skip is normal-phase.
  return public.get_team_on_clock(skip_pick_number);
end;
$function$
;

-- ============================================================
-- Function: make_pick(target_player_id uuid)
-- ============================================================
CREATE OR REPLACE FUNCTION public.make_pick(target_player_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  my_email text;
  my_team_id uuid;
  is_proxy boolean;
  settings_row record;
  clock_pick_number integer;
  clock_round integer;
  clock_team_id uuid;
  real_pick_number integer;
  remaining_in_pool integer;
  team_female_count integer;
  female_needed integer;
  picks_remaining integer;
  player_gender text;
  future_pick_num integer;
  pool_size integer;
begin
  select lower(u.email) into my_email from auth.users u where u.id = auth.uid();
  if my_email is null then
    raise exception 'Must be logged in';
  end if;

  select * into settings_row from draft_settings where id = 1 for update;

  if settings_row.draft_status <> 'in_progress' then
    raise exception 'The draft is not currently live';
  end if;

  select count(*)::integer into clock_pick_number from draft_picks;
  clock_pick_number := clock_pick_number + 1;

  select count(*)::integer into pool_size from players where is_active = true;
  pool_size := greatest(pool_size - settings_row.num_teams, 0);
  if clock_pick_number <= pool_size then
    clock_round := ceil(clock_pick_number::numeric / settings_row.num_teams);
  else
    clock_round := public.get_extended_round(clock_pick_number);
  end if;

  clock_team_id := public.get_team_on_clock(clock_pick_number);
  if clock_team_id is null then
    raise exception 'Could not determine which team is on the clock';
  end if;

  select team_id into my_team_id from profiles where email = my_email;
  is_proxy := exists (
    select 1 from teams
    where id = clock_team_id
      and my_email = any (
        select trim(both ' ' from lower(x)) from unnest(string_to_array(proxy_email, ',')) as x
      )
  );

  if my_team_id is null or my_team_id <> clock_team_id then
    if not is_proxy then
      raise exception 'You are not authorized to draft for the team currently on the clock';
    end if;
  end if;

  select gender into player_gender from players where id = target_player_id;
  if player_gender is null then
    raise exception 'Player not found';
  end if;

  select count(*)::integer into team_female_count
    from players where team_id = clock_team_id and gender = 'F';

  select count(*)::integer into remaining_in_pool from players where is_active = true and team_id is null;

  female_needed := settings_row.min_female_players - team_female_count;
  if female_needed > 0 and remaining_in_pool > 0 then
    picks_remaining := 0;
    for future_pick_num in clock_pick_number..(clock_pick_number + remaining_in_pool - 1) loop
      if public.get_team_on_clock(future_pick_num) = clock_team_id then
        picks_remaining := picks_remaining + 1;
      end if;
    end loop;

    if female_needed >= picks_remaining and player_gender <> 'F' then
      raise exception 'This team must draft a female player now to still reach the female minimum';
    end if;
  end if;

  select count(*)::integer into real_pick_number from draft_picks where player_id is not null;
  real_pick_number := real_pick_number + 1;

  update players
  set team_id = clock_team_id, draft_pick_number = real_pick_number
  where id = target_player_id and team_id is null;

  if not found then
    raise exception 'That player was already drafted by someone else';
  end if;

  insert into draft_picks (pick_number, round, team_id, player_id)
  values (clock_pick_number, clock_round, clock_team_id, target_player_id);

  select count(*)::integer into remaining_in_pool from players where is_active = true and team_id is null;
  if remaining_in_pool = 0 then
    update draft_settings set draft_status = 'completed', current_pick_started_at = null, draft_completed_at = now() where id = 1;
  else
    update draft_settings set current_pick_started_at = now() where id = 1;
  end if;
end;
$function$
;

-- ============================================================
-- Function: mark_gm_tour_seen()
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_gm_tour_seen()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update profiles set has_seen_gm_tour = true where id = auth.uid();
end;
$function$
;

-- ============================================================
-- Function: my_acting_team_id()
-- ============================================================
CREATE OR REPLACE FUNCTION public.my_acting_team_id()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  my_email text;
  my_team_id uuid;
  proxy_team_id uuid;
begin
  select lower(u.email) into my_email from auth.users u where u.id = auth.uid();
  if my_email is null then
    return null;
  end if;

  select team_id into my_team_id from profiles where email = my_email;
  if my_team_id is not null then
    return my_team_id;
  end if;

  select id into proxy_team_id from teams
  where my_email = any (
    select trim(both ' ' from lower(x)) from unnest(string_to_array(proxy_email, ',')) as x
  )
  limit 1;

  return proxy_team_id;
end;
$function$
;

-- ============================================================
-- Function: my_profile_is_primary()
-- ============================================================
CREATE OR REPLACE FUNCTION public.my_profile_is_primary()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select is_primary from profiles where id = auth.uid()), false);
$function$
;

-- ============================================================
-- Function: my_profile_role()
-- ============================================================
CREATE OR REPLACE FUNCTION public.my_profile_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select role from public.profiles where id = auth.uid();
$function$
;

-- ============================================================
-- Function: my_profile_team_id()
-- ============================================================
CREATE OR REPLACE FUNCTION public.my_profile_team_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select team_id from public.profiles where id = auth.uid();
$function$
;

-- ============================================================
-- Function: promote_to_commissioner(player_email text, target_team_id uuid)
-- ============================================================
CREATE OR REPLACE FUNCTION public.promote_to_commissioner(player_email text, target_team_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  target_user_id uuid;
  prior_gm_email text;
  existing_team_id uuid;
  effective_team_id uuid;
begin
  if not public.my_profile_is_primary() then
    raise exception 'Only the primary commissioner can assign a co-commissioner';
  end if;

  select id into target_user_id from auth.users where email = player_email;
  if target_user_id is null then
    raise exception 'No login account found for that email - they must register first';
  end if;

  -- Preserve whatever team this person is already on (as a GM or otherwise)
  -- unless a different team was explicitly chosen - an existing GM becoming
  -- a co-commissioner should keep running their own team, not lose it.
  select coalesce(
    (select team_id from profiles where email = player_email),
    (select team_id from players where email = player_email)
  ) into existing_team_id;

  effective_team_id := coalesce(target_team_id, existing_team_id);

  if effective_team_id is not null and effective_team_id is distinct from existing_team_id then
    select email into prior_gm_email
    from profiles
    where team_id = effective_team_id
      and role = 'gm'
      and email is distinct from player_email;

    if prior_gm_email is not null then
      delete from profiles where email = prior_gm_email;
      update players set team_id = null, draft_pick_number = null where email = prior_gm_email;
    end if;
  end if;

  insert into profiles (id, role, team_id, email)
  values (target_user_id, 'commissioner', effective_team_id, player_email)
  on conflict (id) do update set role = 'commissioner', team_id = effective_team_id;

  update players set team_id = effective_team_id where email = player_email;
end;
$function$
;

-- ============================================================
-- Function: promote_to_gm(player_email text, target_team_id uuid)
-- ============================================================
CREATE OR REPLACE FUNCTION public.promote_to_gm(player_email text, target_team_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  target_user_id uuid;
  prior_gm_email text;
  existing_role text;
begin
  if public.my_profile_role() != 'commissioner' then
    raise exception 'Only the commissioner can promote a GM';
  end if;

  select id into target_user_id from auth.users where email = player_email;
  if target_user_id is null then
    raise exception 'No login account found for that email - they must register first';
  end if;

  -- If this team already has a DIFFERENT gm assigned, demote them first:
  -- remove their elevated profile and return their player card to the
  -- draft pool. Commissioner rows are deliberately left untouched here -
  -- reassigning the commissioner should be a separate, explicit action.
  select email into prior_gm_email
  from profiles
  where team_id = target_team_id
    and role = 'gm'
    and email is distinct from player_email;

  if prior_gm_email is not null then
    delete from profiles where email = prior_gm_email;
    update players set team_id = null, draft_pick_number = null where email = prior_gm_email;
  end if;

  select role into existing_role from profiles where email = player_email;

  insert into profiles (id, role, team_id, email)
  values (target_user_id, coalesce(existing_role, 'gm'), target_team_id, player_email)
  on conflict (id) do update set
    -- A commissioner taking on a team stays a commissioner - only someone
    -- with no existing elevated role becomes a plain GM.
    role = case when profiles.role = 'commissioner' then 'commissioner' else 'gm' end,
    team_id = target_team_id;

  -- Also assign their player card directly to the team - they're
  -- already on the roster, not something to be drafted
  update players set team_id = target_team_id where email = player_email;
end;
$function$
;

-- ============================================================
-- Function: randomize_draft_order_if_due()
-- ============================================================
CREATE OR REPLACE FUNCTION public.randomize_draft_order_if_due()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s record;
  t record;
  i integer := 1;
begin
  select * into s from draft_settings where id = 1 for update;

  if s.draft_status <> 'not_started' then return; end if;
  if not s.auto_randomize_draft_order then return; end if;
  if s.draft_order_auto_randomized then return; end if;
  if s.draft_datetime is null or s.draft_datetime > now() + interval '30 minutes' then return; end if;

  for t in (select id from teams order by random()) loop
    update teams set draft_position = i where id = t.id;
    i := i + 1;
  end loop;

  update draft_settings set draft_order_auto_randomized = true where id = 1;
end;
$function$
;

-- ============================================================
-- Function: remove_from_rankings(p_player_id uuid)
-- ============================================================
CREATE OR REPLACE FUNCTION public.remove_from_rankings(p_player_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  acting_team_id uuid;
begin
  acting_team_id := public.my_acting_team_id();
  if acting_team_id is null then
    raise exception 'You are not currently acting for any team';
  end if;

  delete from team_rankings where team_id = acting_team_id and player_id = p_player_id;
end;
$function$
;

-- ============================================================
-- Function: reorder_rankings(p_player_ids uuid[])
-- ============================================================
CREATE OR REPLACE FUNCTION public.reorder_rankings(p_player_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  acting_team_id uuid;
  i integer := 0;
  pid uuid;
begin
  acting_team_id := public.my_acting_team_id();
  if acting_team_id is null then
    raise exception 'You are not currently acting for any team';
  end if;

  foreach pid in array p_player_ids loop
    update team_rankings set rank_order = i where team_id = acting_team_id and player_id = pid;
    i := i + 1;
  end loop;
end;
$function$
;

-- ============================================================
-- Function: reset_draft()
-- ============================================================
CREATE OR REPLACE FUNCTION public.reset_draft()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.my_profile_role() != 'commissioner' then
    raise exception 'Only the commissioner can reset the draft';
  end if;

  delete from draft_picks where pick_number is not null;
  delete from team_rankings where true;

  update players
  set team_id = null, draft_pick_number = null
  where email not in (select email from profiles where team_id is not null);

  update draft_settings
  set draft_status = 'not_started',
      current_pick_started_at = null,
      draft_order_auto_randomized = false,
      draft_completed_at = null
  where id = 1;
end;
$function$
;

-- ============================================================
-- Function: reset_player_password(target_email text)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reset_player_password(target_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
begin
  if public.my_profile_role() <> 'commissioner' then
    raise exception 'Only the commissioner can reset passwords';
  end if;

  update auth.users
  set encrypted_password = extensions.crypt('draft2026', extensions.gen_salt('bf'))
  where lower(email) = lower(target_email);

  if not found then
    raise exception 'No account found for that email';
  end if;
end;
$function$
;

-- ============================================================
-- Function: set_profile_email()
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_profile_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  select email into new.email from auth.users where id = new.id;
  return new;
end;
$function$
;

-- ============================================================
-- Function: set_team_count(target_count integer)
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_team_count(target_count integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  current_count integer;
  placeholder_names text[] := array[
    'Blitz Squad', 'Gridiron Ghosts', 'Red Zone Raiders', 'Hail Mary Heroes',
    'Turf Titans', 'Broken Play Bandits', 'Sideline Storm', 'End Zone Legends',
    'Scramble Squad', 'Flag Snatchers', 'Rushing Rebels', 'Field Goal Phantoms'
  ];
  team_colors text[] := array['#ff3b30','#0074ff','#00c853','#ff8c00','#8e24aa','#ff2d95','#ffd60a','#00bcd4','#1a1a1a','#6b7280'];
  next_position integer;
  removable_ids uuid[];
  to_remove integer;
  i integer;
  chosen_name text;
  suffix integer;
begin
  if public.my_profile_role() != 'commissioner' then
    raise exception 'Only the commissioner can change the number of teams';
  end if;

  if target_count < 4 or target_count > 12 then
    raise exception 'The league must have between 4 and 12 teams';
  end if;

  select count(*) into current_count from teams;

  if target_count > current_count then
    select coalesce(max(draft_position), 0) into next_position from teams;
    for i in 1..(target_count - current_count) loop
      next_position := next_position + 1;

      -- Pick the first placeholder name not currently in use; if every
      -- placeholder is somehow taken, fall back to an unmistakably unique name.
      select n into chosen_name
      from unnest(placeholder_names) as n
      where n not in (select name from teams)
      order by array_position(placeholder_names, n)
      limit 1;

      if chosen_name is null then
        suffix := 2;
        loop
          chosen_name := placeholder_names[1] || ' ' || suffix;
          exit when not exists (select 1 from teams where name = chosen_name);
          suffix := suffix + 1;
        end loop;
      end if;

      insert into teams (name, team_color, draft_position)
      values (
        chosen_name,
        team_colors[1 + floor(random() * array_length(team_colors, 1))::int],
        next_position
      );
    end loop;

  elsif target_count < current_count then
    to_remove := current_count - target_count;

    select array_agg(t.id) into removable_ids
    from teams t
    where not exists (select 1 from profiles p where p.team_id = t.id)
      and not exists (select 1 from players pl where pl.team_id = t.id)
      and not exists (select 1 from draft_picks dp where dp.team_id = t.id);

    if removable_ids is null or array_length(removable_ids, 1) < to_remove then
      raise exception 'Not enough empty teams to remove automatically - % more team(s) need a GM removed manually first', to_remove - coalesce(array_length(removable_ids, 1), 0);
    end if;

    for i in 1..to_remove loop
      delete from teams where id = removable_ids[i];
    end loop;

    with ordered as (
      select id, row_number() over (order by draft_position) as new_position
      from teams
    )
    update teams t set draft_position = o.new_position
    from ordered o
    where t.id = o.id;
  end if;

  update draft_settings set num_teams = target_count where id = 1;
end;
$function$
;

-- ============================================================
-- Function: skip_current_pick()
-- ============================================================
CREATE OR REPLACE FUNCTION public.skip_current_pick()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  settings_row record;
  clock_pick_number integer;
  clock_round integer;
  clock_team_id uuid;
  remaining_in_pool integer;
  pool_size integer;
begin
  if public.my_profile_role() != 'commissioner' then
    raise exception 'Only the commissioner can skip a pick';
  end if;

  select * into settings_row from draft_settings where id = 1 for update;

  if settings_row.draft_status <> 'in_progress' then
    raise exception 'The draft is not currently live';
  end if;

  select count(*)::integer into clock_pick_number from draft_picks;
  clock_pick_number := clock_pick_number + 1;

  select count(*)::integer into pool_size from players where is_active = true;
  pool_size := greatest(pool_size - settings_row.num_teams, 0);
  if clock_pick_number <= pool_size then
    clock_round := ceil(clock_pick_number::numeric / settings_row.num_teams);
  else
    clock_round := public.get_extended_round(clock_pick_number);
  end if;

  clock_team_id := public.get_team_on_clock(clock_pick_number);
  if clock_team_id is null then
    raise exception 'Could not determine which team is on the clock';
  end if;

  insert into draft_picks (pick_number, round, team_id, player_id)
  values (clock_pick_number, clock_round, clock_team_id, null);

  select count(*)::integer into remaining_in_pool from players where is_active = true and team_id is null;
  if remaining_in_pool = 0 then
    update draft_settings set draft_status = 'completed', current_pick_started_at = null where id = 1;
  else
    update draft_settings set current_pick_started_at = now() where id = 1;
  end if;
end;
$function$
;

-- ============================================================
-- Function: skip_current_pick(p_reason text)
-- ============================================================
CREATE OR REPLACE FUNCTION public.skip_current_pick(p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  settings_row record;
  clock_pick_number integer;
  clock_round integer;
  clock_team_id uuid;
  remaining_in_pool integer;
  pool_size integer;
begin
  if public.my_profile_role() != 'commissioner' then
    raise exception 'Only the commissioner can skip a pick';
  end if;

  select * into settings_row from draft_settings where id = 1 for update;

  if settings_row.draft_status <> 'in_progress' then
    raise exception 'The draft is not currently live';
  end if;

  select count(*)::integer into clock_pick_number from draft_picks;
  clock_pick_number := clock_pick_number + 1;

  select count(*)::integer into pool_size from players where is_active = true;
  pool_size := greatest(pool_size - settings_row.num_teams, 0);
  if clock_pick_number <= pool_size then
    clock_round := ceil(clock_pick_number::numeric / settings_row.num_teams);
  else
    clock_round := public.get_extended_round(clock_pick_number);
  end if;

  clock_team_id := public.get_team_on_clock(clock_pick_number);
  if clock_team_id is null then
    raise exception 'Could not determine which team is on the clock';
  end if;

  insert into draft_picks (pick_number, round, team_id, player_id, skip_reason)
  values (clock_pick_number, clock_round, clock_team_id, null, p_reason);

  select count(*)::integer into remaining_in_pool from players where is_active = true and team_id is null;
  if remaining_in_pool = 0 then
    update draft_settings set draft_status = 'completed', current_pick_started_at = null where id = 1;
  else
    update draft_settings set current_pick_started_at = now() where id = 1;
  end if;
end;
$function$
;

-- ============================================================
-- Function: start_draft_if_due()
-- ============================================================
CREATE OR REPLACE FUNCTION public.start_draft_if_due()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  unassigned_count integer;
begin
  -- No auth check here on purpose: this now runs both from client polling
  -- AND from a server-side pg_cron job (which has no "authenticated user"
  -- context at all), and the function is safe to call from anywhere since
  -- it only ever does anything when the scheduled time has genuinely
  -- passed and every team already has a GM assigned.
  select count(*) into unassigned_count
  from teams t
  where not exists (select 1 from profiles p where p.team_id = t.id);

  update draft_settings
  set draft_status = 'in_progress',
      current_pick_started_at = now(),
      draft_datetime = null
  where id = 1
    and draft_status = 'not_started'
    and draft_datetime is not null
    and draft_datetime <= now()
    and unassigned_count = 0;
end;
$function$
;

-- ============================================================
-- Function: start_draft_now()
-- ============================================================
CREATE OR REPLACE FUNCTION public.start_draft_now()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  unassigned_count integer;
begin
  if public.my_profile_role() != 'commissioner' then
    raise exception 'Only the commissioner can start the draft';
  end if;

  select count(*) into unassigned_count
  from teams t
  where not exists (select 1 from profiles p where p.team_id = t.id);

  if unassigned_count > 0 then
    raise exception 'Every team needs a GM assigned before the draft can start (% team(s) still missing one)', unassigned_count;
  end if;

  update draft_settings
  set draft_status = 'in_progress',
      current_pick_started_at = now()
  where id = 1
    and draft_status = 'not_started';
end;
$function$
;

-- ============================================================
-- Function: sync_preassigned_team(p_email text)
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_preassigned_team(p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update players
  set team_id = pr.team_id
  from profiles pr
  where players.email = p_email
    and pr.email = p_email
    and pr.team_id is not null;
end;
$function$
;
