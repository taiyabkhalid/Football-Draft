-- ============================================================
-- Football Draft App - Database Schema
-- Full export of every table, constraint, RLS policy, and
-- project-specific trigger in the public schema, generated
-- directly from the live Supabase project. Enable RLS on every
-- table below before applying policies, if recreating from
-- scratch (all tables in this project already have RLS enabled).
-- ============================================================

-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE public.debug_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  category text NOT NULL,
  message text NOT NULL,
  data jsonb,
  user_agent text,
  CONSTRAINT debug_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE public.teams (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Unnamed Team'::text,
  draft_position integer,
  created_at timestamp with time zone DEFAULT now(),
  team_color text NOT NULL DEFAULT '#0074ff'::text,
  proxy_email text,
  CONSTRAINT teams_pkey PRIMARY KEY (id),
  CONSTRAINT teams_name_unique UNIQUE (name),
  CONSTRAINT teams_team_color_check CHECK ((team_color = ANY (ARRAY['#ff3b30'::text, '#0074ff'::text, '#00c853'::text, '#ff8c00'::text, '#8e24aa'::text, '#ff2d95'::text, '#ffd60a'::text, '#00bcd4'::text, '#1a1a1a'::text, '#6b7280'::text])))
);

CREATE TABLE public.players (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text NOT NULL,
  email text NOT NULL,
  headshot_url text,
  offensive_position text NOT NULL,
  defensive_position text NOT NULL,
  position_preference text NOT NULL,
  height_feet integer NOT NULL,
  height_inches integer NOT NULL,
  gender text NOT NULL,
  previous_team text,
  injury_status text NOT NULL,
  weeks_until_recovered integer,
  game_time_unavailable text NOT NULL,
  unavailable_mondays date[],
  call_on_draft_night boolean NOT NULL DEFAULT false,
  enjoys_pub boolean NOT NULL DEFAULT false,
  is_gm boolean NOT NULL DEFAULT false,
  team_id uuid,
  draft_pick_number integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT players_pkey PRIMARY KEY (id),
  CONSTRAINT players_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id),
  CONSTRAINT players_defensive_position_check CHECK ((defensive_position = ANY (ARRAY['CB'::text, 'Safety'::text, 'LB'::text, 'Rush'::text]))),
  CONSTRAINT players_offensive_position_check CHECK ((offensive_position = ANY (ARRAY['QB'::text, 'WR'::text, 'C'::text]))),
  CONSTRAINT players_position_preference_check CHECK ((position_preference = ANY (ARRAY['Offense only'::text, 'Defense only'::text, 'Both'::text]))),
  CONSTRAINT players_gender_check CHECK ((gender = ANY (ARRAY['M'::text, 'F'::text]))),
  CONSTRAINT players_height_feet_check CHECK ((height_feet = ANY (ARRAY[4, 5, 6, 7]))),
  CONSTRAINT players_height_inches_check CHECK (((height_inches >= 0) AND (height_inches <= 11))),
  CONSTRAINT players_injury_status_check CHECK ((injury_status = ANY (ARRAY['None'::text, 'Recovering'::text, 'Injured'::text]))),
  CONSTRAINT players_game_time_unavailable_check CHECK ((game_time_unavailable = ANY (ARRAY['7 PM game'::text, '8 PM game'::text, '9 PM game'::text, 'Available for all'::text])))
);

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  role text,
  team_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  email text,
  is_primary boolean NOT NULL DEFAULT false,
  has_seen_gm_tour boolean NOT NULL DEFAULT false,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT profiles_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id),
  CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['gm'::text, 'commissioner'::text])))
  -- Note: role is nullable (NOT NULL was intentionally removed) - a pure
  -- proxy's synthetic profile row has role = NULL. The CHECK above only
  -- restricts what a non-null role may be.
);

CREATE TABLE public.draft_settings (
  id integer NOT NULL DEFAULT 1,
  num_teams integer NOT NULL DEFAULT 6,
  pick_clock_seconds integer NOT NULL DEFAULT 120,
  draft_order_method text NOT NULL DEFAULT 'randomized'::text,
  min_roster_size integer NOT NULL DEFAULT 9,
  max_roster_size integer NOT NULL DEFAULT 12,
  min_female_players integer NOT NULL DEFAULT 2,
  draft_status text NOT NULL DEFAULT 'not_started'::text,
  current_pick_number integer NOT NULL DEFAULT 1,
  updated_at timestamp with time zone DEFAULT now(),
  draft_datetime timestamp with time zone,
  profile_edits_unlocked_override boolean NOT NULL DEFAULT false,
  current_pick_started_at timestamp with time zone,
  draft_type text NOT NULL DEFAULT 'snake'::text,
  paused_seconds_remaining integer,
  registration_unlocked_override boolean NOT NULL DEFAULT false,
  auto_randomize_draft_order boolean NOT NULL DEFAULT false,
  draft_order_auto_randomized boolean NOT NULL DEFAULT false,
  draft_completed_at timestamp with time zone,
  CONSTRAINT draft_settings_pkey PRIMARY KEY (id),
  CONSTRAINT single_row CHECK ((id = 1)),
  CONSTRAINT draft_settings_draft_order_method_check CHECK ((draft_order_method = ANY (ARRAY['randomized'::text, 'manual'::text]))),
  CONSTRAINT draft_settings_draft_status_check CHECK ((draft_status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'paused'::text, 'completed'::text]))),
  CONSTRAINT draft_settings_draft_type_check CHECK ((draft_type = ANY (ARRAY['snake'::text, 'repeat'::text]))),
  CONSTRAINT draft_settings_num_teams_check CHECK (((num_teams >= 4) AND (num_teams <= 12)))
);

CREATE TABLE public.draft_picks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pick_number integer NOT NULL,
  round integer NOT NULL,
  team_id uuid NOT NULL,
  player_id uuid,
  picked_at timestamp with time zone DEFAULT now(),
  skip_reason text,
  CONSTRAINT draft_picks_pkey PRIMARY KEY (id),
  CONSTRAINT draft_picks_pick_number_unique UNIQUE (pick_number),
  CONSTRAINT draft_picks_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id),
  CONSTRAINT draft_picks_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id)
);

CREATE TABLE public.team_rankings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  player_id uuid NOT NULL,
  rank_order integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT team_rankings_pkey PRIMARY KEY (id),
  CONSTRAINT team_rankings_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT team_rankings_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
  CONSTRAINT team_rankings_team_id_player_id_key UNIQUE (team_id, player_id)
);

CREATE TABLE public.proxy_tour_seen (
  email text NOT NULL,
  team_id uuid NOT NULL,
  seen_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT proxy_tour_seen_pkey PRIMARY KEY (email, team_id),
  CONSTRAINT proxy_tour_seen_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
  -- Note: this table is no longer actively used by the app - the proxy
  -- onboarding notice was switched to sessionStorage-based tracking
  -- instead. Left in place rather than dropped, since it's harmless and
  -- avoids a destructive migration for a table with zero rows.
);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.debug_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proxy_tour_seen ENABLE ROW LEVEL SECURITY;

-- debug_logs
CREATE POLICY "anyone can insert debug logs" ON public.debug_logs
  FOR INSERT WITH CHECK (true);
CREATE POLICY "commissioner can read debug logs" ON public.debug_logs
  FOR SELECT USING (my_profile_role() = 'commissioner'::text);

-- teams
CREATE POLICY "Allow all reads" ON public.teams
  FOR SELECT USING (true);
CREATE POLICY "GM edits own team, commissioner edits any" ON public.teams
  FOR UPDATE USING (id = my_profile_team_id() OR my_profile_role() = 'commissioner'::text)
  WITH CHECK (id = my_profile_team_id() OR my_profile_role() = 'commissioner'::text);
CREATE POLICY "Only commissioner creates/deletes teams" ON public.teams
  FOR INSERT WITH CHECK (my_profile_role() = 'commissioner'::text);
CREATE POLICY "Only commissioner deletes teams" ON public.teams
  FOR DELETE USING (my_profile_role() = 'commissioner'::text);

-- players
CREATE POLICY "Allow all reads" ON public.players
  FOR SELECT USING (true);
CREATE POLICY "Anyone can register as a player" ON public.players
  FOR INSERT WITH CHECK (true);
CREATE POLICY "GM drafts to own team, commissioner edits any" ON public.players
  FOR UPDATE USING (team_id IS NULL OR team_id = my_profile_team_id() OR my_profile_role() = 'commissioner'::text)
  WITH CHECK (team_id = my_profile_team_id() OR my_profile_role() = 'commissioner'::text);
CREATE POLICY "Player edits own row" ON public.players
  FOR UPDATE USING (email = auth.email())
  WITH CHECK (email = auth.email());
CREATE POLICY "Only commissioner deletes players" ON public.players
  FOR DELETE USING (my_profile_role() = 'commissioner'::text);

-- profiles
CREATE POLICY "Public can read profiles" ON public.profiles
  FOR SELECT USING (true);
CREATE POLICY "Logged in users can read profiles" ON public.profiles
  FOR SELECT USING (auth.role() = 'authenticated'::text);
CREATE POLICY "Commissioner manages profiles" ON public.profiles
  FOR ALL USING (my_profile_role() = 'commissioner'::text)
  WITH CHECK (my_profile_role() = 'commissioner'::text);

-- draft_settings
CREATE POLICY "Allow all reads" ON public.draft_settings
  FOR SELECT USING (true);
CREATE POLICY "Only commissioner edits settings" ON public.draft_settings
  FOR UPDATE USING (my_profile_role() = 'commissioner'::text)
  WITH CHECK (my_profile_role() = 'commissioner'::text);

-- draft_picks
CREATE POLICY "Allow all reads" ON public.draft_picks
  FOR SELECT USING (true);
CREATE POLICY "GM logs own team's pick, commissioner logs any" ON public.draft_picks
  FOR INSERT WITH CHECK (team_id = my_profile_team_id() OR my_profile_role() = 'commissioner'::text);
CREATE POLICY "Only commissioner edits/deletes pick history" ON public.draft_picks
  FOR UPDATE USING (my_profile_role() = 'commissioner'::text);
CREATE POLICY "Only commissioner deletes picks" ON public.draft_picks
  FOR DELETE USING (my_profile_role() = 'commissioner'::text);

-- team_rankings
CREATE POLICY "team can view own rankings" ON public.team_rankings
  FOR SELECT USING (acts_for_team(team_id));
CREATE POLICY "team can insert own rankings" ON public.team_rankings
  FOR INSERT WITH CHECK (acts_for_team(team_id));
CREATE POLICY "team can update own rankings" ON public.team_rankings
  FOR UPDATE USING (acts_for_team(team_id));
CREATE POLICY "team can delete own rankings" ON public.team_rankings
  FOR DELETE USING (acts_for_team(team_id));

-- proxy_tour_seen
CREATE POLICY "user can view own proxy tour records" ON public.proxy_tour_seen
  FOR SELECT USING (email = (SELECT lower(u.email::text) FROM auth.users u WHERE u.id = auth.uid()));
CREATE POLICY "user can insert own proxy tour records" ON public.proxy_tour_seen
  FOR INSERT WITH CHECK (email = (SELECT lower(u.email::text) FROM auth.users u WHERE u.id = auth.uid()));

-- ============================================================
-- Triggers (project-specific only - excludes Supabase platform
-- system triggers on cron/storage/realtime schemas)
-- ============================================================

CREATE TRIGGER auto_confirm_new_users
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  WHEN (new.email_confirmed_at IS NULL)
  EXECUTE FUNCTION auto_confirm_email();

CREATE TRIGGER set_profile_email_trigger
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_profile_email();
