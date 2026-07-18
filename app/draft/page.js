'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { getRound, getTeamOnTheClock } from '../../lib/draftLogic';

export default function DraftPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [profile, setProfile] = useState(null); // { role, team_id }

  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [picks, setPicks] = useState([]);
  const [settings, setSettings] = useState(null);

  const [sortBy, setSortBy] = useState('name');
  const [drafting, setDrafting] = useState(null); // player id currently being submitted
  const [actionError, setActionError] = useState(null);

  // ---- Auth check ----
  useEffect(() => {
    async function checkAuth() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/staff-login');
        return;
      }

      const { data: profileRow } = await supabase
        .from('profiles')
        .select('role, team_id')
        .eq('id', user.id)
        .single();

      if (!profileRow) {
        router.push('/staff-login');
        return;
      }

      setProfile(profileRow);
      setAuthChecked(true);
    }
    checkAuth();
  }, [router]);

  // ---- Data fetching ----
  const fetchAll = useCallback(async () => {
    const [teamsRes, playersRes, picksRes, settingsRes] = await Promise.all([
      supabase.from('teams').select('*').order('draft_position', { ascending: true }),
      supabase.from('players').select('*').eq('is_active', true),
      supabase.from('draft_picks').select('*').order('pick_number', { ascending: true }),
      supabase.from('draft_settings').select('*').eq('id', 1).single(),
    ]);
    setTeams(teamsRes.data || []);
    setPlayers(playersRes.data || []);
    setPicks(picksRes.data || []);
    setSettings(settingsRes.data || null);
  }, []);

  useEffect(() => {
    if (!authChecked) return;
    fetchAll();

    const channel = supabase
      .channel('draft-room')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draft_picks' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draft_settings' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, fetchAll)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authChecked, fetchAll]);

  // ---- Derived draft state ----
  const currentPickNumber = picks.length + 1;
  const numTeams = settings?.num_teams || teams.length;
  const currentRound = numTeams ? getRound(currentPickNumber, numTeams) : 1;
  const teamOnClock = numTeams ? getTeamOnTheClock(currentPickNumber, numTeams, teams) : null;

  const draftStatus = settings?.draft_status || 'not_started';
  const minRoster = settings?.min_roster_size ?? 9;
  const maxRoster = settings?.max_roster_size ?? 12;
  const minFemale = settings?.min_female_players ?? 2;

  const availablePlayers = useMemo(() => players.filter((p) => !p.team_id), [players]);

  const rosterByTeam = useMemo(() => {
    const map = {};
    for (const t of teams) {
      const roster = players.filter((p) => p.team_id === t.id);
      map[t.id] = {
        players: roster,
        count: roster.length,
        femaleCount: roster.filter((p) => p.gender === 'F').length,
      };
    }
    return map;
  }, [teams, players]);

  const canDraft =
    profile &&
    teamOnClock &&
    draftStatus === 'in_progress' &&
    (profile.role === 'commissioner' || profile.team_id === teamOnClock.id);

  // Hard-block: does the team on the clock need to draft female-only right now?
  const mustDraftFemale = useMemo(() => {
    if (!teamOnClock) return false;
    const roster = rosterByTeam[teamOnClock.id];
    if (!roster) return false;
    const femaleNeeded = minFemale - roster.femaleCount;
    const slotsRemaining = maxRoster - roster.count;
    return femaleNeeded > 0 && femaleNeeded >= slotsRemaining;
  }, [teamOnClock, rosterByTeam, minFemale, maxRoster]);

  const sortedAvailable = useMemo(() => {
    const list = [...availablePlayers];
    if (sortBy === 'name') list.sort((a, b) => a.full_name.localeCompare(b.full_name));
    if (sortBy === 'gender') list.sort((a, b) => a.gender.localeCompare(b.gender));
    if (sortBy === 'position')
      list.sort((a, b) => a.offensive_position.localeCompare(b.offensive_position));
    return list;
  }, [availablePlayers, sortBy]);

  // ---- Draft a player ----
  async function draftPlayer(player) {
    setActionError(null);
    if (!canDraft) return;
    if (mustDraftFemale && player.gender !== 'F') {
      setActionError(
        `${teamOnClock.name} must draft a female player now to still reach the ${minFemale}-female minimum.`
      );
      return;
    }
    const roster = rosterByTeam[teamOnClock.id];
    if (roster.count >= maxRoster) {
      setActionError(`${teamOnClock.name} has already reached the ${maxRoster}-player roster limit.`);
      return;
    }

    setDrafting(player.id);

    // Guard against two people drafting the same player at once:
    // this update only succeeds if the player is still undrafted.
    const { data: updated, error: updateError } = await supabase
      .from('players')
      .update({ team_id: teamOnClock.id, draft_pick_number: currentPickNumber })
      .eq('id', player.id)
      .is('team_id', null)
      .select();

    if (updateError || !updated || updated.length === 0) {
      setActionError('That player was just drafted by someone else. Pick another player.');
      setDrafting(null);
      return;
    }

    await supabase.from('draft_picks').insert({
      pick_number: currentPickNumber,
      round: currentRound,
      team_id: teamOnClock.id,
      player_id: player.id,
    });

    setDrafting(null);
  }

  if (!authChecked || !settings) {
    return (
      <main style={{ padding: 40, textAlign: 'center', color: '#5a6b7d', fontSize: 13 }}>
        Loading draft room…
      </main>
    );
  }

  if (draftStatus === 'not_started') {
    return (
      <main style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ fontSize: 16, color: '#0c2340', fontWeight: 500 }}>
          The draft hasn't started yet.
        </p>
        <p style={{ fontSize: 13, color: '#5a6b7d' }}>Check back once the commissioner opens it.</p>
      </main>
    );
  }

  return (
    <main style={{ background: '#ffffff', minHeight: '100vh' }}>
      <div
        style={{
          background: '#e6f1fb',
          padding: '14px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div>
          <p style={{ fontSize: 11, color: '#0c447c', margin: '0 0 2px', textTransform: 'uppercase' }}>
            On the clock
          </p>
          <p style={{ fontSize: 15, fontWeight: 500, color: '#042c53', margin: 0 }}>
            {teamOnClock?.name || '—'}
          </p>
          <p style={{ fontSize: 11, color: '#0c447c', margin: '2px 0 0' }}>
            Round {currentRound}, pick {currentPickNumber}
          </p>
        </div>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ fontSize: 12 }}>
          <option value="name">Sort: name</option>
          <option value="gender">Sort: M/F</option>
          <option value="position">Sort: position</option>
        </select>
      </div>

      {actionError && (
        <div style={{ background: '#fcebeb', padding: '8px 20px' }}>
          <p style={{ fontSize: 12, color: '#791f1f', margin: 0 }}>{actionError}</p>
        </div>
      )}

      {mustDraftFemale && (
        <div style={{ background: '#faeeda', padding: '8px 20px' }}>
          <p style={{ fontSize: 12, color: '#633806', margin: 0 }}>
            {teamOnClock.name} must draft a female player this pick to still reach the {minFemale}-female minimum.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 20, padding: 20, flexWrap: 'wrap' }}>
        {/* Sidebar */}
        <aside style={{ width: 220, flexShrink: 0 }}>
          <p style={{ fontSize: 11, color: '#5a6b7d', textTransform: 'uppercase', marginBottom: 8 }}>
            Available players ({sortedAvailable.length})
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 600, overflowY: 'auto' }}>
            {sortedAvailable.map((p) => (
              <div
                key={p.id}
                style={{
                  fontSize: 12,
                  background: '#f1f3f6',
                  borderRadius: 6,
                  padding: '6px 8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ color: '#0c2340' }}>{p.full_name}</span>
                <span style={{ color: '#5a6b7d' }}>
                  {p.height_feet}'{p.height_inches}" &middot; {p.offensive_position} &middot; {p.gender}
                </span>
              </div>
            ))}
          </div>
        </aside>

        {/* Player grid */}
        <section style={{ flex: 1, minWidth: 280 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
              gap: 12,
            }}
          >
            {sortedAvailable.map((p) => {
              const disabled = !canDraft || (mustDraftFemale && p.gender !== 'F') || drafting === p.id;
              return (
                <div
                  key={p.id}
                  style={{
                    background: '#f1f3f6',
                    borderRadius: 12,
                    padding: 14,
                  }}
                >
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                    {p.headshot_url ? (
                      <img
                        src={p.headshot_url}
                        alt={p.full_name}
                        style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: '50%',
                          background: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <i className="ti ti-user" style={{ fontSize: 24, color: '#8b97a3' }} aria-hidden="true" />
                      </div>
                    )}
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 500, color: '#0c2340', margin: 0 }}>
                        {p.full_name} <span style={{ fontWeight: 400, color: '#5a6b7d' }}>({p.gender})</span>
                      </p>
                      <p style={{ fontSize: 11, color: '#5a6b7d', margin: 0 }}>
                        {p.height_feet}'{p.height_inches}"
                      </p>
                    </div>
                  </div>
                  <p style={{ fontSize: 11, color: '#5a6b7d', margin: '2px 0' }}>
                    Offense: {p.offensive_position} &nbsp; Defense: {p.defensive_position}
                  </p>
                  <p style={{ fontSize: 11, color: '#5a6b7d', margin: '2px 0 10px' }}>
                    Injuries: {p.injury_status === 'None' ? 'None' : `${p.injury_status} (${p.weeks_until_recovered || '?'}w)`}
                  </p>
                  <button
                    onClick={() => draftPlayer(p)}
                    disabled={disabled}
                    style={{
                      width: '100%',
                      background: disabled ? '#d8dde2' : '#185fa5',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 8,
                      padding: 8,
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                  >
                    {drafting === p.id ? 'Drafting…' : 'Draft player'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* My team panel */}
        {profile?.team_id && (
          <aside style={{ width: 220, flexShrink: 0 }}>
            <p style={{ fontSize: 11, color: '#5a6b7d', textTransform: 'uppercase', marginBottom: 8 }}>
              Your team
            </p>
            {rosterByTeam[profile.team_id] && (
              <>
                <p style={{ fontSize: 12, color: '#0c2340', marginBottom: 8 }}>
                  {rosterByTeam[profile.team_id].count} of {minRoster}-{maxRoster} players &middot;{' '}
                  {rosterByTeam[profile.team_id].femaleCount} of {minFemale} female
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {rosterByTeam[profile.team_id].players.map((p) => (
                    <div
                      key={p.id}
                      style={{ fontSize: 12, background: '#f1f3f6', borderRadius: 6, padding: '6px 8px' }}
                    >
                      {p.full_name}
                    </div>
                  ))}
                </div>
              </>
            )}
          </aside>
        )}
      </div>
    </main>
  );
}
