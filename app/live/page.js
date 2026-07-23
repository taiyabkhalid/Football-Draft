'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { getRound, getTeamOnTheClock, buildFullPickOrder } from '../../lib/draftLogic';
import BrandHeader from '../../lib/BrandHeader';
import FootballIcon, { lightenColor } from '../../lib/FootballIcon';

export default function LiveDraftPage() {
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [picks, setPicks] = useState([]);
  const [settings, setSettings] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [viewingTeamId, setViewingTeamId] = useState(null);
  const [myTeamId, setMyTeamId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewByTeamOpen, setViewByTeamOpen] = useState(false);
  const [rosterViewMode, setRosterViewMode] = useState('team'); // 'team' | 'round'
  const [selectedRound, setSelectedRound] = useState(1);
  const roundInitialized = useRef(false);
  const [openProfileIds, setOpenProfileIds] = useState([]);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const prevDraftStatusRef = useRef(null);

  const currentPickRef = useRef(null);
  const draftedScrollRef = useRef(null);

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
    setLoading(false);
  }, []);

  useEffect(() => {
    async function checkMyTeam() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: playerRow } = await supabase.from('players').select('team_id').eq('email', user.email).single();
      if (playerRow?.team_id) {
        setMyTeamId(playerRow.team_id);
        setViewingTeamId(playerRow.team_id);
        // Arriving via the profile page's "View My Team" button (?focus=team) -
        // jump straight to their roster instead of leaving the panel collapsed.
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          if (params.get('focus') === 'team') {
            setViewByTeamOpen(true);
            setRosterViewMode('team');
          }
        }
      }
    }
    checkMyTeam();
  }, []);

  useEffect(() => {
    fetchAll();
    const channel = supabase
      .channel('live-spectator')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draft_picks' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draft_settings' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, fetchAll)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchAll]);

  const currentPickNumber = picks.length + 1;
  const numTeams = settings?.num_teams || teams.length;
  const draftStatus = settings?.draft_status || 'not_started';
  const draftType = settings?.draft_type || 'snake';
  const currentRound = numTeams ? getRound(currentPickNumber, numTeams) : 1;
  const nextRound = numTeams ? getRound(currentPickNumber + 1, numTeams) : 1;
  const teamOnClock = numTeams ? getTeamOnTheClock(currentPickNumber, numTeams, teams, draftType) : null;
  const teamNextOnClock = numTeams ? getTeamOnTheClock(currentPickNumber + 1, numTeams, teams, draftType) : null;
  const pickClockSeconds = settings?.pick_clock_seconds ?? 120;
  const minRoster = settings?.min_roster_size ?? 9;
  const minFemale = settings?.min_female_players ?? 2;

  // Same shared-timestamp clock as the GM draft page, so both views always agree.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const pickStartedAt = settings?.current_pick_started_at ? new Date(settings.current_pick_started_at).getTime() : null;
  const secondsLeft = pickStartedAt
    ? Math.max(pickClockSeconds - Math.floor((now - pickStartedAt) / 1000), 0)
    : pickClockSeconds;

  const timerDisplay = useMemo(() => {
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }, [secondsLeft]);

  const clockUrgent = secondsLeft <= 20;

  function openProfile(playerId) {
    setOpenProfileIds((ids) => (ids.includes(playerId) ? ids : [...ids, playerId]));
  }
  function closeProfile(playerId) {
    setOpenProfileIds((ids) => ids.filter((id) => id !== playerId));
  }

  const playersById = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);
  const teamsById = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams]);
  const previousPick = picks.length > 0 ? picks[picks.length - 1] : null;

  const upcomingPicks = useMemo(() => {
    if (!numTeams) return [];
    const list = [];
    for (let i = 1; i <= 8; i++) {
      const pickNum = currentPickNumber + i;
      list.push({
        pickNumber: pickNum,
        round: getRound(pickNum, numTeams),
        team: getTeamOnTheClock(pickNum, numTeams, teams, draftType),
      });
    }
    return list;
  }, [currentPickNumber, numTeams, teams, draftType]);

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

  const roleByEmail = useMemo(() => {
    const map = {};
    for (const profile of profiles) {
      if (profile.email) map[profile.email.toLowerCase()] = profile.role;
    }
    return map;
  }, [profiles]);

  const roundByPlayerId = useMemo(() => {
    const map = {};
    for (const pick of picks) {
      if (pick.player_id) map[pick.player_id] = pick.round;
    }
    return map;
  }, [picks]);

  const rosterByTeam = useMemo(() => {
    const map = {};
    for (const t of teams) {
      const roster = players.filter((p) => p.team_id === t.id);
      map[t.id] = { players: roster, count: roster.length, femaleCount: roster.filter((p) => p.gender === 'F').length };
    }
    return map;
  }, [teams, players]);

  const pickByNumber = useMemo(() => Object.fromEntries(picks.map((p) => [p.pick_number, p])), [picks]);

  // The draft runs until the whole player pool is allocated - see draft/page.js for the same logic.
  const totalPicks = players.length;
  const maxRounds = numTeams ? Math.ceil(totalPicks / numTeams) : 0;

  const allSlots = useMemo(() => {
    if (!numTeams) return [];
    return buildFullPickOrder(numTeams, totalPicks, draftType).map((slot) => {
      const team = teams.find((t) => t.draft_position === slot.draftPosition);
      const pick = pickByNumber[slot.pickNumber];
      return {
        pickNumber: slot.pickNumber,
        round: slot.round,
        team,
        pick,
        player: pick?.player_id ? playersById[pick.player_id] : null,
      };
    });
  }, [numTeams, totalPicks, draftType, teams, pickByNumber, playersById]);

  const picksPerTeam = useMemo(() => {
    const map = {};
    for (const t of teams) {
      map[t.id] = allSlots.filter((s) => s.team?.id === t.id).length;
    }
    return map;
  }, [allSlots, teams]);

  useEffect(() => {
    if (!roundInitialized.current && currentRound) {
      setSelectedRound(Math.min(currentRound, maxRounds));
      roundInitialized.current = true;
    }
  }, [currentRound, maxRounds]);

  const roundSlots = useMemo(() => allSlots.filter((s) => s.round === selectedRound), [allSlots, selectedRound]);

  function buildTeamSlots(teamId) {
    const roster = rosterByTeam[teamId]?.players || [];
    const gmPlayer = roster.find((p) => {
      const role = roleByEmail[p.email?.toLowerCase()];
      return role === 'commissioner' || role === 'gm';
    });

    const teamPicks = picks
      .filter((pk) => pk.team_id === teamId)
      .sort((a, b) => a.pick_number - b.pick_number);
    const pickedPlayerIds = new Set(teamPicks.filter((pk) => pk.player_id).map((pk) => pk.player_id));

    const entries = [];
    if (gmPlayer) entries.push({ kind: 'gm', player: gmPlayer });
    for (const pk of teamPicks) {
      if (pk.player_id) {
        const player = playersById[pk.player_id];
        if (player) entries.push({ kind: 'player', player, pick: pk });
      } else {
        entries.push({ kind: 'skipped', pick: pk });
      }
    }
    const manualPlayers = roster.filter((p) => p !== gmPlayer && !pickedPlayerIds.has(p.id));
    for (const p of manualPlayers) {
      entries.push({ kind: 'manual', player: p });
    }

    const totalSlots = Math.max(picksPerTeam[teamId] ?? maxRounds, entries.length);
    const slots = [];
    for (let i = 0; i < totalSlots; i++) {
      slots.push(entries[i] || null);
    }
    return slots;
  }

  useEffect(() => {
    if (draftStatus === 'completed') {
      if (draftedScrollRef.current) draftedScrollRef.current.scrollLeft = 0;
    } else if (currentPickRef.current) {
      currentPickRef.current.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
    }
  }, [currentPickNumber, draftStatus]);

  useEffect(() => {
    if (prevDraftStatusRef.current === 'in_progress' && draftStatus === 'completed') {
      setShowCompleteModal(true);
    }
    prevDraftStatusRef.current = draftStatus;
  }, [draftStatus]);

  if (loading) {
    return (
      <main style={{ background: '#ffffff', minHeight: '100vh' }}>
        <BrandHeader pageLabel="Live draft / results" />
        <p className="text-center text-muted text-sm p-10">Loading…</p>
      </main>
    );
  }

  if (draftStatus === 'not_started') {
    return (
      <main style={{ background: '#ffffff', minHeight: '100vh' }}>
        <BrandHeader pageLabel="Live draft / results" />
        <div className="text-center p-10">
          <p className="text-base font-medium text-ink">The draft hasn't started yet.</p>
          <p className="text-sm text-muted">Check back once the commissioner opens it.</p>
        </div>
      </main>
    );
  }

  return (
    <main style={{ background: '#ffffff', minHeight: '100vh' }}>
      <BrandHeader
        pageLabel={draftStatus === 'completed' ? 'Draft results' : draftStatus === 'paused' ? 'Draft paused' : 'Live draft'}
        liveIndicator={draftStatus === 'in_progress'}
        pickTimer={draftStatus === 'in_progress' ? timerDisplay : undefined}
      />

      {draftStatus === 'in_progress' && (
        <>
          <div className="flex flex-col sm:flex-row gap-2 px-4 sm:px-5 pt-4">
            <div className="flex-1 bg-surface rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted mb-1">Previous pick</p>
              {previousPick ? (
                <>
                  <div className="flex items-center gap-2">
                    <FootballIcon color={teamsById[previousPick.team_id]?.team_color || '#0074ff'} size={16} />
                    <p className="text-xs text-ink m-0 truncate">
                      {previousPick.player_id
                        ? `${playersById[previousPick.player_id]?.full_name || 'Unknown'} — ${teamsById[previousPick.team_id]?.name || ''}`
                        : `Skipped — ${teamsById[previousPick.team_id]?.name || ''}`}
                    </p>
                  </div>
                  <p className="text-[10px] text-muted m-0 mt-1">
                    Round {previousPick.round} &middot; Pick {previousPick.pick_number}
                  </p>
                </>
              ) : (
                <p className="text-xs text-faint">None yet</p>
              )}
            </div>
            <div
              className={`flex-1 rounded-lg p-3 flex items-center justify-between gap-2 ${clockUrgent ? 'animate-pulse' : ''}`}
              style={{ background: clockUrgent ? '#c0392b' : '#185fa5' }}
            >
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'rgba(255,255,255,0.75)' }}>
                  On the clock
                </p>
                <div className="flex items-center gap-2">
                  <FootballIcon color="#ffffff" size={16} />
                  <p className="text-[13px] font-semibold truncate m-0" style={{ color: '#ffffff' }}>
                    {teamOnClock?.name || '—'}
                  </p>
                </div>
                <p className="text-[10px] m-0 mt-1" style={{ color: 'rgba(255,255,255,0.75)' }}>
                  Round {currentRound} &middot; Pick {currentPickNumber}
                </p>
              </div>
              <p className="text-xl font-medium" style={{ color: '#ffffff' }}>
                {timerDisplay}
              </p>
            </div>
            <div className="flex-1 bg-surface rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted mb-1">Next up</p>
              <div className="flex items-center gap-2">
                <FootballIcon color={teamNextOnClock?.team_color || '#0074ff'} size={16} />
                <p className="text-xs text-ink m-0 truncate">{teamNextOnClock?.name || '—'}</p>
              </div>
              {teamNextOnClock && (
                <p className="text-[10px] text-muted m-0 mt-1">
                  Round {nextRound} &middot; Pick {currentPickNumber + 1}
                </p>
              )}
            </div>
          </div>

          <div className="px-4 sm:px-5 pt-3">
            <p className="text-[10px] uppercase tracking-wide text-muted mb-1">Upcoming picks</p>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {upcomingPicks.map((n) => {
                const color = n.team?.team_color || '#0074ff';
                return (
                  <span
                    key={n.pickNumber}
                    className="flex-none text-xs px-2.5 py-1.5 rounded-md whitespace-nowrap flex items-center gap-1.5"
                    style={{ background: lightenColor(color, 0.85), color: '#0c2340' }}
                  >
                    <FootballIcon color={color} size={12} />
                    {n.team?.name || '—'}
                    <span style={{ color: '#5a6b7d' }}>&middot; Rnd {n.round} . Pick # {n.pickNumber}</span>
                  </span>
                );
              })}
            </div>
          </div>

          <p className="text-xs text-muted px-4 sm:px-5 pt-1">
            Round {currentRound}, pick {currentPickNumber}
          </p>
        </>
      )}

      {draftStatus === 'paused' && (
        <div className="bg-[#faeeda] mx-4 sm:mx-5 mt-4 rounded-lg p-3.5 flex gap-2">
          <i className="ti ti-player-pause text-base flex-shrink-0" style={{ color: '#854f0b' }} aria-hidden="true" />
          <p className="text-sm m-0" style={{ color: '#633806' }}>
            The commissioner has paused the draft. Grab a beer, have a smoke, we'll pick back up where we left off!
          </p>
        </div>
      )}

      {draftStatus === 'completed' && (
        <div className="bg-royal-pale mx-4 sm:mx-5 mt-4 rounded-lg p-3.5">
          <p className="text-sm m-0" style={{ color: '#0c447c' }}>
            The draft has ended. Final rosters are below.
          </p>
        </div>
      )}

      <div className="mx-4 sm:mx-5 mt-4 rounded-xl border border-line bg-surface px-4 py-3">
        <button onClick={() => setViewByTeamOpen((o) => !o)} className="w-full flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide m-0" style={{ color: '#5a6b7d' }}>
            View rosters
          </p>
          <i className={`ti ti-chevron-${viewByTeamOpen ? 'up' : 'down'} text-base text-muted`} aria-hidden="true" />
        </button>
        {viewByTeamOpen && (
          <>
            <div className="flex gap-1.5 mt-2 mb-2">
              <button
                onClick={() => setRosterViewMode('team')}
                className="text-xs px-2.5 py-1 rounded-md font-medium"
                style={{
                  background: rosterViewMode === 'team' ? '#185fa5' : '#ffffff',
                  color: rosterViewMode === 'team' ? '#ffffff' : '#3d4a57',
                  border: '1px solid #d8dde2',
                }}
              >
                View by team
              </button>
              <button
                onClick={() => {
                  setRosterViewMode('round');
                  setSelectedRound(Math.min(currentRound, maxRounds));
                }}
                className="text-xs px-2.5 py-1 rounded-md font-medium"
                style={{
                  background: rosterViewMode === 'round' ? '#185fa5' : '#ffffff',
                  color: rosterViewMode === 'round' ? '#ffffff' : '#3d4a57',
                  border: '1px solid #d8dde2',
                }}
              >
                View by round
              </button>
            </div>

            {rosterViewMode === 'team' && (
              <>
                <p className="text-[10px] text-muted mb-2">Tap a team to view their roster</p>
                <div className="flex gap-2 flex-wrap mb-3">
                  {teams.map((t) => {
                    const color = t.team_color || '#0074ff';
                    const selected = viewingTeamId === t.id;
                    const isMine = t.id === myTeamId;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setViewingTeamId(viewingTeamId === t.id ? null : t.id)}
                        className="text-xs px-2.5 py-1.5 rounded-md font-medium flex items-center gap-1.5"
                        style={{
                          background: lightenColor(color, 0.85),
                          color: '#0c2340',
                          border: selected ? `2px solid ${color}` : isMine ? '2px solid #185fa5' : '2px solid transparent',
                        }}
                      >
                        <FootballIcon color={color} size={14} />
                        {t.name}
                        {isMine ? ' (you)' : ''}
                      </button>
                    );
                  })}
                </div>

                {viewingTeamId && rosterByTeam[viewingTeamId] && (() => {
                  const slots = buildTeamSlots(viewingTeamId);
                  const firstEmptyIndex = slots.findIndex((s) => !s);
                  const viewedTeam = teamsById[viewingTeamId];
                  const teamColor = viewedTeam?.team_color || '#0074ff';
                  const isTeamOnClock =
                    teamOnClock?.id === viewingTeamId && (draftStatus === 'in_progress' || draftStatus === 'paused');
                  return (
                    <div className="bg-white rounded-lg p-3.5 mb-1">
                      <div className="flex justify-between items-center mb-2">
                        <p className="text-sm font-medium text-ink m-0">{viewedTeam?.name}</p>
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
                      {draftStatus === 'completed' &&
                        rosterByTeam[viewingTeamId] &&
                        (rosterByTeam[viewingTeamId].count < minRoster ||
                          rosterByTeam[viewingTeamId].femaleCount < minFemale) && (
                          <div className="bg-[#faeeda] rounded-md px-2.5 py-2 mb-2 flex gap-1.5">
                            <i className="ti ti-alert-triangle text-sm flex-shrink-0" style={{ color: '#854f0b' }} aria-hidden="true" />
                            <p className="text-[11px] m-0" style={{ color: '#633806' }}>
                              Below the {minRoster}-player / {minFemale}-female minimum.
                            </p>
                          </div>
                        )}
                      <div className="grid grid-cols-6 gap-1.5">
                        {slots.map((entry, i) => {
                          const player = entry?.player;
                          const isClockSlot = isTeamOnClock && i === firstEmptyIndex;
                          return (
                            <div
                              key={player?.id || `${entry?.kind || 'empty'}-${i}`}
                              onClick={() => player && openProfile(player.id)}
                              className="rounded-lg flex flex-col items-center text-center px-1 py-2"
                              style={{
                                minHeight: 88,
                                cursor: player ? 'pointer' : 'default',
                                background: isClockSlot ? lightenColor(teamColor, 0.85) : '#f1f3f6',
                                border: isClockSlot ? `2px solid ${teamColor}` : '2px solid transparent',
                              }}
                            >
                              {isClockSlot ? (
                                <>
                                  <div
                                    className="w-8 h-8 rounded-full bg-white flex items-center justify-center"
                                    style={{ border: `2px solid ${teamColor}` }}
                                  >
                                    <i className="ti ti-clock text-base" style={{ color: teamColor }} aria-hidden="true" />
                                  </div>
                                  <p className="text-[9px] font-medium m-0 mt-1 leading-tight truncate w-full" style={{ color: '#0c2340' }}>
                                    On the clock
                                  </p>
                                  <p className="text-[9px] font-medium m-0 leading-tight truncate w-full" style={{ color: '#0c2340' }}>
                                    {viewedTeam?.name}
                                  </p>
                                  <span className="text-[8px] mt-0.5" style={{ color: '#5a6b7d' }}>
                                    Rnd {currentRound} . Pick # {currentPickNumber}
                                  </span>
                                </>
                              ) : entry?.kind === 'gm' ? (
                                <>
                                  {player.headshot_url ? (
                                    <img src={player.headshot_url} alt={player.full_name} className="w-8 h-8 rounded-full object-cover" />
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
                                      <i className="ti ti-user text-faint text-base" aria-hidden="true" />
                                    </div>
                                  )}
                                  <p className="text-[10px] font-medium text-ink m-0 mt-1 leading-tight truncate w-full">
                                    {player.full_name}
                                  </p>
                                  <span className="text-[9px] font-medium mt-0.5" style={{ color: '#185fa5' }}>
                                    {roleByEmail[player.email?.toLowerCase()] === 'commissioner' ? 'Commish' : 'GM'}
                                  </span>
                                </>
                              ) : entry?.kind === 'player' ? (
                                <>
                                  {player.headshot_url ? (
                                    <img src={player.headshot_url} alt={player.full_name} className="w-8 h-8 rounded-full object-cover" />
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
                                      <i className="ti ti-user text-faint text-base" aria-hidden="true" />
                                    </div>
                                  )}
                                  <p className="text-[10px] font-medium text-ink m-0 mt-1 leading-tight truncate w-full">
                                    {player.full_name}
                                  </p>
                                  <span className="text-[9px] text-muted mt-0.5">
                                    Rnd {entry.pick.round} . Pick # {entry.pick.pick_number}
                                  </span>
                                </>
                              ) : entry?.kind === 'skipped' ? (
                                <>
                                  <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
                                    <i className="ti ti-x text-faint text-base" aria-hidden="true" />
                                  </div>
                                  <p className="text-[10px] text-muted m-0 mt-1">Skipped</p>
                                  <span className="text-[9px] text-faint mt-0.5">
                                    Rnd {entry.pick.round} . Pick # {entry.pick.pick_number}
                                  </span>
                                </>
                              ) : entry?.kind === 'manual' ? (
                                <>
                                  {player.headshot_url ? (
                                    <img src={player.headshot_url} alt={player.full_name} className="w-8 h-8 rounded-full object-cover" />
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
                                      <i className="ti ti-user text-faint text-base" aria-hidden="true" />
                                    </div>
                                  )}
                                  <p className="text-[10px] font-medium text-ink m-0 mt-1 leading-tight truncate w-full">
                                    {player.full_name}
                                  </p>
                                  <span className="text-[9px] text-muted mt-0.5">Added manually</span>
                                </>
                              ) : (
                                <>
                                  <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center opacity-50">
                                    <i className="ti ti-user text-faint text-base" aria-hidden="true" />
                                  </div>
                                  <p className="text-[9px] text-faint m-0 mt-1" style={{ fontStyle: 'italic' }}>
                                    Empty
                                  </p>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}

            {rosterViewMode === 'round' && (
              <>
                <div className="flex gap-2 flex-wrap mb-2">
                  {Array.from({ length: maxRounds }, (_, i) => i + 1).map((r) => (
                    <button
                      key={r}
                      onClick={() => setSelectedRound(r)}
                      className="text-xs px-2.5 py-1.5 rounded-md font-medium"
                      style={{
                        background: selectedRound === r ? '#185fa5' : '#e6f1fb',
                        color: selectedRound === r ? '#ffffff' : '#0c447c',
                        border: '2px solid transparent',
                      }}
                    >
                      Round {r}
                    </button>
                  ))}
                </div>
                <div className="bg-white rounded-lg p-3.5">
                  <div className="grid grid-cols-6 gap-1.5">
                    {roundSlots.map((slot) => {
                      const isSkippedPick = slot.pick && !slot.pick.player_id;
                      const isClockSlot = slot.pickNumber === currentPickNumber && !slot.player && !isSkippedPick;
                      const teamColor = slot.team?.team_color || '#0074ff';
                      return (
                        <div
                          key={slot.pickNumber}
                          onClick={() => slot.player && openProfile(slot.player.id)}
                          className="rounded-lg flex flex-col items-center text-center px-1 py-2"
                          style={{
                            minHeight: 100,
                            background: isClockSlot ? lightenColor(teamColor, 0.85) : '#f1f3f6',
                            border: isClockSlot ? `2px solid ${teamColor}` : '2px solid transparent',
                            cursor: slot.player ? 'pointer' : 'default',
                          }}
                        >
                          {slot.player ? (
                            <>
                              {slot.player.headshot_url ? (
                                <img
                                  src={slot.player.headshot_url}
                                  alt={slot.player.full_name}
                                  className="w-8 h-8 rounded-full object-cover"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
                                  <i className="ti ti-user text-faint text-base" aria-hidden="true" />
                                </div>
                              )}
                              <p className="text-[10px] font-medium text-ink m-0 mt-1 leading-tight truncate w-full">
                                {slot.player.full_name}
                              </p>
                              <span className="text-[9px] text-muted mt-0.5">Pick # {slot.pickNumber}</span>
                            </>
                          ) : isSkippedPick ? (
                            <>
                              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
                                <i className="ti ti-x text-faint text-base" aria-hidden="true" />
                              </div>
                              <p className="text-[10px] text-muted m-0 mt-1">Skipped</p>
                            </>
                          ) : isClockSlot ? (
                            <>
                              <div
                                className="w-8 h-8 rounded-full bg-white flex items-center justify-center"
                                style={{ border: `2px solid ${teamColor}` }}
                              >
                                <i className="ti ti-clock text-base" style={{ color: teamColor }} aria-hidden="true" />
                              </div>
                              <p className="text-[9px] font-medium m-0 mt-1 leading-tight truncate w-full" style={{ color: '#0c2340' }}>
                                On the clock
                              </p>
                              <p className="text-[9px] font-medium m-0 leading-tight truncate w-full" style={{ color: '#0c2340' }}>
                                {slot.team?.name}
                              </p>
                              <span className="text-[8px] mt-0.5" style={{ color: '#5a6b7d' }}>
                                Pick # {slot.pickNumber}
                              </span>
                            </>
                          ) : (
                            <>
                              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center opacity-50">
                                <i className="ti ti-user text-faint text-base" aria-hidden="true" />
                              </div>
                              <p className="text-[9px] text-faint m-0 mt-1" style={{ fontStyle: 'italic' }}>
                                Not yet selected
                              </p>
                            </>
                          )}
                          {!isClockSlot && (
                            <div className="mt-auto pt-1 flex items-center gap-1">
                              <FootballIcon color={teamColor} size={10} />
                              <span className="text-[9px] text-muted truncate">{slot.team?.name}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>

      <div className="mx-4 sm:mx-5 mt-3 rounded-xl border border-line bg-royal-pale/40 px-4 py-3.5">
        <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#0c447c' }}>
          Drafted players
        </p>
        <p className="text-[10px] text-muted mb-3">Scroll to browse other rounds</p>

        <div className="flex gap-2 overflow-x-auto pb-2" ref={draftedScrollRef}>
          {allSlots.map((slot) => {
            const isSkippedPick = slot.pick && !slot.pick.player_id;
            const isClockSlot =
              slot.pickNumber === currentPickNumber &&
              !slot.player &&
              !isSkippedPick &&
              (draftStatus === 'in_progress' || draftStatus === 'paused');
            const teamColor = slot.team?.team_color || '#0074ff';
            const owner = ownerByTeam[slot.team?.id];
            return (
              <div
                key={slot.pickNumber}
                ref={slot.pickNumber === currentPickNumber ? currentPickRef : null}
                onClick={() => slot.player && openProfile(slot.player.id)}
                className="flex-none rounded-xl p-3 flex flex-col items-center text-center"
                style={{
                  width: 150,
                  height: 210,
                  background: isClockSlot ? lightenColor(teamColor, 0.85) : '#ffffff',
                  border: isClockSlot
                    ? `2px solid ${teamColor}`
                    : slot.pickNumber === currentPickNumber
                    ? '1.5px solid #185fa5'
                    : '1px solid #d8dde2',
                  cursor: slot.player ? 'pointer' : 'default',
                }}
              >
                <p className="text-[10px] text-muted m-0 mb-1.5">
                  Round {slot.round} &middot; Pick {slot.pickNumber}
                </p>
                {slot.player ? (
                  <>
                    {slot.player.headshot_url ? (
                      <img
                        src={slot.player.headshot_url}
                        alt={slot.player.full_name}
                        className="w-10 h-10 rounded-full object-cover mb-1.5"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center mb-1.5">
                        <i className="ti ti-user text-faint text-xl" aria-hidden="true" />
                      </div>
                    )}
                    <p className="text-xs font-medium text-ink m-0 leading-snug">{slot.player.full_name}</p>
                    <p className="text-[10px] text-muted m-0 mb-1.5">
                      {slot.player.offensive_position} / {slot.player.defensive_position}
                    </p>
                  </>
                ) : isSkippedPick ? (
                  <>
                    <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center mb-1.5">
                      <i className="ti ti-x text-faint text-xl" aria-hidden="true" />
                    </div>
                    <p className="text-xs text-muted m-0 leading-snug">Skipped</p>
                  </>
                ) : isClockSlot ? (
                  <>
                    <div
                      className="w-10 h-10 rounded-full bg-white flex items-center justify-center mb-1.5"
                      style={{ border: `2px solid ${teamColor}` }}
                    >
                      <i className="ti ti-clock text-xl" style={{ color: teamColor }} aria-hidden="true" />
                    </div>
                    <p className="text-xs font-medium m-0 leading-snug" style={{ color: '#0c2340' }}>
                      On the clock
                    </p>
                  </>
                ) : (
                  <>
                    <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center mb-1.5">
                      <i className="ti ti-user text-faint text-xl" aria-hidden="true" />
                    </div>
                    <p className="text-xs text-faint m-0 leading-snug" style={{ fontStyle: 'italic' }}>
                      Not yet selected
                    </p>
                  </>
                )}
                <div className="mt-auto pt-1.5 flex flex-col items-center gap-0.5">
                  {slot.player ? (
                    <>
                      <div className="flex items-center gap-1.5 justify-center">
                        <FootballIcon color={teamColor} size={16} />
                        <span className="text-[13px] font-semibold leading-none" style={{ color: '#0c2340' }}>
                          Drafted by: {slot.team?.name}
                        </span>
                      </div>
                      {owner && <span className="text-[10px] text-muted">({owner.name})</span>}
                    </>
                  ) : (
                    <div className="flex items-center gap-1.5 justify-center min-w-0">
                      <FootballIcon color={teamColor} size={12} />
                      <span className="text-[10px] text-muted truncate leading-none">
                        {slot.team?.name}
                        {owner ? ` \u00b7 ${owner.name}` : ''}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Read-only player profile popups — multiple can be open at once, stacked */}
      {openProfileIds.map((id, idx) => {
        const p = playersById[id];
        if (!p) return null;
        const team = p.team_id ? teamsById[p.team_id] : null;
        const role = roleByEmail[p.email?.toLowerCase()];
        return (
          <div
            key={id}
            className="fixed rounded-xl bg-white border border-line"
            style={{
              width: 290,
              right: 16 + idx * 20,
              bottom: 16 + idx * 20,
              zIndex: 60 + idx,
              maxHeight: '75vh',
              overflowY: 'auto',
              boxShadow: '0 8px 24px rgba(12,35,64,0.25)',
            }}
          >
            <div className="flex items-start justify-between gap-2 px-4 pt-3.5 pb-2 border-b border-line">
              <div className="flex gap-2.5 items-center min-w-0">
                {p.headshot_url ? (
                  <img src={p.headshot_url} alt={p.full_name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center flex-shrink-0">
                    <i className="ti ti-user text-faint text-xl" aria-hidden="true" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink m-0 truncate">{p.full_name}</p>
                  <p className="text-[11px] text-muted m-0">{p.gender}</p>
                </div>
              </div>
              <button
                onClick={() => closeProfile(id)}
                className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center hover:bg-surface"
                aria-label="Close"
              >
                <i className="ti ti-x text-base text-muted" aria-hidden="true" />
              </button>
            </div>

            <div className="px-4 py-3 flex flex-col gap-2.5">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-faint m-0 mb-0.5">Status</p>
                {role === 'commissioner' ? (
                  <p className="text-xs font-medium m-0" style={{ color: '#185fa5' }}>
                    Commissioner &middot; {team?.name || 'Unassigned'}
                  </p>
                ) : role === 'gm' ? (
                  <p className="text-xs font-medium m-0" style={{ color: '#185fa5' }}>
                    GM &middot; {team?.name || 'Unassigned'}
                  </p>
                ) : p.draft_pick_number ? (
                  <p className="text-xs text-ink m-0">
                    Drafted &middot; Rnd {getRound(p.draft_pick_number, numTeams)} . Pick # {p.draft_pick_number} &middot;{' '}
                    {team?.name || ''}
                  </p>
                ) : p.team_id ? (
                  <p className="text-xs text-ink m-0">Added manually &middot; {team?.name || ''}</p>
                ) : (
                  <p className="text-xs text-faint m-0" style={{ fontStyle: 'italic' }}>
                    Undrafted
                  </p>
                )}
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wide text-faint m-0 mb-0.5">Position</p>
                <p className="text-xs text-ink m-0">
                  Offense: {p.offensive_position} &middot; Defense: {p.defensive_position}
                </p>
                <p className="text-[11px] text-muted m-0">Prefers: {p.position_preference}</p>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wide text-faint m-0 mb-0.5">Bio</p>
                <p className="text-xs text-ink m-0">
                  {p.height_feet}'{p.height_inches}" &middot; Previous team: {p.previous_team || 'None'}
                </p>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wide text-faint m-0 mb-0.5">Injury status</p>
                <p className="text-xs text-ink m-0">
                  {p.injury_status === 'None' ? 'None' : `${p.injury_status} (${p.weeks_until_recovered || '?'} weeks)`}
                </p>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wide text-faint m-0 mb-0.5">Availability</p>
                <p className="text-xs text-ink m-0">Unavailable: {p.game_time_unavailable}</p>
                <p className="text-[11px] text-muted m-0">
                  {p.unavailable_mondays && p.unavailable_mondays.length > 0
                    ? `Out: ${p.unavailable_mondays.join(', ')}`
                    : 'Available all season'}
                </p>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wide text-faint m-0 mb-0.5">Preferences</p>
                <p className="text-[11px] text-muted m-0">
                  {p.call_on_draft_night ? 'Wants a call on draft night' : 'No call needed on draft night'}
                </p>
                <p className="text-[11px] text-muted m-0">
                  {p.enjoys_pub ? 'Up for the post-game pub' : 'Skipping the post-game pub'}
                </p>
              </div>
            </div>
          </div>
        );
      })}

      {showCompleteModal && (
        <div
          className="fixed inset-0 flex items-center justify-center px-4"
          style={{ background: 'rgba(12,35,64,0.55)', zIndex: 100 }}
          onClick={() => setShowCompleteModal(false)}
        >
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl p-6 text-center max-w-sm w-full">
            <div
              className="w-14 h-14 rounded-full mx-auto flex items-center justify-center mb-3"
              style={{ background: '#e6f1fb' }}
            >
              <i className="ti ti-confetti text-3xl" style={{ color: '#185fa5' }} aria-hidden="true" />
            </div>
            <p className="text-lg font-semibold m-0" style={{ color: '#0c2340' }}>
              Congratulations — the draft is complete!
            </p>
            <p className="text-sm text-muted mt-2 mb-4">
              Every team has finished building their roster. Final results are ready to view below.
            </p>
            <button onClick={() => setShowCompleteModal(false)} className="btn-primary w-full">
              View final rosters
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
