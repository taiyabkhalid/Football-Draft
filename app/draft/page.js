'use client';

import { useEffect, useState, useCallback, useMemo, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { getRound, getTeamOnTheClock, buildFullPickOrder, pickInRound } from '../../lib/draftLogic';
import BrandHeader from '../../lib/BrandHeader';
import FootballIcon, { lightenColor, StarIcon } from '../../lib/FootballIcon';
import PrintRosterButton from '../../lib/PrintRosterButton';

const ALL_POSITIONS = ['QB', 'WR', 'C', 'CB', 'Safety', 'LB', 'Rush'];
const OFFENSIVE_POSITIONS = ['QB', 'WR', 'C'];

function previousTeamLabel(previousTeam) {
  if (!previousTeam) return 'New to Go Mammoth';
  if (previousTeam === 'Other') return 'Played in a different league';
  return previousTeam;
}

function DraftPageContent() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [profile, setProfile] = useState(null);
  const [myEmail, setMyEmail] = useState('');

  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [inactivePlayers, setInactivePlayers] = useState([]);
  const [teamRankings, setTeamRankings] = useState([]);
  const [rankingToast, setRankingToast] = useState(false);
  const [draftConfirmation, setDraftConfirmation] = useState(null);
  const [picks, setPicks] = useState([]);
  const [settings, setSettings] = useState(null);
  const [profiles, setProfiles] = useState([]);

  const [searchName, setSearchName] = useState('');
  const [searchPosition, setSearchPosition] = useState('');
  const [searchGender, setSearchGender] = useState('');
  const [searchPreviousTeam, setSearchPreviousTeam] = useState('');
  const [searchAvailability, setSearchAvailability] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [viewByTeamOpen, setViewByTeamOpen] = useState(false);
  const [upcomingPicksOpen, setUpcomingPicksOpen] = useState(false);
  const rostersSectionRef = useRef(null);
  const playerSelectionRef = useRef(null);

  const searchParams = useSearchParams();
  const focusParam = searchParams.get('focus');

  function scrollToElement(ref, delay = 200, offset = 100) {
    setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' });
    }, delay);
  }

  function scrollRostersIntoView() {
    scrollToElement(rostersSectionRef, 250);
  }

  const [rosterViewMode, setRosterViewMode] = useState('team'); // 'team' | 'round'
  const [selectedRound, setSelectedRound] = useState(1);
  const roundInitialized = useRef(false);

  const [drafting, setDrafting] = useState(null);
  const [skipping, setSkipping] = useState(false);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const [skipReason, setSkipReason] = useState('gm_slow');
  const [togglingPause, setTogglingPause] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [viewingTeamId, setViewingTeamId] = useState(null);
  const [mobileListTab, setMobileListTab] = useState('available');
  const [leftColumnTab, setLeftColumnTab] = useState('available');

  useEffect(() => {
    if (focusParam === 'search') {
      setTimeout(() => {
        playerSelectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    } else if (focusParam === 'myteam' && profile?.team_id) {
      setViewByTeamOpen(true);
      setRosterViewMode('team');
      setViewingTeamId(profile.team_id);
      scrollToElement(rostersSectionRef, 400);
    } else if (focusParam === 'results') {
      setViewByTeamOpen(true);
      setRosterViewMode('board');
      scrollToElement(rostersSectionRef, 400);
    }
  }, [focusParam, profile]);

  function jumpToTeam(teamId) {
    setViewByTeamOpen(true);
    setRosterViewMode('team');
    setViewingTeamId(teamId);
    scrollRostersIntoView();
  }
  const [openProfileIds, setOpenProfileIds] = useState([]);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const prevDraftStatusRef = useRef(null);

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
        .maybeSingle();
      if (!profileRow) {
        // Not a GM/commissioner - check if they're a designated draft-day
        // proxy for any team before turning them away.
        const { data: allTeams } = await supabase.from('teams').select('id, proxy_email');
        const isProxy = (allTeams || []).some((t) =>
          (t.proxy_email || '')
            .split(',')
            .map((e) => e.trim().toLowerCase())
            .includes(user.email?.toLowerCase())
        );
        if (!isProxy) {
          router.push('/login');
          return;
        }
      } else {
        setProfile(profileRow);
      }
      setMyEmail(user.email?.toLowerCase() || '');
      setAuthChecked(true);
    }
    checkAuth();
  }, [router]);

  // ---- Data fetching ----
  const fetchAll = useCallback(async () => {
    const [teamsRes, playersRes, picksRes, settingsRes, profilesRes, inactiveRes] = await Promise.all([
      supabase.from('teams').select('*').order('draft_position', { ascending: true }),
      supabase.from('players').select('*').eq('is_active', true),
      supabase.from('draft_picks').select('*').order('pick_number', { ascending: true }),
      supabase.from('draft_settings').select('*').eq('id', 1).single(),
      supabase.from('profiles').select('role, team_id, email'),
      supabase.from('players').select('*').eq('is_active', false),
    ]);
    setTeams(teamsRes.data || []);
    setPlayers(playersRes.data || []);
    setPicks(picksRes.data || []);
    setSettings(settingsRes.data || null);
    setProfiles(profilesRes.data || []);
    setInactivePlayers(inactiveRes.data || []);
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
    // Fallback poll in case a realtime event is ever missed - keeps this
    // page from staying stale (e.g. the clock going out of sync with the
    // spectator page) for longer than a bounded window.
    const pollTimer = setInterval(fetchAll, 10000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollTimer);
    };
  }, [authChecked, fetchAll]);

  // ---- Derived draft state ----
  const currentPickNumber = picks.length + 1;
  const numTeams = settings?.num_teams || teams.length;
  const draftStatus = settings?.draft_status || 'not_started';
  const draftType = settings?.draft_type || 'snake';
  const currentRound = numTeams ? getRound(currentPickNumber, numTeams) : 1;
  const nextRound = numTeams ? getRound(currentPickNumber + 1, numTeams) : 1;
  const teamOnClock = numTeams ? getTeamOnTheClock(currentPickNumber, numTeams, teams, draftType) : null;
  const teamNextOnClock = numTeams ? getTeamOnTheClock(currentPickNumber + 1, numTeams, teams, draftType) : null;

  const minRoster = settings?.min_roster_size ?? 9;
  const minFemale = settings?.min_female_players ?? 2;
  const pickClockSeconds = settings?.pick_clock_seconds ?? 120;

  // The clock is anchored to a shared server timestamp (current_pick_started_at)
  // rather than a local countdown, so leaving and returning to this page - or
  // viewing from a different device - always shows the true remaining time
  // instead of restarting from the full pick clock.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-start the draft the moment the scheduled time passes, from
  // whichever page happens to be open - previously this only ever ran
  // once, on Commissioner Tools' initial load, so it silently missed the
  // moment unless someone happened to be on that exact page at that exact
  // time. Safe to call repeatedly and from multiple open tabs/devices at
  // once - it only actually changes anything the first time it succeeds.
  useEffect(() => {
    if (draftStatus !== 'not_started') return;
    const timer = setInterval(() => {
      supabase.rpc('start_draft_if_due');
      supabase.rpc('randomize_draft_order_if_due');
    }, 5000);
    return () => clearInterval(timer);
  }, [draftStatus]);

  const pickStartedAt = settings?.current_pick_started_at ? new Date(settings.current_pick_started_at).getTime() : null;
  const liveSecondsLeft = pickStartedAt
    ? Math.max(pickClockSeconds - Math.floor((now - pickStartedAt) / 1000), 0)
    : pickClockSeconds;
  // While paused, the clock is frozen at whatever was left the moment it was paused,
  // rather than continuing to tick down against the wall clock.
  const secondsLeft =
    draftStatus === 'paused' && settings?.paused_seconds_remaining != null
      ? settings.paused_seconds_remaining
      : liveSecondsLeft;

  const timerDisplay = useMemo(() => {
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }, [secondsLeft]);

  const draftDatetimeMs = settings?.draft_datetime ? new Date(settings.draft_datetime).getTime() : null;
  const msUntilDraft = draftDatetimeMs !== null ? draftDatetimeMs - now : null;
  const draftStartCountdown = useMemo(() => {
    if (msUntilDraft === null) return '--:--';
    const totalSeconds = Math.max(Math.floor(msUntilDraft / 1000), 0);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const mmss = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    if (days > 0) return `${days}d ${hours}h ${mmss}`;
    if (hours > 0) return `${hours}h ${mmss}`;
    return mmss;
  }, [msUntilDraft]);
  const showDraftOrderPreview = msUntilDraft !== null && msUntilDraft <= 30 * 60 * 1000;
  const secondsUntilDraftGm = msUntilDraft !== null ? Math.floor(msUntilDraft / 1000) : null;

  const scrolledToTopForStartRef = useRef(false);
  useEffect(() => {
    if (secondsUntilDraftGm !== null && secondsUntilDraftGm <= 10 && secondsUntilDraftGm >= 0 && !scrolledToTopForStartRef.current) {
      scrolledToTopForStartRef.current = true;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [secondsUntilDraftGm]);

  const clockUrgent = draftStatus === 'in_progress' && secondsLeft <= 20;

  function openProfile(playerId) {
    setOpenProfileIds((ids) => (ids.includes(playerId) ? ids : [...ids, playerId]));
  }
  function closeProfile(playerId) {
    setOpenProfileIds((ids) => ids.filter((id) => id !== playerId));
  }

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
  const roleByEmail = useMemo(() => {
    const map = {};
    for (const profile of profiles) {
      if (profile.email) map[profile.email.toLowerCase()] = profile.role;
    }
    return map;
  }, [profiles]);
  const previousPick = picks.length > 0 ? picks[picks.length - 1] : null;

  const upcomingPicks = useMemo(() => {
    if (!numTeams) return [];
    const list = [];
    for (let i = 0; i <= 7; i++) {
      const pickNum = currentPickNumber + i;
      list.push({
        pickNumber: pickNum,
        round: getRound(pickNum, numTeams),
        team: getTeamOnTheClock(pickNum, numTeams, teams, draftType),
      });
    }
    return list;
  }, [currentPickNumber, numTeams, teams, draftType]);

  const availablePlayers = useMemo(() => players.filter((p) => !p.team_id), [players]);

  // The draft runs until the whole DRAFTABLE pool is allocated, not a fixed
  // roster-size cap - so the round count is derived from the pool size and
  // team count, and the last round is partial if it doesn't divide evenly.
  // Each team's GM/commissioner already occupies one roster slot before the
  // draft even starts, so they're excluded from the count of picks needed.
  // A skip forfeits a turn without consuming a pool player, so it doesn't
  // shrink the pool - it extends the draft by one turn to compensate,
  // which is why skipCount is added back in here.
  const skipCount = useMemo(() => picks.filter((p) => !p.player_id).length, [picks]);
  const totalPicks = Math.max(players.length - numTeams, 0) + skipCount;
  const maxRounds = numTeams ? Math.ceil(totalPicks / numTeams) : 0;
  const pickByNumber = useMemo(() => Object.fromEntries(picks.map((p) => [p.pick_number, p])), [picks]);

  const fullPickOrder = useMemo(
    () => (numTeams ? buildFullPickOrder(numTeams, totalPicks, draftType) : []),
    [numTeams, totalPicks, draftType]
  );
  const picksPerTeam = useMemo(() => {
    const map = {};
    for (const t of teams) {
      map[t.id] = fullPickOrder.filter((s) => s.draftPosition === t.draft_position).length;
    }
    return map;
  }, [fullPickOrder, teams]);

  useEffect(() => {
    if (!roundInitialized.current && currentRound) {
      setSelectedRound(draftStatus === 'completed' ? 1 : Math.min(currentRound, maxRounds));
      roundInitialized.current = true;
    }
  }, [currentRound, maxRounds, draftStatus]);

  useEffect(() => {
    if (prevDraftStatusRef.current === 'in_progress' && draftStatus === 'completed') {
      setShowCompleteModal(true);
      setViewByTeamOpen(true);
      setRosterViewMode('board');
    }
    prevDraftStatusRef.current = draftStatus;
  }, [draftStatus]);

  const roundSlots = useMemo(() => {
    if (!numTeams) return [];
    return buildFullPickOrder(numTeams, totalPicks, draftType)
      .filter((s) => s.round === selectedRound)
      .map((slot) => {
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
  }, [numTeams, totalPicks, draftType, selectedRound, teams, pickByNumber, playersById]);

  // Full pick order across every round - the Draft Board grid needs this
  // (previously this was missing entirely, causing a crash the moment
  // anyone switched to the Draft Board tab on this page).
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
    // Players added manually (e.g. late registrations after the draft ended)
    // have no matching draft_picks row, so they're appended at the end.
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

  const rosterByTeam = useMemo(() => {
    const map = {};
    for (const t of teams) {
      const roster = players.filter((p) => p.team_id === t.id);
      map[t.id] = {
        players: roster,
        count: roster.length,
        pickCount: roster.filter((p) => p.draft_pick_number != null).length,
        femaleCount: roster.filter((p) => p.gender === 'F').length,
      };
    }
    return map;
  }, [teams, players]);

  const myProxyTeamIds = useMemo(
    () =>
      new Set(
        teams
          .filter((t) =>
            (t.proxy_email || '')
              .split(',')
              .map((e) => e.trim().toLowerCase())
              .includes(myEmail)
          )
          .map((t) => t.id)
      ),
    [teams, myEmail]
  );
  const isProxyForClockTeam = Boolean(teamOnClock && myProxyTeamIds.has(teamOnClock.id));
  const myActingTeamId = profile?.team_id || [...myProxyTeamIds][0] || null;

  const fetchRankings = useCallback(async () => {
    if (!myActingTeamId) {
      setTeamRankings([]);
      return;
    }
    const { data } = await supabase
      .from('team_rankings')
      .select('*')
      .eq('team_id', myActingTeamId)
      .order('rank_order', { ascending: true });
    setTeamRankings(data || []);
  }, [myActingTeamId]);

  useEffect(() => {
    if (!authChecked || !myActingTeamId) return;
    fetchRankings();
    const channel = supabase
      .channel(`team-rankings-${myActingTeamId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'team_rankings', filter: `team_id=eq.${myActingTeamId}` },
        (payload) => {
          // Apply the payload directly instead of re-querying the database.
          // A fresh SELECT right after a realtime event can still race ahead
          // of replication and read data that doesn't yet reflect the write,
          // silently reverting the optimistic star update - the payload
          // itself is the actual committed row, so there's nothing to race.
          if (payload.eventType === 'INSERT') {
            setTeamRankings((prev) =>
              prev.some((r) => r.player_id === payload.new.player_id) ? prev : [...prev, payload.new]
            );
          } else if (payload.eventType === 'DELETE') {
            setTeamRankings((prev) => prev.filter((r) => r.player_id !== payload.old.player_id));
          } else if (payload.eventType === 'UPDATE') {
            setTeamRankings((prev) => prev.map((r) => (r.id === payload.new.id ? payload.new : r)));
          }
        }
      )
      .subscribe();
    const pollTimer = setInterval(fetchRankings, 10000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollTimer);
    };
  }, [authChecked, myActingTeamId, fetchRankings]);

  const rankedPlayerIds = useMemo(() => new Set(teamRankings.map((r) => r.player_id)), [teamRankings]);

  const allPlayersById = useMemo(() => {
    const map = {};
    for (const p of [...players, ...inactivePlayers]) map[p.id] = p;
    return map;
  }, [players, inactivePlayers]);

  const rankedPlayersOrdered = useMemo(() => {
    const withPlayers = teamRankings.map((r) => ({ ...r, player: allPlayersById[r.player_id] })).filter((r) => r.player);
    const available = withPlayers.filter((r) => !r.player.team_id);
    const drafted = withPlayers
      .filter((r) => r.player.team_id)
      .sort((a, b) => (a.player.draft_pick_number ?? Infinity) - (b.player.draft_pick_number ?? Infinity));
    return [...available, ...drafted];
  }, [teamRankings, allPlayersById]);

  async function toggleRanking(playerId) {
    if (!myActingTeamId) return;
    const currentlyRanked = rankedPlayerIds.has(playerId);

    if (currentlyRanked) {
      // Optimistically remove immediately - the star reflects this instantly
      // rather than waiting for the round trip to the database and back.
      setTeamRankings((prev) => prev.filter((r) => r.player_id !== playerId));
      const { error } = await supabase.rpc('remove_from_rankings', { p_player_id: playerId });
      if (error) {
        console.error('[rankings] remove_from_rankings failed:', error.message);
        fetchRankings(); // only re-sync on failure - correct the optimistic guess
      }
    } else {
      // Optimistically add to the top locally (matching what add_to_rankings
      // does server-side: shift everything else down, insert at rank 0).
      setTeamRankings((prev) => [
        { team_id: myActingTeamId, player_id: playerId, rank_order: -1 },
        ...prev.map((r) => ({ ...r, rank_order: r.rank_order + 1 })),
      ]);
      const { error } = await supabase.rpc('add_to_rankings', { p_player_id: playerId });
      if (error) {
        console.error('[rankings] add_to_rankings failed:', error.message);
        fetchRankings(); // only re-sync on failure - correct the optimistic guess
      } else {
        setRankingToast(true);
        setTimeout(() => setRankingToast(false), 2200);
      }
    }
    // Deliberately NOT re-fetching here on the success path - doing so
    // immediately after a write risked reading data that hadn't fully
    // settled yet, silently overwriting the correct optimistic state with
    // stale data and making the star look like it reverted. The optimistic
    // update above is trusted as correct for this user's own action; other
    // devices/proxies stay in sync via the realtime subscription instead.
  }

  async function saveRankingOrder(orderedIds) {
    const { error } = await supabase.rpc('reorder_rankings', { p_player_ids: orderedIds });
    if (error) {
      console.error('[rankings] reorder_rankings failed:', error.message);
      fetchRankings();
    }
  }

  // Press-and-hold drag reordering for My Rankings - Pointer Events handle
  // mouse and touch under one model, unlike native HTML5 drag-and-drop
  // which doesn't work reliably on touch devices.
  const dragOrderRef = useRef(null);
  const draggingIdRef = useRef(null);
  const rankRowRefs = useRef({});
  const [dragPreviewOrder, setDragPreviewOrder] = useState(null);
  const [draggingId, setDraggingId] = useState(null);

  function handleRankPointerMove(e) {
    if (!draggingIdRef.current || !dragOrderRef.current) return;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    const ids = dragOrderRef.current;
    let newIndex = ids.length - 1;
    for (let i = 0; i < ids.length; i++) {
      const node = rankRowRefs.current[ids[i]];
      if (!node) continue;
      const rect = node.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (y < mid) {
        newIndex = i;
        break;
      }
    }
    const currentIndex = ids.indexOf(draggingIdRef.current);
    if (currentIndex !== -1 && newIndex !== currentIndex) {
      const newOrder = [...ids];
      newOrder.splice(currentIndex, 1);
      newOrder.splice(newIndex, 0, draggingIdRef.current);
      dragOrderRef.current = newOrder;
      setDragPreviewOrder(newOrder);
    }
  }

  function handleRankPointerUp() {
    document.removeEventListener('pointermove', handleRankPointerMove);
    document.removeEventListener('pointerup', handleRankPointerUp);
    document.removeEventListener('touchmove', handleRankPointerMove);
    document.removeEventListener('touchend', handleRankPointerUp);
    if (dragOrderRef.current) {
      const draftedIds = rankedPlayersOrdered.filter((r) => r.player.team_id).map((r) => r.player_id);
      saveRankingOrder([...dragOrderRef.current, ...draftedIds]);
    }
    draggingIdRef.current = null;
    dragOrderRef.current = null;
    setDraggingId(null);
    setDragPreviewOrder(null);
  }

  function handleRankPointerDown(e, playerId) {
    e.preventDefault();
    draggingIdRef.current = playerId;
    const availableIds = rankedPlayersOrdered.filter((r) => !r.player.team_id).map((r) => r.player_id);
    dragOrderRef.current = availableIds;
    setDraggingId(playerId);
    document.addEventListener('pointermove', handleRankPointerMove);
    document.addEventListener('pointerup', handleRankPointerUp);
    document.addEventListener('touchmove', handleRankPointerMove, { passive: false });
    document.addEventListener('touchend', handleRankPointerUp);
  }

  const canDraft =
    teamOnClock &&
    draftStatus === 'in_progress' &&
    (profile?.team_id === teamOnClock.id || isProxyForClockTeam);

  // Same as canDraft but stays true through a pause too, since "you're on
  // the clock" is still true information even while paused - only the
  // ability to actually submit a pick is gated to in_progress.
  const isMyTurnRegardlessOfPause =
    teamOnClock &&
    (draftStatus === 'in_progress' || draftStatus === 'paused') &&
    (profile?.team_id === teamOnClock.id || isProxyForClockTeam);

  const picksRemainingForClockTeam = useMemo(() => {
    if (!teamOnClock) return 0;
    return fullPickOrder.filter(
      (s) => s.pickNumber >= currentPickNumber && s.draftPosition === teamOnClock.draft_position
    ).length;
  }, [fullPickOrder, currentPickNumber, teamOnClock]);

  const mustDraftFemale = useMemo(() => {
    if (!teamOnClock) return false;
    const roster = rosterByTeam[teamOnClock.id];
    if (!roster) return false;
    const femaleNeeded = minFemale - roster.femaleCount;
    return femaleNeeded > 0 && femaleNeeded >= picksRemainingForClockTeam;
  }, [teamOnClock, rosterByTeam, minFemale, picksRemainingForClockTeam]);

  const hasActiveSearch =
    searchName.trim() !== '' ||
    searchPosition !== '' ||
    searchGender !== '' ||
    searchPreviousTeam !== '' ||
    searchAvailability !== '';

  const previousTeamOptions = useMemo(() => {
    const set = new Set([...players, ...inactivePlayers].map((p) => p.previous_team).filter(Boolean));
    return Array.from(set).sort();
  }, [players, inactivePlayers]);

  function sortList(list, key) {
    const sorted = [...list];
    if (key === 'gender') sorted.sort((a, b) => a.gender.localeCompare(b.gender) || a.full_name.localeCompare(b.full_name));
    else if (key === 'position')
      sorted.sort((a, b) => a.offensive_position.localeCompare(b.offensive_position) || a.full_name.localeCompare(b.full_name));
    else sorted.sort((a, b) => a.full_name.localeCompare(b.full_name));
    return sorted;
  }

  function matchesSearch(p) {
    const q = searchName.trim().toLowerCase();
    const nameOk = q === '' || p.full_name.toLowerCase().split(/\s+/).some((word) => word.startsWith(q));
    const posOk =
      searchPosition === '' || p.offensive_position === searchPosition || p.defensive_position === searchPosition;
    const genderOk = searchGender === '' || p.gender === searchGender;
    const prevTeamOk = searchPreviousTeam === '' || p.previous_team === searchPreviousTeam;
    const availabilityOk =
      searchAvailability === '' ||
      (searchAvailability === 'not_available' && !p.is_active) ||
      (searchAvailability === 'drafted' && p.is_active !== false && !!p.team_id) ||
      (searchAvailability === 'available' && p.is_active !== false && !p.team_id);
    return nameOk && posOk && genderOk && prevTeamOk && availabilityOk;
  }

  // Combined AND-filtering: a player must satisfy every active filter to be shown at all
  const sortedAvailable = useMemo(() => {
    const base = hasActiveSearch
      ? sortList(availablePlayers.filter(matchesSearch), searchName.trim() ? 'name' : sortBy)
      : sortList(availablePlayers, sortBy);
    // When the team on the clock must draft a female player to still hit the
    // female minimum, put the players who actually satisfy that requirement
    // at the front, so it's obvious at a glance who's actually pickable.
    if (!mustDraftFemale) return base;
    const eligible = base.filter((p) => p.gender === 'F');
    const ineligible = base.filter((p) => p.gender !== 'F');
    return [...eligible, ...ineligible];
  }, [availablePlayers, hasActiveSearch, searchName, searchPosition, searchGender, searchPreviousTeam, searchAvailability, sortBy, mustDraftFemale]);

  const matchIdSet = useMemo(() => {
    if (!hasActiveSearch) return new Set();
    return new Set(availablePlayers.filter(matchesSearch).map((p) => p.id));
  }, [availablePlayers, hasActiveSearch, searchName, searchPosition, searchGender, searchPreviousTeam, searchAvailability]);

  // Drafted players stay visible on the board — shown at the end, in the order they were picked
  // (manually-added players, with no pick number, are sorted to the very end) — rather than
  // disappearing, so GMs can see who's gone and still open their profile.
  const draftedPlayersInOrder = useMemo(() => {
    return players
      .filter((p) => p.team_id)
      .filter((p) => !hasActiveSearch || matchesSearch(p))
      .sort((a, b) => (a.draft_pick_number ?? Infinity) - (b.draft_pick_number ?? Infinity));
  }, [players, hasActiveSearch, searchName, searchPosition, searchGender, searchPreviousTeam, searchAvailability]);

  // Inactive (commish-deactivated) players stay visible too, same reasoning
  // as drafted players above - grayed out on their cards, not hidden.
  const inactivePlayersInOrder = useMemo(() => {
    return sortList(
      inactivePlayers.filter((p) => !hasActiveSearch || matchesSearch(p)),
      'name'
    );
  }, [inactivePlayers, hasActiveSearch, searchName, searchPosition, searchGender, searchPreviousTeam, searchAvailability]);

  const boardList = useMemo(
    () => [...sortedAvailable, ...draftedPlayersInOrder, ...inactivePlayersInOrder],
    [sortedAvailable, draftedPlayersInOrder, inactivePlayersInOrder]
  );

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
    setDrafting(player.id);
    const { error } = await supabase.rpc('make_pick', { target_player_id: player.id });
    if (error) {
      setActionError(error.message);
    } else {
      setDraftConfirmation(player.full_name);
      setTimeout(() => setDraftConfirmation(null), 2500);
    }
    setDrafting(null);
  }

  async function addToMyTeam(player) {
    if (!profile?.team_id || draftStatus !== 'completed') return;
    setActionError(null);
    setDrafting(player.id);
    const { data: updated, error: updateError } = await supabase
      .from('players')
      .update({ team_id: profile.team_id })
      .eq('id', player.id)
      .is('team_id', null)
      .select();
    if (updateError || !updated || updated.length === 0) {
      setActionError('That player was just added to a team by someone else.');
    }
    setDrafting(null);
  }

  async function skipPick(reason) {
    if (profile?.role !== 'commissioner' || !teamOnClock || draftStatus !== 'in_progress') return;
    setSkipping(true);
    setActionError(null);
    const { error } = await supabase.rpc('skip_current_pick', { p_reason: reason });
    if (error) {
      setActionError(error.message);
    }
    setSkipping(false);
  }

  async function handleTogglePause() {
    if (profile?.role !== 'commissioner') return;
    setTogglingPause(true);
    if (draftStatus === 'paused') {
      // Resume: back-date current_pick_started_at so the clock continues
      // from exactly where it was when paused, instead of restarting.
      const remaining = settings?.paused_seconds_remaining ?? pickClockSeconds;
      const elapsedMs = (pickClockSeconds - remaining) * 1000;
      await supabase
        .from('draft_settings')
        .update({
          draft_status: 'in_progress',
          current_pick_started_at: new Date(Date.now() - elapsedMs).toISOString(),
          paused_seconds_remaining: null,
        })
        .eq('id', 1);
    } else {
      await supabase
        .from('draft_settings')
        .update({ draft_status: 'paused', paused_seconds_remaining: secondsLeft })
        .eq('id', 1);
    }
    setTogglingPause(false);
  }

  if (!authChecked || !settings) {
    return (
      <main style={{ background: '#ffffff', minHeight: '100vh', paddingBottom: 48 }}>
        <BrandHeader pageLabel="Live draft" />
        <p style={{ padding: 40, textAlign: 'center', color: '#5a6b7d', fontSize: 13 }}>Loading draft room…</p>
      </main>
    );
  }

  return (
    <main style={{ background: '#ffffff', minHeight: '100vh', paddingBottom: 48 }}>
      <BrandHeader
        pageLabel={draftStatus === 'completed' ? 'Draft results' : draftStatus === 'paused' ? 'Draft paused' : 'Live draft'}
        liveIndicator={draftStatus === 'in_progress'}
        pickTimer={draftStatus === 'in_progress' || draftStatus === 'paused' ? timerDisplay : undefined}
      />

      {draftStatus === 'not_started' && (
        <>
          <div
            className="px-4 sm:px-5 pt-4 pb-3"
            style={{ position: 'sticky', top: 0, zIndex: 30, background: '#ffffff', boxShadow: '0 2px 6px rgba(12,35,64,0.08)' }}
          >
            <div className="flex justify-center">
              <div
                className="rounded-lg p-3 flex flex-col items-center justify-center"
                style={{ background: '#185fa5', width: '100%', maxWidth: 320 }}
              >
                <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'rgba(255,255,255,0.75)' }}>
                  Draft starts in
                </p>
                <p className="text-2xl font-semibold m-0" style={{ color: '#ffffff', letterSpacing: '0.03em' }}>
                  {draftStartCountdown}
                </p>
              </div>
            </div>
            <p className="text-xs text-center text-muted mt-2 mb-0">
              You can search and research players now - drafting opens once the commissioner starts the draft.
            </p>
          </div>

          <div className="px-4 sm:px-5">
          {showDraftOrderPreview && (
            <div className="mt-4 rounded-xl border border-line bg-surface px-4 py-3.5">
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#0c447c' }}>
                Draft order
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {teams
                  .slice()
                  .sort((a, b) => a.draft_position - b.draft_position)
                  .map((t) => (
                    <div
                      key={t.id}
                      className="flex-none rounded-md flex flex-col items-center justify-center text-center px-2 py-1.5"
                      style={{ minWidth: 90, background: lightenColor(t.team_color || '#0074ff', 0.85) }}
                    >
                      <span className="text-[10px] text-muted">#{t.draft_position}</span>
                      <span className="flex items-center gap-1 text-xs font-medium truncate w-full justify-center">
                        <FootballIcon color={t.team_color || '#0074ff'} size={11} />
                        <span className="truncate">{t.name}</span>
                      </span>
                    </div>
                  ))}
              </div>
              {profile?.role === 'commissioner' && (
                <p className="text-[10px] text-muted mt-2 mb-0">
                  You can still change this order in Commish Tools right up until the draft starts.
                </p>
              )}
            </div>
          )}
          </div>
        </>
      )}

      {draftStatus === 'in_progress' || draftStatus === 'paused' ? (
        <>
          {/* Previous / current / next strip — frozen at top so GMs can always see the clock */}
          <div
            style={{ position: 'sticky', top: 0, zIndex: 30, background: '#ffffff', boxShadow: '0 2px 6px rgba(12,35,64,0.08)' }}
          >
          <div className="flex flex-col sm:flex-row gap-2 px-4 sm:px-5 pt-4 pb-3">
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
              style={{ background: draftStatus === 'paused' ? '#854f0b' : clockUrgent ? '#c0392b' : '#185fa5' }}
            >
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'rgba(255,255,255,0.75)' }}>
                  {draftStatus === 'paused' ? 'On the clock \u00b7 paused' : 'On the clock'}
                </p>
                <div className="flex items-center gap-2">
                  <FootballIcon color="#ffffff" size={16} />
                  <p className="text-[13px] font-semibold truncate m-0" style={{ color: '#ffffff' }}>
                    {teamOnClock?.name || '—'}
                  </p>
                </div>
                <p className="text-[10px] m-0 mt-1" style={{ color: 'rgba(255,255,255,0.75)' }}>
                  Round {currentRound} &middot; Pick {pickInRound(currentPickNumber, numTeams)}
                </p>
                {canDraft && (
                  <p className="text-xs font-semibold m-0 mt-1" style={{ color: '#ffffff' }}>
                    Drafting for: {teamOnClock?.name}
                  </p>
                )}
              </div>
              <div className="flex items-start gap-3 flex-shrink-0">
                {profile?.role === 'commissioner' && (
                  <div className="flex flex-col gap-1.5">
                    <button
                      onClick={handleTogglePause}
                      disabled={togglingPause}
                      className="rounded-md flex items-center justify-center gap-1.5 px-2 py-1.5"
                      style={{ background: 'rgba(255,255,255,0.2)', border: 'none', width: 112 }}
                    >
                      <i
                        className={`ti ${draftStatus === 'paused' ? 'ti-player-play' : 'ti-player-pause'} text-sm`}
                        style={{ color: '#ffffff' }}
                        aria-hidden="true"
                      />
                      <span className="text-[10px] font-medium whitespace-nowrap" style={{ color: '#ffffff' }}>
                        {draftStatus === 'paused' ? 'Resume Draft' : 'Pause Draft'}
                      </span>
                    </button>
                    <button
                      onClick={() => setShowSkipConfirm(true)}
                      disabled={draftStatus === 'paused'}
                      className="rounded-md px-2 py-1.5 flex items-center justify-center"
                      style={{ background: '#faeeda', border: 'none', width: 112 }}
                    >
                      <span className="text-[10px] font-medium whitespace-nowrap" style={{ color: '#854f0b' }}>
                        Skip Pick &raquo;
                      </span>
                    </button>
                  </div>
                )}
                <p className="text-xl font-medium" style={{ color: '#ffffff' }}>
                  {timerDisplay}
                </p>
              </div>
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
          {isMyTurnRegardlessOfPause && (
            <div className="px-4 sm:px-5 mt-3 pb-3">
              <div
                className="w-full rounded-lg px-3 py-2.5 flex items-center gap-2"
                style={{ background: draftStatus === 'paused' ? '#854f0b' : '#c0392b' }}
              >
                <i
                  className={`ti ${draftStatus === 'paused' ? 'ti-player-pause' : 'ti-alert-triangle'} text-base flex-shrink-0 ${
                    draftStatus === 'in_progress' ? 'animate-pulse' : ''
                  }`}
                  style={{ color: '#ffffff' }}
                  aria-hidden="true"
                />
                <p className="text-xs font-medium m-0" style={{ color: '#ffffff' }}>
                  {draftStatus === 'paused'
                    ? `The draft is paused, but you're on the clock${isProxyForClockTeam ? ` for ${teamOnClock?.name}` : ''} - get ready for when it resumes.`
                    : isProxyForClockTeam
                    ? `You're picking for ${teamOnClock?.name} as their draft-day proxy! Make your selection before the timer runs out.`
                    : "You're on the clock! Make your selection before the timer runs out."}
                </p>
              </div>
            </div>
          )}
          </div>

          {draftStatus === 'paused' && profile?.role !== 'commissioner' && (
            <div className="mx-4 sm:mx-5 mt-3 rounded-lg px-3 py-2.5 flex gap-2" style={{ background: '#faeeda' }}>
              <i className="ti ti-player-pause text-base flex-shrink-0" style={{ color: '#854f0b' }} aria-hidden="true" />
              <p className="text-xs m-0" style={{ color: '#633806' }}>
                The commissioner has paused the draft. Grab a beer, have a smoke, we'll pick back up where we left off!
              </p>
            </div>
          )}

          {/* Upcoming picks strip */}
          <div className="px-4 sm:px-5 pt-3">
            <button
              onClick={() => setUpcomingPicksOpen((o) => !o)}
              className="w-full flex items-center justify-between mb-1"
            >
              <p className="text-[10px] uppercase tracking-wide text-muted m-0">Upcoming picks</p>
              <i className={`ti ti-chevron-${upcomingPicksOpen ? 'up' : 'down'} text-sm text-muted`} aria-hidden="true" />
            </button>
            {upcomingPicksOpen && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {upcomingPicks.map((n) => {
                  const color = n.team?.team_color || '#0074ff';
                  return (
                    <button
                      key={n.pickNumber}
                      type="button"
                      onClick={() => n.team && jumpToTeam(n.team.id)}
                      className="flex-none rounded-md flex flex-col items-center justify-center text-center px-1.5"
                      style={{ width: 100, height: 44, background: lightenColor(color, 0.85), color: '#0c2340', border: 'none', cursor: n.team ? 'pointer' : 'default' }}
                    >
                      <span className="flex items-center gap-1 text-xs font-medium truncate w-full justify-center">
                        <FootballIcon color={color} size={11} />
                        <span className="truncate">{n.team?.name || '—'}</span>
                      </span>
                      <span className="text-[10px]" style={{ color: '#5a6b7d' }}>
                        Rnd {n.round} . Pick {pickInRound(n.pickNumber, numTeams)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-line mx-4 sm:mx-5 mt-1" />

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
        </>
      ) : draftStatus === 'completed' ? (
        <div className="bg-royal-pale mx-4 sm:mx-5 mt-4 rounded-lg p-3.5">
          <p className="text-sm m-0" style={{ color: '#0c447c' }}>
            The draft has ended. Final rosters are below.
          </p>
        </div>
      ) : null}

      {/* Team / Round roster viewer */}
      <div
        className="mx-4 sm:mx-5 mt-3 rounded-xl border border-line bg-surface px-4 py-3"
        ref={rostersSectionRef}
        style={{ scrollMarginTop: 120 }}
      >
        <button
          onClick={() => setViewByTeamOpen((o) => !o)}
          className="w-full flex items-center justify-between"
        >
          <p className="text-xs font-semibold uppercase tracking-wide m-0" style={{ color: '#5a6b7d' }}>
            View rosters
          </p>
          <i className={`ti ti-chevron-${viewByTeamOpen ? 'up' : 'down'} text-base text-muted`} aria-hidden="true" />
        </button>
        {viewByTeamOpen && (
          <>
            <div className="flex gap-1.5 mt-2 mb-2">
              <button
                type="button"
                onClick={() => {
                  setRosterViewMode('team');
                  scrollRostersIntoView();
                }}
                className="text-xs py-1.5 rounded-md font-medium text-center"
                style={{
                  width: 104,
                  background: rosterViewMode === 'team' ? '#185fa5' : '#ffffff',
                  color: rosterViewMode === 'team' ? '#ffffff' : '#3d4a57',
                  border: '1px solid #d8dde2',
                }}
              >
                View by team
              </button>
              <button
                type="button"
                onClick={() => {
                  setRosterViewMode('round');
                  setSelectedRound(draftStatus === 'completed' ? 1 : Math.min(currentRound, maxRounds));
                  scrollRostersIntoView();
                }}
                className="text-xs py-1.5 rounded-md font-medium text-center"
                style={{
                  width: 104,
                  background: rosterViewMode === 'round' ? '#185fa5' : '#ffffff',
                  color: rosterViewMode === 'round' ? '#ffffff' : '#3d4a57',
                  border: '1px solid #d8dde2',
                }}
              >
                View by round
              </button>
              <button
                type="button"
                onClick={() => {
                  setRosterViewMode('board');
                  scrollRostersIntoView();
                }}
                className="text-xs py-1.5 rounded-md font-medium text-center"
                style={{
                  width: 104,
                  background: rosterViewMode === 'board' ? '#185fa5' : '#ffffff',
                  color: rosterViewMode === 'board' ? '#ffffff' : '#3d4a57',
                  border: '1px solid #d8dde2',
                }}
              >
                Draft board
              </button>
              {draftStatus === 'completed' && (
                <PrintRosterButton teams={teams} width={104} compact />
              )}
            </div>

            {rosterViewMode === 'team' && (
              <>
                <div className="flex gap-2 flex-wrap mb-2">
                  {teams.map((t) => {
                    const color = t.team_color || '#0074ff';
                    const selected = viewingTeamId === t.id;
                    const isMine = profile?.team_id === t.id;
                    const ring = isMine ? ', 0 0 0 2px #185fa5' : '';
                    return (
                      <button
                        key={t.id}
                        onClick={() => setViewingTeamId(viewingTeamId === t.id ? null : t.id)}
                        className="text-xs px-2 py-1.5 rounded-md font-medium flex items-center gap-1.5 justify-center"
                        style={{
                          width: 140,
                          boxSizing: 'border-box',
                          background: selected ? color : lightenColor(color, 0.85),
                          color: selected ? '#ffffff' : '#0c2340',
                          borderLeft: 'none',
                          borderRight: 'none',
                          borderTop: selected ? '3px solid rgba(0,0,0,0.25)' : '1px solid rgba(255,255,255,0.7)',
                          borderBottom: selected ? '1px solid rgba(255,255,255,0.25)' : '3px solid rgba(0,0,0,0.18)',
                          boxShadow: selected
                            ? `inset 0 1px 3px rgba(0,0,0,0.3)${ring}`
                            : `0 1px 2px rgba(12,35,64,0.15)${ring}`,
                        }}
                      >
                        <FootballIcon color={selected ? '#ffffff' : color} size={14} />
                        <span className="truncate">
                          {t.name}
                          {isMine ? ' (you)' : ''}
                        </span>
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
                    <div className="bg-white rounded-lg p-3 mb-1">
                      <div className="flex justify-between items-center mb-1">
                        <p className="text-sm font-medium text-ink m-0">{viewedTeam?.name}</p>
                        {viewedTeam?.proxy_email && (
                          <p className="text-xs m-0" style={{ color: '#854f0b' }}>
                            Proxy:{' '}
                            {viewedTeam.proxy_email
                              .split(',')
                              .map((e) => e.trim())
                              .filter(Boolean)
                              .map((e) => playersByEmail[e]?.full_name || e)
                              .join(', ')}
                          </p>
                        )}
                      </div>
                      {ownerByTeam[viewingTeamId] && (
                        <p className="text-[11px] m-0 mb-2" style={{ color: '#185fa5' }}>
                          GM: {ownerByTeam[viewingTeamId].name}
                        </p>
                      )}
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                        {slots.map((entry, i) => {
                          const player = entry?.player;
                          const isClockSlot = isTeamOnClock && i === firstEmptyIndex;
                          return (
                            <div
                              key={player?.id || `${entry?.kind || 'empty'}-${i}`}
                              onClick={() => player && openProfile(player.id)}
                              className="rounded-lg flex flex-col items-center text-center px-1 py-2"
                              style={{
                                minHeight: 100,
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
                                    Rnd {currentRound} . Overall Pick # {currentPickNumber}
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
                                  Rnd {entry.pick.round} . Overall Pick # {entry.pick.pick_number}
                                </span>
                              </>
                            ) : entry?.kind === 'skipped' ? (
                              <>
                                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
                                  <i className="ti ti-x text-faint text-base" aria-hidden="true" />
                                </div>
                                <p className="text-[10px] text-muted m-0 mt-1">Skipped</p>
                                <span className="text-[9px] text-faint mt-0.5">
                                  Rnd {entry.pick.round} . Overall Pick # {entry.pick.pick_number}
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
                <div className="bg-white rounded-lg p-3">
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
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
                              <span className="text-[9px] text-muted mt-0.5">Pick # {pickInRound(slot.pickNumber, numTeams)}</span>
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
                                Pick # {pickInRound(slot.pickNumber, numTeams)}
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

            {rosterViewMode === 'board' && (
              <div
                className="bg-white rounded-lg p-3"
                style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '65vh' }}
              >
                <table className="border-collapse text-xs" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th
                        className="text-left p-2.5 sticky left-0"
                        style={{
                          minWidth: 130,
                          position: 'sticky',
                          top: 0,
                          zIndex: 3,
                          background: '#f1f3f6',
                          color: '#0c2340',
                          fontSize: 13,
                          fontWeight: 700,
                          borderBottom: '2px solid #d8dde2',
                        }}
                      >
                        Team / GM
                      </th>
                      {Array.from({ length: maxRounds }, (_, i) => i + 1).map((r) => (
                        <th
                          key={r}
                          className="p-2.5 text-center"
                          style={{
                            minWidth: 90,
                            position: 'sticky',
                            top: 0,
                            zIndex: 2,
                            background: '#f1f3f6',
                            color: '#0c2340',
                            fontSize: 13,
                            fontWeight: 700,
                            borderBottom: '2px solid #d8dde2',
                          }}
                        >
                          Round {r}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {teams
                      .slice()
                      .sort((a, b) => a.draft_position - b.draft_position)
                      .map((t) => {
                        const owner = ownerByTeam[t.id];
                        return (
                          <tr key={t.id} className="border-t" style={{ borderColor: '#d8dde2' }}>
                            <td className="p-2 sticky left-0 bg-white align-top">
                              <div className="flex items-center gap-1.5">
                                <FootballIcon color={t.team_color || '#0074ff'} size={12} />
                                <span className="font-medium text-ink">{t.name}</span>
                              </div>
                              {owner && <p className="text-[10px] text-muted m-0 mt-0.5">GM: {owner.name}</p>}
                            </td>
                            {Array.from({ length: maxRounds }, (_, i) => i + 1).map((r) => {
                              const slot = allSlots.find((s) => s.round === r && s.team?.id === t.id);
                              if (!slot) {
                                return (
                                  <td key={r} className="p-2 text-center align-top" style={{ color: '#8b97a3' }}>
                                    &mdash;
                                  </td>
                                );
                              }
                              const isSkipped = slot.pick && !slot.pick.player_id;
                              return (
                                <td key={r} className="p-1.5 text-center align-top">
                                  {slot.player ? (
                                    <button
                                      onClick={() => openProfile(slot.player.id)}
                                      className="bg-surface rounded-lg p-1.5 text-center"
                                      style={{ width: 80 }}
                                    >
                                      {slot.player.headshot_url ? (
                                        <img
                                          src={slot.player.headshot_url}
                                          alt={slot.player.full_name}
                                          className="w-7 h-7 rounded-full object-cover mx-auto"
                                        />
                                      ) : (
                                        <div className="w-7 h-7 rounded-full bg-white mx-auto flex items-center justify-center">
                                          <i className="ti ti-user text-faint text-sm" aria-hidden="true" />
                                        </div>
                                      )}
                                      <p className="text-[10px] font-medium m-0 mt-1 truncate leading-tight" style={{ color: '#0c2340' }}>
                                        {slot.player.full_name}
                                      </p>
                                      <p className="text-[9px] m-0" style={{ color: '#5a6b7d' }}>
                                        {slot.player.gender} &middot; Overall Pick #{slot.pickNumber}
                                      </p>
                                    </button>
                                  ) : isSkipped ? (
                                    <p className="text-[10px] italic m-0" style={{ color: '#8b97a3' }}>
                                      Skipped
                                    </p>
                                  ) : (
                                    <p className="m-0" style={{ color: '#8b97a3' }}>
                                      &mdash;
                                    </p>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Player selection - the main drafting area: search/sort, available players, cards, your team.
          Stays visible after the draft ends so GMs can still search/reference rosters and use
          "Add to my team" for leftover or late-registered players. */}
      <div
        className="mx-4 sm:mx-5 mt-3 rounded-xl border border-line bg-royal-pale/40 px-4 py-3.5"
        ref={playerSelectionRef}
        style={{ scrollMarginTop: 120 }}
      >
        <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#0c447c' }}>
          Player selection
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
            value={searchAvailability}
            onChange={(e) => setSearchAvailability(e.target.value)}
            className="flex-none text-xs"
            style={{ width: 130, borderColor: searchAvailability ? '#185fa5' : undefined }}
          >
            <option value="">Availability: any</option>
            <option value="available">Available</option>
            <option value="drafted">Drafted</option>
            <option value="not_available">Not Available</option>
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

        {mustDraftFemale && (
          <div className="rounded-md px-3 py-2 mt-2" style={{ background: '#faeeda' }}>
            <p className="text-xs m-0" style={{ color: '#633806' }}>
              <i className="ti ti-info-circle text-sm" aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />
              {teamOnClock?.name} must draft a female player this pick to reach the {minFemale}-female minimum —
              female players are sorted to the front below.
            </p>
          </div>
        )}

        {/* Main layout: sidebar / card row / my team */}
        <div className="flex flex-col lg:flex-row pt-3">
        <div className="order-2 lg:hidden flex gap-1 mb-2">
          <button
            onClick={() => {
              setMobileListTab('available');
              setLeftColumnTab('available');
            }}
            className="flex-1 text-[10.5px] py-1.5 px-0.5 rounded-md font-medium text-center"
            style={{
              background: mobileListTab === 'available' && leftColumnTab === 'available' ? '#185fa5' : '#ffffff',
              color: mobileListTab === 'available' && leftColumnTab === 'available' ? '#ffffff' : '#3d4a57',
              border: '1px solid #d8dde2',
            }}
          >
            Available ({sortedAvailable.length})
          </button>
          {myActingTeamId && (
            <button
              onClick={() => {
                setMobileListTab('available');
                setLeftColumnTab('rankings');
              }}
              className="flex-1 text-[10.5px] py-1.5 px-0.5 rounded-md font-medium text-center"
              style={{
                background: mobileListTab === 'available' && leftColumnTab === 'rankings' ? '#185fa5' : '#ffffff',
                color: mobileListTab === 'available' && leftColumnTab === 'rankings' ? '#ffffff' : '#3d4a57',
                border: '1px solid #d8dde2',
              }}
            >
              My Rankings{teamRankings.length ? ` (${teamRankings.length})` : ''}
            </button>
          )}
          <button
            onClick={() => setMobileListTab('myteam')}
            className="flex-1 text-[10.5px] py-1.5 px-0.5 rounded-md font-medium text-center"
            style={{
              background: mobileListTab === 'myteam' ? '#185fa5' : '#ffffff',
              color: mobileListTab === 'myteam' ? '#ffffff' : '#3d4a57',
              border: '1px solid #d8dde2',
            }}
          >
            My Team{rosterByTeam[profile?.team_id] ? ` (${rosterByTeam[profile.team_id].count})` : ''}
          </button>
        </div>
        <aside
          className={`w-full lg:w-64 flex-shrink-0 order-3 lg:order-1 lg:pr-3 lg:border-r border-line min-h-0 ${
            mobileListTab === 'available' ? 'block' : 'hidden'
          } lg:block`}
        >
          <div className="hidden lg:flex gap-1.5 mb-2">
            <button
              onClick={() => setLeftColumnTab('available')}
              className="flex-1 text-[11px] py-1.5 rounded-md font-medium text-center"
              style={{
                background: leftColumnTab === 'available' ? '#185fa5' : '#ffffff',
                color: leftColumnTab === 'available' ? '#ffffff' : '#3d4a57',
                border: '1px solid #d8dde2',
              }}
            >
              Available ({sortedAvailable.length})
            </button>
            {myActingTeamId && (
              <button
                onClick={() => setLeftColumnTab('rankings')}
                className="flex-1 text-[11px] py-1.5 rounded-md font-medium text-center"
                style={{
                  background: leftColumnTab === 'rankings' ? '#185fa5' : '#ffffff',
                  color: leftColumnTab === 'rankings' ? '#ffffff' : '#3d4a57',
                  border: '1px solid #d8dde2',
                }}
              >
                My Rankings{teamRankings.length ? ` (${teamRankings.length})` : ''}
              </button>
            )}
          </div>

          {leftColumnTab === 'available' && (
          <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto pr-1">
            {boardList.map((p) => {
              const isDrafted = !!p.team_id;
              const isInactive = p.is_active === false;
              return (
                <div
                  key={p.id}
                  onClick={() => openProfile(p.id)}
                  className={`relative rounded-md px-2.5 py-2 cursor-pointer hover:brightness-95 ${
                    isInactive ? 'bg-[#e9ecef] opacity-60' : isDrafted ? 'bg-[#e9ecef] opacity-70' : 'bg-surface'
                  }`}
                >
                  {myActingTeamId && !isDrafted && !isInactive && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleRanking(p.id);
                      }}
                      className="absolute top-1.5 right-1.5 z-10"
                      aria-label={rankedPlayerIds.has(p.id) ? 'Remove from My Rankings' : 'Add to My Rankings'}
                    >
                      <StarIcon filled={rankedPlayerIds.has(p.id)} size={16} />
                    </button>
                  )}
                  <p className="text-xs font-medium text-ink m-0 pr-4">{p.full_name}</p>
                  {isInactive ? (
                    <p className="text-[11px] font-medium m-0" style={{ color: '#5a6b7d' }}>
                      Inactive
                    </p>
                  ) : isDrafted ? (
                    <p className="text-[11px] font-medium m-0" style={{ color: '#185fa5' }}>
                      {p.draft_pick_number
                        ? `Drafted \u00b7 ${teamsById[p.team_id]?.name || 'Unknown'} \u00b7 Rnd ${getRound(
                            p.draft_pick_number,
                            numTeams
                          )} . Pick # ${p.draft_pick_number}`
                        : `Added manually \u00b7 ${teamsById[p.team_id]?.name || 'Unknown'}`}
                    </p>
                  ) : (
                    <>
                      <p className="text-[11px] text-muted m-0">
                        {p.height_feet}'{p.height_inches}" &middot; {p.gender}
                      </p>
                      <p className="text-[11px] text-muted m-0">
                        Off: {p.offensive_position} &middot; Def: {p.defensive_position}
                      </p>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          )}

          {leftColumnTab === 'rankings' && myActingTeamId && (
            rankedPlayersOrdered.length === 0 ? (
              <p className="text-xs text-faint italic">
                Tap the star on any player card to add them to your rankings.
              </p>
            ) : (
              <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto pr-1">
                {(() => {
                  const draftedEntries = rankedPlayersOrdered.filter((r) => r.player.team_id);
                  const availableEntries = dragPreviewOrder
                    ? dragPreviewOrder.map((pid) => rankedPlayersOrdered.find((r) => r.player_id === pid)).filter(Boolean)
                    : rankedPlayersOrdered.filter((r) => !r.player.team_id);
                  return [...availableEntries, ...draftedEntries];
                })().map((r) => {
                  const p = r.player;
                  const isDrafted = !!p.team_id;
                  const disabled = !canDraft || (mustDraftFemale && p.gender !== 'F') || drafting === p.id;
                  return (
                    <div
                      key={p.id}
                      ref={(node) => {
                        if (node) rankRowRefs.current[p.id] = node;
                        else delete rankRowRefs.current[p.id];
                      }}
                      className="rounded-md px-2.5 py-2"
                      style={{
                        background: isDrafted ? '#e9ecef' : '#f1f3f6',
                        opacity: isDrafted ? 0.65 : draggingId === p.id ? 0.5 : 1,
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {!isDrafted && (
                          <span
                            onPointerDown={(e) => handleRankPointerDown(e, p.id)}
                            onTouchStart={(e) => handleRankPointerDown(e, p.id)}
                            className="flex-shrink-0 cursor-grab active:cursor-grabbing"
                            style={{ touchAction: 'none' }}
                            aria-label="Drag to reorder"
                          >
                            <i className="ti ti-grip-vertical text-base" style={{ color: '#8b97a3' }} aria-hidden="true" />
                          </span>
                        )}
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openProfile(p.id)}>
                          {isDrafted ? (
                            <>
                              <p className="text-[10px] font-semibold m-0" style={{ color: '#3d4a57' }}>
                                Drafted By: {teamsById[p.team_id]?.name || 'Unknown'}
                              </p>
                              <p className="text-xs font-medium m-0 italic" style={{ color: '#5a6b7d' }}>
                                {p.full_name}
                              </p>
                              {p.draft_pick_number && (
                                <p className="text-[10px] italic m-0" style={{ color: '#8b97a3' }}>
                                  Rnd {getRound(p.draft_pick_number, numTeams)} &middot; Overall Pick# {p.draft_pick_number}
                                </p>
                              )}
                            </>
                          ) : (
                            <>
                              <p className="text-xs font-medium text-ink m-0 truncate">{p.full_name}</p>
                              <p className="text-[10px] text-muted m-0">
                                {p.offensive_position} / {p.defensive_position} &middot; {p.gender}
                              </p>
                            </>
                          )}
                        </div>
                        {!isDrafted && (
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                draftPlayer(p);
                              }}
                              disabled={disabled}
                              className="text-[11px] font-medium rounded-md px-3 py-1.5 whitespace-nowrap"
                              style={{ background: disabled ? '#d8dde2' : '#185fa5', color: '#ffffff', border: 'none' }}
                            >
                              {drafting === p.id ? 'Drafting…' : 'Draft Player'}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleRanking(p.id);
                              }}
                              className="text-[10px]"
                              style={{ color: '#8b97a3' }}
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </aside>

        <section className="flex-1 min-w-0 order-1 lg:order-2 lg:px-3">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted m-0">
              {draftStatus === 'completed' ? 'Available players' : `Round ${currentRound}, pick ${currentPickNumber}`}
            </p>
            {(draftStatus === 'in_progress' || draftStatus === 'paused') && profile?.team_id && rosterByTeam[profile.team_id] && (
              <p
                className="text-[11px] m-0 flex items-center gap-1"
                style={{ color: rosterByTeam[profile.team_id].femaleCount >= minFemale ? '#0c2340' : '#c0392b' }}
              >
                {rosterByTeam[profile.team_id].femaleCount >= minFemale ? (
                  <>
                    {rosterByTeam[profile.team_id].femaleCount} of {minFemale} Females Drafted
                    <i className="ti ti-circle-check text-sm" style={{ color: '#3b6d11' }} aria-hidden="true" />
                  </>
                ) : (
                  <>
                    {rosterByTeam[profile.team_id].femaleCount} of {minFemale} required Females drafted!
                  </>
                )}
              </p>
            )}
          </div>
          <div className="flex gap-3 overflow-x-auto pb-3">
            {boardList.map((p) => {
              const isDrafted = !!p.team_id;
              const isInactive = p.is_active === false;
              const disabled = !canDraft || (mustDraftFemale && p.gender !== 'F') || drafting === p.id;
              const isMatch = !isDrafted && !isInactive && matchIdSet.has(p.id);
              return (
                <div
                  key={p.id}
                  onClick={() => openProfile(p.id)}
                  className="flex-none rounded-xl p-3.5 flex flex-col cursor-pointer relative"
                  style={{
                    width: 'calc(33.333% - 8px)',
                    minWidth: 190,
                    height: 230,
                    background: isInactive ? '#e9ecef' : isDrafted ? '#e9ecef' : isMatch ? '#e6f1fb' : '#f1f3f6',
                    border: isMatch ? '1.5px solid #185fa5' : '1.5px solid transparent',
                    opacity: isInactive ? 0.6 : isDrafted ? 0.65 : 1,
                  }}
                >
                  {myActingTeamId && !isDrafted && !isInactive && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleRanking(p.id);
                      }}
                      className="absolute top-2.5 right-2.5 z-10"
                      aria-label={rankedPlayerIds.has(p.id) ? 'Remove from My Rankings' : 'Add to My Rankings'}
                    >
                      <StarIcon filled={rankedPlayerIds.has(p.id)} size={19} />
                    </button>
                  )}
                  <div className={`flex gap-2.5 items-start mb-2 ${myActingTeamId && !isDrafted && !isInactive ? 'mt-4' : ''}`}>
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
                  <p className="text-[11px] my-0.5" style={{ color: isMatch ? '#0c447c' : '#5a6b7d' }}>
                    Previous team: {previousTeamLabel(p.previous_team)}
                  </p>
                  {!isDrafted && (
                    <p className="text-[11px] mt-0.5" style={{ color: isMatch ? '#0c447c' : '#5a6b7d' }}>
                      Injuries: {p.injury_status === 'None' ? 'None' : `${p.injury_status} (${p.weeks_until_recovered || '?'}w)`}
                    </p>
                  )}
                  {isInactive ? (
                    <div className="w-full rounded-lg py-2 mt-auto flex items-center justify-center" style={{ background: '#d8dde2' }}>
                      <span className="text-[11px] font-medium" style={{ color: '#3d4a57' }}>
                        Inactive
                      </span>
                    </div>
                  ) : isDrafted ? (
                    <div className="w-full rounded-lg py-2 mt-auto flex items-center justify-center gap-1.5" style={{ background: '#d8dde2' }}>
                      <FootballIcon color={teamsById[p.team_id]?.team_color || '#0074ff'} size={13} />
                      <span className="text-[11px] font-medium" style={{ color: '#3d4a57' }}>
                        {p.draft_pick_number
                          ? `Drafted By: ${teamsById[p.team_id]?.name || 'Unknown'}`
                          : `Added manually \u00b7 ${teamsById[p.team_id]?.name || 'Unknown'}`}
                      </span>
                    </div>
                  ) : draftStatus === 'completed' ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        addToMyTeam(p);
                      }}
                      disabled={!profile?.team_id || drafting === p.id}
                      className="w-full text-xs font-medium rounded-lg py-2 mt-auto"
                      style={{
                        background: !profile?.team_id ? '#d8dde2' : '#185fa5',
                        color: '#ffffff',
                        border: 'none',
                      }}
                    >
                      {drafting === p.id ? 'Adding…' : 'Add to my team'}
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        draftPlayer(p);
                      }}
                      disabled={disabled}
                      className="w-full text-xs font-medium rounded-lg py-2 mt-auto"
                      style={{ background: disabled ? '#d8dde2' : '#185fa5', color: '#ffffff', border: 'none' }}
                    >
                      {drafting === p.id ? 'Drafting…' : 'Draft player'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {profile?.team_id && (() => {
          const myTeam = teamsById[profile.team_id];
          const myColor = myTeam?.team_color || '#0074ff';
          return (
            <aside
              className={`w-full lg:w-64 flex-shrink-0 order-4 lg:order-3 lg:pl-3 lg:border-l border-line ${
                mobileListTab === 'myteam' ? 'block' : 'hidden'
              } lg:block`}
            >
              {myTeam && (
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted mb-1 flex items-center gap-1.5">
                  <FootballIcon color={myColor} size={13} />
                  {myTeam?.name || '—'}
                </p>
              )}
              {rosterByTeam[profile.team_id] && (
                <>
                  <p
                    className="text-xs mb-2 flex items-center gap-1"
                    style={{ color: rosterByTeam[profile.team_id].femaleCount >= minFemale ? '#0c2340' : '#c0392b' }}
                  >
                    {rosterByTeam[profile.team_id].femaleCount >= minFemale ? (
                      <>
                        {rosterByTeam[profile.team_id].femaleCount} of {minFemale} Females Drafted
                        <i className="ti ti-circle-check text-sm" style={{ color: '#3b6d11' }} aria-hidden="true" />
                      </>
                    ) : (
                      <>
                        {rosterByTeam[profile.team_id].femaleCount} of {minFemale} required Females drafted!
                      </>
                    )}
                  </p>
                  {draftStatus === 'completed' &&
                    (rosterByTeam[profile.team_id].count < minRoster ||
                      rosterByTeam[profile.team_id].femaleCount < minFemale) && (
                      <div className="bg-[#faeeda] rounded-md px-2.5 py-2 mb-2 flex gap-1.5">
                        <i className="ti ti-alert-triangle text-sm flex-shrink-0" style={{ color: '#854f0b' }} aria-hidden="true" />
                        <p className="text-[11px] m-0" style={{ color: '#633806' }}>
                          Below the {minRoster}-player / {minFemale}-female minimum. Use "Add to my team" on leftover
                          players below to fill remaining spots.
                        </p>
                      </div>
                    )}
                  <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto pr-1">
                    {rosterByTeam[profile.team_id].players
                      .slice()
                      .sort((a, b) => {
                        if (!a.draft_pick_number && !b.draft_pick_number) return 0;
                        if (!a.draft_pick_number) return -1;
                        if (!b.draft_pick_number) return 1;
                        return a.draft_pick_number - b.draft_pick_number;
                      })
                      .map((p) => (
                      <div
                        key={p.id}
                        onClick={() => openProfile(p.id)}
                        className="rounded-md px-2.5 py-2 cursor-pointer hover:brightness-95"
                        style={{ background: lightenColor(myColor, 0.85) }}
                      >
                        <p className="text-xs font-medium m-0" style={{ color: '#0c2340' }}>{p.full_name}</p>
                        <p className="text-[11px] m-0" style={{ color: '#5a6b7d' }}>
                          {p.height_feet}'{p.height_inches}" &middot; {p.gender}
                        </p>
                        <p className="text-[11px] m-0" style={{ color: '#5a6b7d' }}>
                          Off: {p.offensive_position} &middot; Def: {p.defensive_position}
                        </p>
                        {p.draft_pick_number && (
                          <p className="text-[11px] m-0" style={{ color: '#5a6b7d' }}>
                            Rnd {getRound(p.draft_pick_number, numTeams)} &middot; Overall Pick# {p.draft_pick_number}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </aside>
          );
        })()}

        </div>
      </div>

      {rankingToast && (
        <div
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl px-6 py-4 flex items-center gap-3"
          style={{ boxShadow: '0 12px 32px rgba(12,35,64,0.3)', zIndex: 100 }}
        >
          <StarIcon filled size={22} />
          <p className="text-base font-medium m-0" style={{ color: '#0c2340' }}>
            Added to your My Rankings
          </p>
        </div>
      )}

      {draftConfirmation && (
        <div
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl px-6 py-4 flex items-center gap-3"
          style={{ boxShadow: '0 12px 32px rgba(12,35,64,0.3)', zIndex: 100, background: '#185fa5' }}
        >
          <i className="ti ti-circle-check text-xl" style={{ color: '#ffffff' }} aria-hidden="true" />
          <p className="text-base font-medium m-0" style={{ color: '#ffffff' }}>
            You have drafted {draftConfirmation}
          </p>
        </div>
      )}

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
              <div className="flex items-center gap-1 flex-shrink-0">
                {myActingTeamId && !p.team_id && p.is_active !== false && (
                  <button
                    onClick={() => toggleRanking(p.id)}
                    className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-surface"
                    aria-label={rankedPlayerIds.has(p.id) ? 'Remove from My Rankings' : 'Add to My Rankings'}
                  >
                    <StarIcon filled={rankedPlayerIds.has(p.id)} size={17} />
                  </button>
                )}
                <button
                  onClick={() => closeProfile(id)}
                  className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-surface"
                  aria-label="Close"
                >
                  <i className="ti ti-x text-base text-muted" aria-hidden="true" />
                </button>
              </div>
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
                  <>
                    <p className="text-xs text-ink m-0">
                      Drafted &middot; Rnd {getRound(p.draft_pick_number, numTeams)} . Overall Pick# {p.draft_pick_number}
                    </p>
                    <p className="text-xs font-medium text-ink m-0 mt-1">{team?.name || ''}</p>
                    {team && ownerByTeam[team.id] && (
                      <p className="text-[11px] text-muted m-0">{ownerByTeam[team.id].name}</p>
                    )}
                  </>
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
      {showSkipConfirm && (
        <div
          className="fixed inset-0 flex items-center justify-center px-4"
          style={{ background: 'rgba(12,35,64,0.55)', zIndex: 100 }}
          onClick={() => setShowSkipConfirm(false)}
        >
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl p-5 max-w-sm w-full">
            <p className="text-sm font-semibold m-0 mb-1" style={{ color: '#0c2340' }}>
              Skip this pick?
            </p>
            <p className="text-xs text-muted mb-3">
              {teamOnClock?.name} will lose this turn entirely - the draft will run one extra round to make up for it.
            </p>
            <label className="field-label">Reason</label>
            <select value={skipReason} onChange={(e) => setSkipReason(e.target.value)} className="text-xs mb-3">
              <option value="gm_slow">GM taking too long</option>
              <option value="commissioner_decision">Commissioner's Decision</option>
            </select>
            <div className="flex gap-2">
              <button onClick={() => setShowSkipConfirm(false)} className="btn-secondary text-xs flex-1">
                Cancel
              </button>
              <button
                onClick={async () => {
                  await skipPick(skipReason);
                  setShowSkipConfirm(false);
                }}
                disabled={skipping}
                className="text-xs flex-1 rounded-md font-medium"
                style={{ background: '#c0392b', color: '#ffffff', border: 'none' }}
              >
                {skipping ? 'Skipping…' : 'Confirm skip'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showCompleteModal && (
        <div
          className="fixed inset-0 flex items-center justify-center px-4"
          style={{ background: 'rgba(12,35,64,0.55)', zIndex: 100 }}
          onClick={() => setShowCompleteModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl p-6 text-center max-w-sm w-full"
          >
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

export default function DraftPage() {
  return (
    <Suspense fallback={null}>
      <DraftPageContent />
    </Suspense>
  );
}
