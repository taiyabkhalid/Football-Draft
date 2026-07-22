'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { getRound, getTeamOnTheClock } from '../../lib/draftLogic';
import BrandHeader from '../../lib/BrandHeader';
import FootballIcon from '../../lib/FootballIcon';

const ALL_POSITIONS = ['QB', 'WR', 'C', 'CB', 'Safety', 'LB', 'Rush'];
const OFFENSIVE_POSITIONS = ['QB', 'WR', 'C'];

export default function DraftPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [profile, setProfile] = useState(null);

  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [picks, setPicks] = useState([]);
  const [settings, setSettings] = useState(null);
  const [profiles, setProfiles] = useState([]);

  const [searchName, setSearchName] = useState('');
  const [searchPosition, setSearchPosition] = useState('');
  const [searchGender, setSearchGender] = useState('');
  const [searchPreviousTeam, setSearchPreviousTeam] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [viewByTeamOpen, setViewByTeamOpen] = useState(true);

  const [drafting, setDrafting] = useState(null);
  const [skipping, setSkipping] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [viewingTeamId, setViewingTeamId] = useState(null);

  // ---- Auth check ----
  useEffect(() => {
    async function checkAuth() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('role, team_id')
        .eq('id', user.id)
        .single();
      if (!profileRow) {
        router.push('/login');
        return;
      }
      setProfile(profileRow);
      setAuthChecked(true);
    }
    checkAuth();
  }, [router]);

  // ---- Data fetching ----
  const fetchAll = useCallback(async () => {
    const [teamsRes, playersRes, picksRes, settingsRes, profilesRes] = await Promise.all([
      supabase.from('teams').select('*').order('draft_position', { ascending: true }),
      supabase.from('players').select('*').eq('is_active', true),
      supabase.from('draft_picks').select('*').order('pick_number', { ascending: true }),
      supabase.from('draft_settings').select('*').eq('id', 1).single(),
      supabase.from('profiles').select('role, team_id, email'),
    ]);
    setTeams(teamsRes.data || []);
    setPlayers(playersRes.data || []);
    setPicks(picksRes.data || []);
    setSettings(settingsRes.data || null);
    setProfiles(profilesRes.data || []);
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchAll)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [authChecked, fetchAll]);

  // ---- Derived draft state ----
  const currentPickNumber = picks.length + 1;
  const numTeams = settings?.num_teams || teams.length;
  const currentRound = numTeams ? getRound(currentPickNumber, numTeams) : 1;
  const teamOnClock = numTeams ? getTeamOnTheClock(currentPickNumber, numTeams, teams) : null;
  const teamNextOnClock = numTeams ? getTeamOnTheClock(currentPickNumber + 1, numTeams, teams) : null;

  const draftStatus = settings?.draft_status || 'not_started';
  const minRoster = settings?.min_roster_size ?? 9;
  const maxRoster = settings?.max_roster_size ?? 12;
  const minFemale = settings?.min_female_players ?? 2;
  const pickClockSeconds = settings?.pick_clock_seconds ?? 120;

  useEffect(() => {
    setSecondsLeft(pickClockSeconds);
  }, [currentPickNumber, pickClockSeconds]);

  useEffect(() => {
    if (secondsLeft === null || secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const timerDisplay = useMemo(() => {
    if (secondsLeft === null) return '--:--';
    const m = Math.floor(Math.max(secondsLeft, 0) / 60);
    const s = Math.max(secondsLeft, 0) % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }, [secondsLeft]);

  const playersById = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);
  const teamsById = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams]);
  const playersByEmail = useMemo(() => Object.fromEntries(players.map((p) => [p.email, p])), [players]);
  const ownerByTeam = useMemo(() => {
    const map = {};
    for (const profile of profiles) {
      if (!profile.team_id) continue;
      const ownerPlayer = playersByEmail[profile.email];
      map[profile.team_id] = {
        name: ownerPlayer?.full_name || profile.email,
        role: profile.role,
      };
    }
    return map;
  }, [profiles, playersByEmail]);
  const previousPick = picks.length > 0 ? picks[picks.length - 1] : null;

  const upcomingPicks = useMemo(() => {
    if (!numTeams) return [];
    const list = [];
    for (let i = 1; i <= 8; i++) {
      const pickNum = currentPickNumber + i;
      list.push({
        pickNumber: pickNum,
        round: getRound(pickNum, numTeams),
        team: getTeamOnTheClock(pickNum, numTeams, teams),
      });
    }
    return list;
  }, [currentPickNumber, numTeams, teams]);

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

  const canDraft = profile && teamOnClock && draftStatus === 'in_progress' && profile.team_id === teamOnClock.id;

  const mustDraftFemale = useMemo(() => {
    if (!teamOnClock) return false;
    const roster = rosterByTeam[teamOnClock.id];
    if (!roster) return false;
    const femaleNeeded = minFemale - roster.femaleCount;
    const slotsRemaining = maxRoster - roster.count;
    return femaleNeeded > 0 && femaleNeeded >= slotsRemaining;
  }, [teamOnClock, rosterByTeam, minFemale, maxRoster]);

  const hasActiveSearch =
    searchName.trim() !== '' || searchPosition !== '' || searchGender !== '' || searchPreviousTeam !== '';

  const previousTeamOptions = useMemo(() => {
    const set = new Set(players.map((p) => p.previous_team).filter(Boolean));
    return Array.from(set).sort();
  }, [players]);

  function sortList(list, key) {
    const sorted = [...list];
    if (key === 'gender') sorted.sort((a, b) => a.gender.localeCompare(b.gender) || a.full_name.localeCompare(b.full_name));
    else if (key === 'position')
      sorted.sort((a, b) => a.offensive_position.localeCompare(b.offensive_position) || a.full_name.localeCompare(b.full_name));
    else sorted.sort((a, b) => a.full_name.localeCompare(b.full_name));
    return sorted;
  }

  // Combined AND-filtering: a player must satisfy every active filter to be a "match"
  const sortedAvailable = useMemo(() => {
    if (!hasActiveSearch) return sortList(availablePlayers, sortBy);

    const matches = availablePlayers.filter((p) => {
      const nameOk = searchName.trim() === '' || p.full_name.toLowerCase().includes(searchName.trim().toLowerCase());
      const posOk =
        searchPosition === '' || p.offensive_position === searchPosition || p.defensive_position === searchPosition;
      const genderOk = searchGender === '' || p.gender === searchGender;
      const prevTeamOk = searchPreviousTeam === '' || p.previous_team === searchPreviousTeam;
      return nameOk && posOk && genderOk && prevTeamOk;
    });
    const matchIds = new Set(matches.map((p) => p.id));
    const rest = availablePlayers.filter((p) => !matchIds.has(p.id));

    return [...sortList(matches, 'name'), ...sortList(rest, sortBy)];
  }, [availablePlayers, hasActiveSearch, searchName, searchPosition, searchGender, searchPreviousTeam, sortBy]);

  const matchIdSet = useMemo(() => {
    if (!hasActiveSearch) return new Set();
    return new Set(
      availablePlayers
        .filter((p) => {
          const nameOk = searchName.trim() === '' || p.full_name.toLowerCase().includes(searchName.trim().toLowerCase());
          const posOk =
            searchPosition === '' || p.offensive_position === searchPosition || p.defensive_position === searchPosition;
          const genderOk = searchGender === '' || p.gender === searchGender;
          const prevTeamOk = searchPreviousTeam === '' || p.previous_team === searchPreviousTeam;
          return nameOk && posOk && genderOk && prevTeamOk;
        })
        .map((p) => p.id)
    );
  }, [availablePlayers, hasActiveSearch, searchName, searchPosition, searchGender, searchPreviousTeam]);

  function clearSearch() {
    setSearchName('');
    setSearchPosition('');
    setSearchGender('');
    setSearchPreviousTeam('');
    setSortBy('name');
  }

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

  async function skipPick() {
    if (profile?.role !== 'commissioner' || !teamOnClock) return;
    setSkipping(true);
    setActionError(null);
    await supabase.from('draft_picks').insert({
      pick_number: currentPickNumber,
      round: currentRound,
      team_id: teamOnClock.id,
      player_id: null,
    });
    setSkipping(false);
  }

  if (!authChecked || !settings) {
    return (
      <main style={{ background: '#ffffff', minHeight: '100vh' }}>
        <BrandHeader pageLabel="Live draft" />
        <p style={{ padding: 40, textAlign: 'center', color: '#5a6b7d', fontSize: 13 }}>Loading draft room…</p>
      </main>
    );
  }

  if (draftStatus === 'not_started') {
    return (
      <main style={{ background: '#ffffff', minHeight: '100vh' }}>
        <BrandHeader pageLabel="Live draft" />
        <div style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ fontSize: 16, color: '#0c2340', fontWeight: 500 }}>The draft hasn't started yet.</p>
          <p style={{ fontSize: 13, color: '#5a6b7d' }}>Check back once the commissioner opens it.</p>
        </div>
      </main>
    );
  }

  return (
    <main style={{ background: '#ffffff', minHeight: '100vh' }}>
      <BrandHeader pageLabel="Live draft" liveIndicator pickTimer={timerDisplay} />

      {/* Previous / current / next strip */}
      <div className="flex flex-col sm:flex-row gap-2 px-4 sm:px-5 pt-4">
        <div className="flex-1 bg-surface rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted mb-1">Previous pick</p>
          {previousPick ? (
            <p className="text-xs text-ink">
              {previousPick.player_id
                ? `${playersById[previousPick.player_id]?.full_name || 'Unknown'} — ${teamsById[previousPick.team_id]?.name || ''}`
                : `Skipped — ${teamsById[previousPick.team_id]?.name || ''}`}
            </p>
          ) : (
            <p className="text-xs text-faint">None yet</p>
          )}
        </div>
        <div className="flex-1 rounded-lg p-3 flex items-center justify-between gap-2" style={{ background: '#185fa5' }}>
          <div>
            <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: '#cfe2f5' }}>
              On the clock
            </p>
            <p className="text-[13px] font-semibold" style={{ color: '#ffffff' }}>
              {teamOnClock?.name || '—'}
            </p>
          </div>
          <p className="text-xl font-medium" style={{ color: '#ffffff' }}>
            {timerDisplay}
          </p>
        </div>
        <div className="flex-1 bg-surface rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted mb-1">Next up</p>
          <p className="text-xs text-ink">{teamNextOnClock?.name || '—'}</p>
        </div>
      </div>

      {/* Upcoming picks strip */}
      <div className="px-4 sm:px-5 pt-3">
        <p className="text-[10px] uppercase tracking-wide text-muted mb-1">Upcoming picks</p>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {upcomingPicks.map((n) => (
            <span
              key={n.pickNumber}
              className="flex-none text-xs px-2.5 py-1.5 rounded-md bg-surface text-muted whitespace-nowrap flex items-center gap-1.5"
            >
              <FootballIcon color={n.team?.team_color || '#0074ff'} size={12} />
              {n.team?.name || '—'}
              <span className="text-faint">&middot; R{n.round} &middot; #{n.pickNumber}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="border-t border-line mx-4 sm:mx-5 mt-1" />

      {/* Round / pick / skip */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-2.5 flex-wrap gap-2">
        <p className="text-xs text-muted">
          Round {currentRound}, pick {currentPickNumber}
        </p>
        {profile?.role === 'commissioner' && (
          <button onClick={skipPick} disabled={skipping} className="btn-secondary text-xs">
            {skipping ? 'Skipping…' : 'Skip pick'}
          </button>
        )}
      </div>

      <div className="border-t border-line mx-4 sm:mx-5" />

      {actionError && (
        <div className="bg-danger/10 mx-4 sm:mx-5 mt-3 rounded-md px-3 py-2">
          <p className="text-xs text-danger m-0">{actionError}</p>
        </div>
      )}
      {mustDraftFemale && (
        <div className="bg-[#faeeda] mx-4 sm:mx-5 mt-3 rounded-md px-3 py-2">
          <p className="text-xs text-[#633806] m-0">
            {teamOnClock.name} must draft a female player this pick to still reach the {minFemale}-female minimum.
          </p>
        </div>
      )}

      {/* Team roster viewer */}
      <div className="mx-4 sm:mx-5 mt-3 rounded-xl border border-line bg-surface px-4 py-3">
        <button
          onClick={() => setViewByTeamOpen((o) => !o)}
          className="w-full flex items-center justify-between"
        >
          <p className="text-xs font-semibold uppercase tracking-wide m-0" style={{ color: '#5a6b7d' }}>
            View by team
          </p>
          <i className={`ti ti-chevron-${viewByTeamOpen ? 'up' : 'down'} text-base text-muted`} aria-hidden="true" />
        </button>
        {viewByTeamOpen && (
          <>
            <p className="text-[10px] text-muted mt-2 mb-2">Tap a team to view their picks</p>
            <div className="flex gap-2 flex-wrap mb-2">
              {teams.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setViewingTeamId(viewingTeamId === t.id ? null : t.id)}
                  className="text-xs px-2.5 py-1.5 rounded-md font-medium flex items-center gap-1.5"
                  style={{
                    background: viewingTeamId === t.id ? '#185fa5' : '#ffffff',
                    color: viewingTeamId === t.id ? '#ffffff' : '#3d4a57',
                  }}
                >
                  <FootballIcon color={viewingTeamId === t.id ? '#ffffff' : t.team_color || '#0074ff'} size={14} />
                  {t.name}
                </button>
              ))}
            </div>
            {viewingTeamId && rosterByTeam[viewingTeamId] && (
              <div className="bg-white rounded-lg p-3 mb-1">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-sm font-medium text-ink m-0">{teamsById[viewingTeamId]?.name}</p>
                  {ownerByTeam[viewingTeamId] && (
                    <p className="text-xs m-0 flex items-center gap-1" style={{ color: '#185fa5' }}>
                      <i
                        className={ownerByTeam[viewingTeamId].role === 'commissioner' ? 'ti ti-star-filled' : 'ti ti-star'}
                        aria-hidden="true"
                      />
                      {ownerByTeam[viewingTeamId].name}
                    </p>
                  )}
                </div>
                {rosterByTeam[viewingTeamId].players.length === 0 ? (
                  <p className="text-xs text-muted m-0">No picks yet.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {rosterByTeam[viewingTeamId].players.map((p) => (
                      <div key={p.id} className="flex justify-between text-xs bg-surface rounded-md px-2.5 py-2">
                        <span className="text-ink">{p.full_name}</span>
                        <span className="text-muted">
                          {p.offensive_position} &middot; {p.gender}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Draft board - the main drafting area: search/sort, available players, cards, your team */}
      <div className="mx-4 sm:mx-5 mt-3 rounded-xl border border-line bg-royal-pale/40 px-4 py-3.5">
        <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#0c447c' }}>
          Draft board
        </p>

        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative flex-none" style={{ width: 150 }}>
            <i className="ti ti-search absolute left-2.5 top-1/2 -translate-y-1/2 text-base text-faint" aria-hidden="true" />
            <input
              type="text"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              placeholder="Search by name"
              className="w-full pl-8 text-xs"
              style={{ borderColor: searchName ? '#185fa5' : undefined }}
            />
          </div>
          <select
            value={searchPosition}
            onChange={(e) => setSearchPosition(e.target.value)}
            className="flex-none text-xs"
            style={{ width: 120, borderColor: searchPosition ? '#185fa5' : undefined }}
          >
            <option value="">Position: any</option>
            <optgroup label="Offense">
              {OFFENSIVE_POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </optgroup>
            <optgroup label="Defense">
              {ALL_POSITIONS.filter((p) => !OFFENSIVE_POSITIONS.includes(p)).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </optgroup>
          </select>
          <select
            value={searchGender}
            onChange={(e) => setSearchGender(e.target.value)}
            className="flex-none text-xs"
            style={{ width: 84, borderColor: searchGender ? '#185fa5' : undefined }}
          >
            <option value="">M/F: any</option>
            <option value="M">M</option>
            <option value="F">F</option>
          </select>
          <select
            value={searchPreviousTeam}
            onChange={(e) => setSearchPreviousTeam(e.target.value)}
            className="flex-none text-xs"
            style={{ width: 140, borderColor: searchPreviousTeam ? '#185fa5' : undefined }}
          >
            <option value="">Previous team: any</option>
            {previousTeamOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="flex-none text-xs"
            style={{ width: 92 }}
          >
            <option value="name">Sort: name</option>
            <option value="gender">Sort: M/F</option>
            <option value="position">Sort: position</option>
          </select>
          {hasActiveSearch && (
            <button onClick={clearSearch} className="btn-secondary text-xs">
              Clear search
            </button>
          )}
        </div>
        {hasActiveSearch && (
          <p className="text-[10px] text-faint mt-1.5">
            Filtering by:{' '}
            {[
              searchName && `name "${searchName}"`,
              searchPosition && searchPosition,
              searchGender && searchGender,
              searchPreviousTeam && `previous team ${searchPreviousTeam}`,
            ]
              .filter(Boolean)
              .join(', ')}
          </p>
        )}

        {/* Main layout: sidebar / card row / my team */}
        <div className="flex flex-col lg:flex-row pt-3">
        <aside className="w-full lg:w-64 flex-shrink-0 order-2 lg:order-1 lg:pr-3 lg:border-r border-line min-h-0">
          <p className="text-[10px] uppercase tracking-wide text-muted mb-2">Available ({sortedAvailable.length})</p>
          <div className="flex flex-col gap-2 max-h-[520px] overflow-y-auto pr-1">
            {sortedAvailable.map((p) => (
              <div key={p.id} className="bg-surface rounded-md px-2.5 py-2">
                <p className="text-xs font-medium text-ink m-0">{p.full_name}</p>
                <p className="text-[11px] text-muted m-0">
                  {p.height_feet}'{p.height_inches}" &middot; {p.gender}
                </p>
                <p className="text-[11px] text-muted m-0">
                  Off: {p.offensive_position} &middot; Def: {p.defensive_position}
                </p>
              </div>
            ))}
          </div>
        </aside>

        <section className="flex-1 min-w-0 order-1 lg:order-2 lg:px-3">
          <div className="flex gap-3 overflow-x-auto pb-3">
            {sortedAvailable.map((p) => {
              const disabled = !canDraft || (mustDraftFemale && p.gender !== 'F') || drafting === p.id;
              const isMatch = matchIdSet.has(p.id);
              return (
                <div
                  key={p.id}
                  className="flex-none rounded-xl p-3.5 flex flex-col"
                  style={{
                    width: 'calc(33.333% - 8px)',
                    minWidth: 190,
                    height: 230,
                    background: isMatch ? '#e6f1fb' : '#f1f3f6',
                    border: isMatch ? '1.5px solid #185fa5' : '1.5px solid transparent',
                  }}
                >
                  <div className="flex gap-2.5 items-start mb-2">
                    {p.headshot_url ? (
                      <img
                        src={p.headshot_url}
                        alt={p.full_name}
                        className="w-11 h-11 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center flex-shrink-0">
                        <i className="ti ti-user text-faint text-2xl" aria-hidden="true" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p
                        className="text-sm font-medium m-0 leading-snug"
                        style={{ color: isMatch ? '#042c53' : '#0c2340' }}
                      >
                        {p.full_name} <span className="font-normal text-muted">({p.gender})</span>
                      </p>
                      <p className="text-[11px] m-0" style={{ color: isMatch ? '#0c447c' : '#5a6b7d' }}>
                        {p.height_feet}'{p.height_inches}"
                      </p>
                    </div>
                  </div>
                  <p className="text-[11px] my-0.5" style={{ color: isMatch ? '#0c447c' : '#5a6b7d' }}>
                    Offense: {p.offensive_position} &nbsp; Defense: {p.defensive_position}
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: isMatch ? '#0c447c' : '#5a6b7d' }}>
                    Injuries: {p.injury_status === 'None' ? 'None' : `${p.injury_status} (${p.weeks_until_recovered || '?'}w)`}
                  </p>
                  <button
                    onClick={() => draftPlayer(p)}
                    disabled={disabled}
                    className="w-full text-xs font-medium rounded-lg py-2 mt-auto"
                    style={{ background: disabled ? '#d8dde2' : '#185fa5', color: '#ffffff', border: 'none' }}
                  >
                    {drafting === p.id ? 'Drafting…' : 'Draft player'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {profile?.team_id && (
          <aside className="w-full lg:w-64 flex-shrink-0 order-3 lg:pl-3 lg:border-l border-line">
            <p className="text-[10px] uppercase tracking-wide text-muted mb-1">Your team</p>
            {rosterByTeam[profile.team_id] && (
              <>
                <p className="text-xs text-ink mb-2">
                  {rosterByTeam[profile.team_id].count} of {minRoster}-{maxRoster} &middot; {rosterByTeam[profile.team_id].femaleCount} of{' '}
                  {minFemale} F
                </p>
                <div className="flex flex-col gap-2">
                  {rosterByTeam[profile.team_id].players.map((p) => (
                    <div key={p.id} className="bg-surface rounded-md px-2.5 py-2">
                      <p className="text-xs font-medium text-ink m-0">{p.full_name}</p>
                      <p className="text-[11px] text-muted m-0">
                        {p.height_feet}'{p.height_inches}" &middot; {p.gender}
                      </p>
                      <p className="text-[11px] text-muted m-0">
                        Off: {p.offensive_position} &middot; Def: {p.defensive_position}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </aside>
        )}
        </div>
      </div>
    </main>
  );
}
