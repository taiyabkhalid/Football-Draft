-- ============================================================
-- Football Draft App - Database Schema
-- Run this in Supabase: Dashboard -> SQL Editor -> New Query -> paste -> Run
-- ============================================================

-- Teams (created/configured by the commissioner)
create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Unnamed Team',
  draft_position int,              -- set once draft order is randomized/set
  created_at timestamptz default now()
);

-- Players (created via self-service registration form)
create table players (
  id uuid primary key default gen_random_uuid(),

  -- Basic info
  full_name text not null,
  phone text not null,
  email text not null,

  -- Photo (stored in Supabase Storage bucket "headshots", this is the public URL)
  headshot_url text,

  -- Positions
  offensive_position text not null check (offensive_position in ('QB','WR','C')),
  defensive_position text not null check (defensive_position in ('CB','Safety','LB','Rush')),
  position_preference text not null check (position_preference in ('Offense only','Defense only','Both')),

  -- Physical / bio
  height_feet int not null check (height_feet in (4,5,6,7)),
  height_inches int not null check (height_inches between 0 and 11),
  gender text not null check (gender in ('M','F')),
  previous_team text,  -- 'Warriors','Storm','T-Reds','Pink Panthers','Huskies','None'

  -- Injury
  injury_status text not null check (injury_status in ('None','Recovering','Injured')),
  weeks_until_recovered int,  -- required only if injury_status = 'Injured'

  -- Availability
  game_time_unavailable text not null check (game_time_unavailable in ('7 PM game','8 PM game','9 PM game','Available for all')),
  unavailable_mondays date[],  -- array of Monday dates the player can't attend

  -- Preferences
  call_on_draft_night boolean not null default false,
  enjoys_pub boolean not null default false,

  -- Draft status
  is_gm boolean not null default false,        -- true if this player is also a team's GM
  team_id uuid references teams(id),           -- set once drafted (or auto-set for GMs)
  draft_pick_number int,                       -- overall pick number when drafted
  is_active boolean not null default true,      -- commissioner can set false to remove from pool

  created_at timestamptz default now()
);

-- Commissioner-controlled league settings (single row)
create table draft_settings (
  id int primary key default 1,
  num_teams int not null default 6 check (num_teams between 6 and 8),
  pick_clock_seconds int not null default 60,
  draft_order_method text not null default 'randomized' check (draft_order_method in ('randomized','manual')),
  min_roster_size int not null default 9,
  max_roster_size int not null default 12,
  min_female_players int not null default 2,
  draft_status text not null default 'not_started' check (draft_status in ('not_started','in_progress','paused','completed')),
  current_pick_number int not null default 1,
  updated_at timestamptz default now(),

  constraint single_row check (id = 1)
);

insert into draft_settings (id) values (1);

-- Draft pick history (audit trail / undo support / results view)
create table draft_picks (
  id uuid primary key default gen_random_uuid(),
  pick_number int not null,
  round int not null,
  team_id uuid references teams(id) not null,
  player_id uuid references players(id) not null,
  picked_at timestamptz default now()
);

-- ============================================================
-- Row Level Security - open for now (small trusted league group).
-- We can tighten this later (e.g. GMs can only update their own team).
-- ============================================================
alter table teams enable row level security;
alter table players enable row level security;
alter table draft_settings enable row level security;
alter table draft_picks enable row level security;

create policy "Allow all reads" on teams for select using (true);
create policy "Allow all writes" on teams for all using (true) with check (true);

create policy "Allow all reads" on players for select using (true);
create policy "Allow all writes" on players for all using (true) with check (true);

create policy "Allow all reads" on draft_settings for select using (true);
create policy "Allow all writes" on draft_settings for all using (true) with check (true);

create policy "Allow all reads" on draft_picks for select using (true);
create policy "Allow all writes" on draft_picks for all using (true) with check (true);
