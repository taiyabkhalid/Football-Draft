-- ============================================================
-- Enforce unique emails (case-insensitive) so the same person
-- can't end up registered twice under slightly different casing.
-- Confirmed no existing duplicates before applying this.
-- ============================================================

create unique index players_email_unique_idx on public.players (lower(email));
