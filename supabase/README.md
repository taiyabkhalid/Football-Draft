# Supabase Backend Export

This folder is a full snapshot of the live database backing this app,
generated directly from the Supabase project (`gvgyaaghiwgjkdxrgcbx`,
region `eu-west-2`) so the GitHub repo has a complete, accurate record
of every backend change alongside the frontend code - not just an
export at one point in time, but everything currently deployed.

**This is a snapshot, not a Supabase CLI migration history.** It
reflects the current state of the database as of this export, not a
step-by-step log of every individual change made to get there. If you
need to recreate the database from scratch, running `schema.sql`
followed by `functions.sql` (in that order - the schema needs to exist
before functions that reference tables can be created) against a fresh
Supabase project will reproduce the current structure and every
function.

## Files

- **`migrations/schema.sql`** - every table, column, constraint, RLS
  policy, and project-specific trigger currently in the `public`
  schema (excludes Supabase's own platform-level triggers on
  `cron`/`storage`/`realtime`, which aren't part of this app).
- **`migrations/functions.sql`** - every database function currently
  defined in the `public` schema, including the extended-phase draft
  logic (`get_team_on_clock`, `get_extended_round`), contact-info
  authorization (`get_team_contacts`, `get_my_gm_contact`), and all
  the draft-flow RPCs (`make_pick`, `skip_current_pick`,
  `randomize_draft_order_if_due`, etc.).

## What's not included

- **Table data.** This is schema and logic only, not a data dump -
  the actual rows in `teams`, `players`, `draft_picks`, etc. live only
  in the Supabase project itself.
- **Auth users, storage buckets, and other Supabase-managed
  infrastructure** outside the `public` schema tables/functions this
  app actually created.
- **A couple of RLS policies** on `profiles` reference each other in
  overlapping ways (a "public can read" policy alongside a narrower
  "logged in users can read" policy both exist) - both are included
  exactly as they exist live, even though the broader one makes the
  narrower one redundant, since this is meant to be an accurate
  record of what's deployed, not a cleaned-up version of it.

## Keeping this current

This snapshot reflects the database as of when it was generated. If
more backend changes are made later without also regenerating these
files, this export will drift out of date - it's not automatically
kept in sync.
