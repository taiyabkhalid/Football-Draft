'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { getRound, getTeamOnTheClock, buildFullPickOrder } from '../../lib/draftLogic';
import BrandHeader from '../../lib/BrandHeader';
import FootballIcon from '../../lib/FootballIcon';

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

  const currentRoundRef = useRef(null);

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
  const currentRound = numTeams ? getRound(currentPickNumber, numTeams) : 1;
  const nextRound = numTeams ? getRound(currentPickNumber + 1, numTeams) : 1;
  const teamOnClock = numTeams ? getTeamOnTheClock(currentPickNumber, numTeams, teams) : null;
  const teamNextOnClock = numTeams ? getTeamOnTheClock(currentPickNumber + 1, numTeams, teams) : null;
  const draftStatus = settings?.draft_status || 'not_started';
  const pickClockSeconds = settings?.pick_clock_seconds ?? 120;
  const maxRounds = settings?.max_roster_size ?? 12;

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
        team: getTeamOnTheClock(pickNum, numTeams, teams),
      });
    }
    return list;
  }, [currentPickNumber, numTeams, teams]);

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

  const allSlots = useMemo(() => {
    if (!numTeams) return [];
    return buildFullPickOrder(numTeams, maxRounds).map((slot) => {
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
  }, [numTeams, maxRounds, teams, pickByNumber, playersById]);

  useEffect(() => {
    if (!roundInitialized.current && currentRound) {
      setSelectedRound(Math.min(currentRound, maxRounds));
      roundInitialized.current = true;
    }
  }, [currentRound, maxRounds]);

  const roundSlots = useMemo(() => allSlots.filter((s) => s.round === selectedRound), [allSlots, selectedRound]);

  const maxRoster = settings?.max_roster_size ?? 12;
  function buildTeamSlots(teamId) {
    const roster = rosterByTeam[teamId]?.players || [];
    const rank = (p) => {
      const role = roleByEmail[p.email?.toLowerCase()];
      if (role === 'commissioner' || role === 'gm') return -1; // always anchored first
      if (p.draft_pick_number) return p.draft_pick_number;
      return Number.MAX_SAFE_INTEGER;
    };
    const sorted = [...roster].sort((a, b) => rank(a) - rank(b));
    const slots = [];
    for (let i = 0; i < maxRoster; i++) {
      slots.push(sorted[i] || null);
    }
    return slots;
  }

  useEffect(() => {
    if (currentRoundRef.current) {
      currentRoundRef.current.scrollIntoView({ inline: 'start', behavior: 'smooth', block: 'nearest' });
    }
  }, [currentRound]);

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
        pageLabel={draftStatus === 'completed' ? 'Draft results' : 'Live draft'}
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

          <p className="text-xs text-muted px-4 sm:px-5 pt-1">
            Round {currentRound}, pick {currentPickNumber}
          </p>
        </>
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
                onClick={() => setRosterViewMode('round')}
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
                  {teams.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setViewingTeamId(viewingTeamId === t.id ? null : t.id)}
                      className="text-xs px-2.5 py-1.5 rounded-md font-medium flex items-center gap-1.5"
                      style={{
                        background: viewingTeamId === t.id ? '#185fa5' : t.id === myTeamId ? '#e6f1fb' : '#ffffff',
                        color: viewingTeamId === t.id ? '#ffffff' : t.id === myTeamId ? '#0c447c' : '#3d4a57',
                        border: t.id === myTeamId && viewingTeamId !== t.id ? '1px solid #185fa5' : 'none',
                      }}
                    >
                      <FootballIcon color={viewingTeamId === t.id ? '#ffffff' : t.team_color || '#0074ff'} size={14} />
                      {t.name}
                      {t.id === myTeamId ? ' (you)' : ''}
                    </button>
                  ))}
                </div>

                {viewingTeamId && rosterByTeam[viewingTeamId] && (
                  <div className="bg-white rounded-lg p-3.5 mb-1">
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
                    <div className="grid grid-cols-6 gap-1.5">
                      {buildTeamSlots(viewingTeamId).map((p, i) => (
                        <div
                          key={p?.id || `empty-${i}`}
                          onClick={() => p && openProfile(p.id)}
                          className="rounded-lg bg-surface flex flex-col items-center text-center px-1 py-2"
                          style={{ minHeight: 88, cursor: p ? 'pointer' : 'default' }}
                        >
                          {p ? (
                            <>
                              {p.headshot_url ? (
                                <img src={p.headshot_url} alt={p.full_name} className="w-8 h-8 rounded-full object-cover" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
                                  <i className="ti ti-user text-faint text-base" aria-hidden="true" />
                                </div>
                              )}
                              <p className="text-[10px] font-medium text-ink m-0 mt-1 leading-tight truncate w-full">
                                {p.full_name}
                              </p>
                              {roleByEmail[p.email?.toLowerCase()] === 'commissioner' ? (
                                <span className="text-[9px] font-medium mt-0.5" style={{ color: '#185fa5' }}>
                                  Commish
                                </span>
                              ) : roleByEmail[p.email?.toLowerCase()] === 'gm' ? (
                                <span className="text-[9px] font-medium mt-0.5" style={{ color: '#185fa5' }}>
                                  GM
                                </span>
                              ) : p.draft_pick_number ? (
                                <span className="text-[9px] text-muted mt-0.5">
                                  R{roundByPlayerId[p.id]} &middot; #{p.draft_pick_number}
                                </span>
                              ) : null}
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
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {rosterViewMode === 'round' && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <button
                    onClick={() => setSelectedRound((r) => Math.max(1, r - 1))}
                    disabled={selectedRound <= 1}
                    className="btn-secondary text-xs px-2 py-1"
                  >
                    <i className="ti ti-chevron-left text-sm" aria-hidden="true" />
                  </button>
                  <p className="text-xs font-medium text-ink m-0">
                    Round {selectedRound} of {maxRounds}
                  </p>
                  <button
                    onClick={() => setSelectedRound((r) => Math.min(maxRounds, r + 1))}
                    disabled={selectedRound >= maxRounds}
                    className="btn-secondary text-xs px-2 py-1"
                  >
                    <i className="ti ti-chevron-right text-sm" aria-hidden="true" />
                  </button>
                </div>
                <div className="bg-white rounded-lg p-3.5">
                  <div className="grid grid-cols-6 gap-1.5">
                    {roundSlots.map((slot) => (
                      <div
                        key={slot.pickNumber}
                        onClick={() => slot.player && openProfile(slot.player.id)}
                        className="rounded-lg bg-surface flex flex-col items-center text-center px-1 py-2"
                        style={{
                          minHeight: 100,
                          border: slot.pickNumber === currentPickNumber ? '1.5px solid #185fa5' : '1px solid transparent',
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
                          </>
                        ) : slot.pick && !slot.pick.player_id ? (
                          <>
                            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
                              <i className="ti ti-x text-faint text-base" aria-hidden="true" />
                            </div>
                            <p className="text-[10px] text-muted m-0 mt-1">Skipped</p>
                          </>
                        ) : slot.pickNumber === currentPickNumber ? (
                          <>
                            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
                              <i className="ti ti-clock text-base" style={{ color: '#185fa5' }} aria-hidden="true" />
                            </div>
                            <p className="text-[10px] font-medium m-0 mt-1" style={{ color: '#185fa5' }}>
                              On the clock
                            </p>
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
                        <div className="mt-auto pt-1 flex items-center gap-1">
                          <FootballIcon color={slot.team?.team_color || '#0074ff'} size={10} />
                          <span className="text-[9px] text-muted truncate">{slot.team?.name}</span>
                        </div>
                      </div>
                    ))}
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

        <div className="flex gap-2 overflow-x-auto pb-2">
          {allSlots.map((slot) => {
            const isFirstOfCurrentRound = slot.round === currentRound && slot.team?.draft_position === 1;
            return (
              <div
                key={slot.pickNumber}
                ref={isFirstOfCurrentRound ? currentRoundRef : null}
                onClick={() => slot.player && openProfile(slot.player.id)}
                className="flex-none rounded-xl p-3 bg-white flex flex-col"
                style={{
                  width: 150,
                  height: 190,
                  border: slot.pickNumber === currentPickNumber ? '1.5px solid #185fa5' : '1px solid #d8dde2',
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
                ) : slot.pick && !slot.pick.player_id ? (
                  <>
                    <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center mb-1.5">
                      <i className="ti ti-x text-faint text-xl" aria-hidden="true" />
                    </div>
                    <p className="text-xs text-muted m-0 leading-snug">Skipped</p>
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
                <div className="mt-auto pt-1.5 flex items-center gap-1.5">
                  <FootballIcon color={slot.team?.team_color || '#0074ff'} size={12} />
                  <span className="text-[10px] text-muted truncate">
                    {slot.team?.name}
                    {ownerByTeam[slot.team?.id] ? ` · ${ownerByTeam[slot.team.id].name}` : ''}
                  </span>
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
                    Drafted &middot; Round {getRound(p.draft_pick_number, numTeams)}, Pick {p.draft_pick_number} &middot;{' '}
                    {team?.name || ''}
                  </p>
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
    </main>
  );
}
