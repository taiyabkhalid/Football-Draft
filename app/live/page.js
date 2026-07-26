'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { getRound, getTeamOnTheClock, buildFullPickOrder, pickInRound } from '../../lib/draftLogic';
import BrandHeader from '../../lib/BrandHeader';
import FootballIcon, { lightenColor } from '../../lib/FootballIcon';
import PrintRosterButton from '../../lib/PrintRosterButton';

const PUB_LINES_YES = [
  'Already planning the post-game pint.',
  'First one to the pub after the game, guaranteed.',
  'Has a permanent tab running at the local.',
  'Will be first in line for a cold one after the whistle.',
  'Knows the Greene King bartender by name!',
  "Post-game pub session? Wouldn't miss it.",
  'Already texting the group chat about pub plans.',
  'Views the pub as part of the sport.',
  'Never skips the post-game debrief over a pint.',
  'Has a favorite seat reserved at the pub.',
  "I'll be in the pub with or without you.",
  "Can't wait to talk shit about other teams at the pub.",
  "Pub o'clock is their favorite part of game day.",
  '{gmName} owes me a pint!',
  'Treats the post-game pint as a tradition, not an option.',
  'Ready to relive every play over a beer.',
  'The real MVP of the pub.',
  'Has never turned down a post-game round.',
  'Counting down to kickoff and last call equally.',
  'Will be raising a glass no matter the score.',
];

const PUB_LINES_NO = [
  'Skipping the pub, straight home after the game.',
  'Prefers a quiet night over the Greene King.',
  'No pub, need to ice up.',
  'Dunno about this team, no pub for me \u{1F609}',
  'Not a pub person, early night instead.',
  'Heads straight home once the final whistle blows.',
  'Would rather recover at home than at the bar.',
  'Skips last call every time.',
  'Home and in bed before the pub crowd arrives.',
  'Prefers water and the sofa post-game.',
  'Will pass on the pub, unless we find a better one.',
  'Straight to the car, no detours to the pub.',
  'Saves the socializing for next practice.',
  'Home is the only post-game destination.',
  "Doesn't need a pint to celebrate a win.",
  'Early to bed, ready for the next game.',
  'Would rather stretch than sit at the bar.',
  "Screw you guys, I'm going home!",
  'The pub can wait, rest comes first.',
  'Heading home to watch the game tape instead.',
];

function pubLineFor(player, allPlayers, gmName) {
  if (player.enjoys_pub == null) return null;
  const lines = player.enjoys_pub ? PUB_LINES_YES : PUB_LINES_NO;
  const sameGroup = allPlayers
    .filter((p) => p.team_id && p.draft_pick_number && p.enjoys_pub === player.enjoys_pub)
    .sort((a, b) => a.draft_pick_number - b.draft_pick_number);
  const position = sameGroup.findIndex((p) => p.id === player.id);
  const index = position >= 0 ? position % lines.length : 0;
  return lines[index].replace('{gmName}', gmName || 'The GM');
}

const ALL_POSITIONS = ['QB', 'WR', 'C', 'CB', 'Safety', 'LB', 'Rush'];
const OFFENSIVE_POSITIONS = ['QB', 'WR', 'C'];

function previousTeamLabel(previousTeam) {
  if (!previousTeam) return 'New to Go Mammoth';
  if (previousTeam === 'Other') return 'Played in a different league';
  return previousTeam;
}


export default function LiveDraftPage() {
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [inactivePlayers, setInactivePlayers] = useState([]);
  const [picks, setPicks] = useState([]);
  const [settings, setSettings] = useState(null);
  const draftStatus = settings?.draft_status || 'not_started';
  const [profiles, setProfiles] = useState([]);
  const [viewingTeamId, setViewingTeamId] = useState(null);
  const [myTeamId, setMyTeamId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewByTeamOpen, setViewByTeamOpen] = useState(false);
  const rostersSectionRef = useRef(null);
  const searchPanelRef = useRef(null);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);

  function scrollRostersIntoView() {
    setTimeout(() => {
      rostersSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }

  const [rosterViewMode, setRosterViewMode] = useState('team'); // 'team' | 'round'

  function jumpToTeam(teamId) {
    setViewByTeamOpen(true);
    setRosterViewMode('team');
    setViewingTeamId(teamId);
    scrollRostersIntoView();
  }
  const [selectedRound, setSelectedRound] = useState(1);
  const roundInitialized = useRef(false);
  const [openProfileIds, setOpenProfileIds] = useState([]);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const prevDraftStatusRef = useRef(null);

  const currentPickRef = useRef(null);
  const draftedScrollRef = useRef(null);

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
    setLoading(false);
  }, []);

  const focusHandledRef = useRef(false);
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
      // Arriving via a hamburger-menu shortcut - jump straight to the right
      // panel and mode instead of leaving View Rosters collapsed. Wait for
      // loading to finish so draftStatus is actually known before deciding
      // whether "search" means the standalone pre-draft panel or the full
      // View Rosters search tab.
      if (typeof window !== 'undefined' && !loading && !focusHandledRef.current) {
        focusHandledRef.current = true;
        const params = new URLSearchParams(window.location.search);
        const focus = params.get('focus');
        if (focus === 'team' && playerRow?.team_id) {
          setViewByTeamOpen(true);
          setRosterViewMode('team');
          setTimeout(() => {
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
          }, 300);
        } else if (focus === 'search') {
          if (draftStatus === 'not_started') {
            setSearchPanelOpen(true);
            setTimeout(() => {
              searchPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 300);
          } else {
            setViewByTeamOpen(true);
            setRosterViewMode('search');
            setTimeout(() => {
              rostersSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 300);
          }
        }
      }
    }
    checkMyTeam();
  }, [loading, draftStatus]);

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

  // ---- Reveal queue ----
  // The spectator page deliberately lags behind the real draft: new picks
  // are revealed one at a time (chime, then the "just drafted" pop-out,
  // then a hold) rather than jumping straight to the live state, so nobody
  // watching sees a pick before its moment. The GM draft page has no such
  // queue and always reflects the database directly.
  const [revealedCount, setRevealedCount] = useState(null);
  const [queue, setQueue] = useState([]);
  const [activeReveal, setActiveReveal] = useState(null);
  const [showPopout, setShowPopout] = useState(false);
  const audioRef = useRef(null);
  const processingRef = useRef(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!loading && !initializedRef.current) {
      initializedRef.current = true;
      setRevealedCount(picks.length);
      // Even on a fresh visit where nothing is actively being "revealed" this
      // session, the most recent real pick should still show as the featured
      // pop-out card - not just the plain on-the-clock card.
      const lastRealPick = [...picks].reverse().find((p) => p.player_id);
      if (lastRealPick) {
        setActiveReveal(lastRealPick);
        setShowPopout(true);
      }
    }
  }, [loading, picks]);

  useEffect(() => {
    if (revealedCount === null) return;
    const alreadyQueuedThrough = revealedCount + queue.length;
    if (picks.length > alreadyQueuedThrough) {
      setQueue((q) => [...q, ...picks.slice(alreadyQueuedThrough, picks.length)]);
    }
  }, [picks, revealedCount, queue.length]);

  useEffect(() => {
    if (processingRef.current || queue.length === 0) return;
    processingRef.current = true;
    const next = queue[0];

    async function run() {
      setActiveReveal(next);
      setShowPopout(false);
      let chimeMs = 2000;
      const audio = audioRef.current;
      if (audio) {
        try {
          audio.currentTime = 0;
          await audio.play();
          if (audio.duration && isFinite(audio.duration)) chimeMs = audio.duration * 1000;
        } catch (e) {
          // Autoplay can be blocked before the visitor interacts with the
          // page at all - the reveal still proceeds on its own timing.
        }
      }
      await new Promise((resolve) => setTimeout(resolve, chimeMs * 0.75));
      setShowPopout(true);
      setRevealedCount((c) => (c ?? 0) + 1);
      // Hold at least 5 seconds before considering the next queued pick -
      // if nothing else is queued when that ends, this pick just stays
      // featured (persistently) until a genuinely new one arrives.
      await new Promise((resolve) => setTimeout(resolve, 5000));
      setQueue((q) => q.slice(1));
      processingRef.current = false;
    }
    run();
  }, [queue]);

  const revealedPicks = useMemo(() => picks.slice(0, revealedCount ?? picks.length), [picks, revealedCount]);

  const currentPickNumber = revealedPicks.length + 1;
  const numTeams = settings?.num_teams || teams.length;
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

  // Auto-start the draft the moment the scheduled time passes - see the
  // matching comment on the GM page for why this needs to poll from here too.
  useEffect(() => {
    if (draftStatus !== 'not_started') return;
    const timer = setInterval(() => {
      supabase.rpc('start_draft_if_due');
      supabase.rpc('randomize_draft_order_if_due');
    }, 5000);
    return () => clearInterval(timer);
  }, [draftStatus]);

  const draftDatetimeMs = settings?.draft_datetime ? new Date(settings.draft_datetime).getTime() : null;
  const msUntilDraft = draftDatetimeMs !== null ? draftDatetimeMs - now : null;
  const msUntilRoomOpens = msUntilDraft !== null ? msUntilDraft - 2 * 60 * 60 * 1000 : null;
  const roomIsOpen = msUntilRoomOpens !== null && msUntilRoomOpens <= 0;
  const showDraftOrderPreview = msUntilDraft !== null && msUntilDraft <= 30 * 60 * 1000;

  function formatCountdown(ms) {
    if (ms === null) return '--:--';
    const totalSeconds = Math.max(Math.floor(ms / 1000), 0);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const mmss = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    if (days > 0) return `${days}d ${hours}h ${mmss}`;
    if (hours > 0) return `${hours}h ${mmss}`;
    return mmss;
  }

  const pickStartedAt = settings?.current_pick_started_at ? new Date(settings.current_pick_started_at).getTime() : null;
  const secondsLeft =
    draftStatus === 'paused' && settings?.paused_seconds_remaining != null
      ? settings.paused_seconds_remaining
      : pickStartedAt
      ? Math.max(pickClockSeconds - Math.floor((now - pickStartedAt) / 1000), 0)
      : pickClockSeconds;

  const timerDisplay = useMemo(() => {
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }, [secondsLeft]);

  const timeExpired = secondsLeft === 0;

  function openProfile(playerId) {
    setOpenProfileIds((ids) => (ids.includes(playerId) ? ids : [...ids, playerId]));
  }
  function closeProfile(playerId) {
    setOpenProfileIds((ids) => ids.filter((id) => id !== playerId));
  }

  const playersById = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);
  const teamsById = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams]);

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
    const revealedPlayerIds = new Set(revealedPicks.filter((p) => p.player_id).map((p) => p.player_id));
    const map = {};
    for (const t of teams) {
      const roster = players.filter((p) => {
        if (p.team_id !== t.id) return false;
        const isOwner = ownerByTeam[t.id]?.email === p.email;
        return isOwner || revealedPlayerIds.has(p.id);
      });
      map[t.id] = { players: roster, count: roster.length, femaleCount: roster.filter((p) => p.gender === 'F').length };
    }
    return map;
  }, [teams, players, revealedPicks, ownerByTeam]);

  const pickByNumber = useMemo(() => Object.fromEntries(revealedPicks.map((p) => [p.pick_number, p])), [revealedPicks]);

  // The draft runs until the whole DRAFTABLE pool is allocated - each team's
  // GM/commissioner already occupies one roster slot before the draft even
  // starts, so they're excluded from the count of picks needed. A skip
  // forfeits a turn without consuming a pool player, extending the draft
  // by one turn to compensate - this uses the raw pick history (not the
  // revealed subset) since it's structural (how many rounds exist), not
  // spoiler content about who was picked. See draft/page.js for the same logic.
  const skipCount = useMemo(() => picks.filter((p) => !p.player_id).length, [picks]);
  const totalPicks = Math.max(players.length - numTeams, 0) + skipCount;
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
      setSelectedRound(draftStatus === 'completed' ? 1 : Math.min(currentRound, maxRounds));
      roundInitialized.current = true;
    }
  }, [currentRound, maxRounds, draftStatus]);

  const roundSlots = useMemo(() => allSlots.filter((s) => s.round === selectedRound), [allSlots, selectedRound]);

  function buildTeamSlots(teamId) {
    const roster = rosterByTeam[teamId]?.players || [];
    const gmPlayer = roster.find((p) => {
      const role = roleByEmail[p.email?.toLowerCase()];
      return role === 'commissioner' || role === 'gm';
    });

    const teamPicks = revealedPicks
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

  // ---- Search Players (spectator research tool) ----
  // "Drafted" status here must respect the same reveal-queue lag as
  // everything else on this page - a player whose pick hasn't been shown
  // yet should still appear as available, not grayed out, even if they're
  // already actually drafted in the database.
  const revealedDraftedIds = useMemo(
    () => new Set(revealedPicks.filter((p) => p.player_id).map((p) => p.player_id)),
    [revealedPicks]
  );
  function isRevealedDrafted(p) {
    if (!p.team_id) return false;
    const role = roleByEmail[p.email?.toLowerCase()];
    if (role === 'gm' || role === 'commissioner') return true;
    return revealedDraftedIds.has(p.id);
  }

  const [spSearchName, setSpSearchName] = useState('');
  const [spSearchPosition, setSpSearchPosition] = useState('');
  const [spSearchGender, setSpSearchGender] = useState('');
  const [spSearchPreviousTeam, setSpSearchPreviousTeam] = useState('');
  const [spSearchAvailability, setSpSearchAvailability] = useState('');
  const [spSortBy, setSpSortBy] = useState('name');

  const spAllPlayers = useMemo(() => [...players, ...inactivePlayers], [players, inactivePlayers]);

  function spSortList(list, key) {
    const sorted = [...list];
    if (key === 'gender') sorted.sort((a, b) => a.gender.localeCompare(b.gender) || a.full_name.localeCompare(b.full_name));
    else if (key === 'position')
      sorted.sort((a, b) => a.offensive_position.localeCompare(b.offensive_position) || a.full_name.localeCompare(b.full_name));
    else sorted.sort((a, b) => a.full_name.localeCompare(b.full_name));
    return sorted;
  }

  function spMatchesSearch(p) {
    const q = spSearchName.trim().toLowerCase();
    const nameOk = q === '' || p.full_name.toLowerCase().split(/\s+/).some((word) => word.startsWith(q));
    const posOk =
      spSearchPosition === '' || p.offensive_position === spSearchPosition || p.defensive_position === spSearchPosition;
    const genderOk = spSearchGender === '' || p.gender === spSearchGender;
    const prevTeamOk = spSearchPreviousTeam === '' || p.previous_team === spSearchPreviousTeam;
    const availabilityOk =
      spSearchAvailability === '' ||
      (spSearchAvailability === 'not_available' && !p.is_active) ||
      (spSearchAvailability === 'drafted' && p.is_active && isRevealedDrafted(p)) ||
      (spSearchAvailability === 'available' && p.is_active && !isRevealedDrafted(p));
    return nameOk && posOk && genderOk && prevTeamOk && availabilityOk;
  }

  const spHasActiveSearch =
    spSearchName.trim() !== '' ||
    spSearchPosition !== '' ||
    spSearchGender !== '' ||
    spSearchPreviousTeam !== '' ||
    spSearchAvailability !== '';

  const spPreviousTeamOptions = useMemo(() => {
    // Only real values players have actually provided on their profile -
    // never a hardcoded list, so this can't drift from what's really there.
    const set = new Set(spAllPlayers.map((p) => p.previous_team).filter(Boolean));
    return Array.from(set).sort();
  }, [spAllPlayers]);

  const spResults = useMemo(() => {
    const filtered = spHasActiveSearch ? spAllPlayers.filter(spMatchesSearch) : spAllPlayers;
    return spSortList(filtered, spSearchName.trim() ? 'name' : spSortBy);
  }, [spAllPlayers, spHasActiveSearch, spSearchName, spSearchPosition, spSearchGender, spSearchPreviousTeam, spSearchAvailability, spSortBy]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (draftStatus === 'completed') {
        if (draftedScrollRef.current) draftedScrollRef.current.scrollLeft = 0;
      } else if (currentPickRef.current) {
        currentPickRef.current.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [currentPickNumber, draftStatus, activeReveal]);

  const pendingCompletionRef = useRef(false);

  useEffect(() => {
    if (prevDraftStatusRef.current === 'in_progress' && draftStatus === 'completed') {
      pendingCompletionRef.current = true;
    }
    prevDraftStatusRef.current = draftStatus;
  }, [draftStatus]);

  useEffect(() => {
    if (pendingCompletionRef.current && queue.length === 0 && !processingRef.current) {
      setShowCompleteModal(true);
      setViewByTeamOpen(true);
      setRosterViewMode('board');
      pendingCompletionRef.current = false;
    }
  }, [queue.length, revealedCount]);

  if (loading) {
    return (
      <main style={{ background: '#ffffff', minHeight: '100vh', paddingBottom: 48 }}>
        <BrandHeader pageLabel="Live draft / results" />
        <p className="text-center text-muted text-sm p-10">Loading…</p>
      </main>
    );
  }

  const preDraftWaitingRoomBlock = draftStatus === 'not_started' && (
    <>
    {!roomIsOpen ? (
      <div className="text-center px-4" style={{ paddingTop: 60, paddingBottom: 60 }}>
        <p className="text-sm text-muted mb-8">
          The spectator draft room opens automatically 2 hours before the draft starts.
        </p>
        <p className="text-xs uppercase tracking-wide text-muted mb-2">Draft starts in</p>
        <p className="text-4xl font-semibold m-0 mb-8" style={{ color: '#0c2340', letterSpacing: '0.03em' }}>
          {formatCountdown(msUntilDraft)}
        </p>
        <p className="text-xs uppercase tracking-wide text-muted mb-2">Draft room opens in</p>
        <p className="text-xl font-semibold m-0" style={{ color: '#185fa5', letterSpacing: '0.03em' }}>
          {formatCountdown(msUntilRoomOpens)}
        </p>
      </div>
    ) : (
      <div className="px-4 sm:px-5 pt-4">
        <div className="flex justify-center">
          <div className="rounded-lg p-3 flex flex-col items-center justify-center" style={{ background: '#185fa5', width: '100%', maxWidth: 320 }}>
            <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'rgba(255,255,255,0.75)' }}>
              Draft starts in
            </p>
            <p className="text-2xl font-semibold m-0" style={{ color: '#ffffff', letterSpacing: '0.03em' }}>
              {formatCountdown(msUntilDraft)}
            </p>
          </div>
        </div>

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
          </div>
        )}
      </div>
    )}

      <div className="mx-4 sm:mx-5 mt-4 rounded-xl border border-line bg-surface px-4 py-3" ref={searchPanelRef}>
        <button onClick={() => setSearchPanelOpen((o) => !o)} className="w-full flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide m-0" style={{ color: '#5a6b7d' }}>
            Search player
          </p>
          <i className={`ti ti-chevron-${searchPanelOpen ? 'up' : 'down'} text-base text-muted`} aria-hidden="true" />
        </button>
        {searchPanelOpen && (
          <div className="mt-2">
            <div className="flex gap-2 flex-wrap items-center mb-2">
              <div className="relative flex-none" style={{ width: 150 }}>
                <i className="ti ti-search absolute left-2.5 top-1/2 -translate-y-1/2 text-base text-faint" aria-hidden="true" />
                <input
                  type="text"
                  value={spSearchName}
                  onChange={(e) => setSpSearchName(e.target.value)}
                  placeholder="Search by name"
                  className="w-full pl-8 text-xs"
                  style={{ borderColor: spSearchName ? '#185fa5' : undefined }}
                />
              </div>
              <select
                value={spSearchPosition}
                onChange={(e) => setSpSearchPosition(e.target.value)}
                className="flex-none text-xs"
                style={{ width: 120, borderColor: spSearchPosition ? '#185fa5' : undefined }}
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
                value={spSearchGender}
                onChange={(e) => setSpSearchGender(e.target.value)}
                className="flex-none text-xs"
                style={{ width: 100, borderColor: spSearchGender ? '#185fa5' : undefined }}
              >
                <option value="">M/F: any</option>
                <option value="M">M</option>
                <option value="F">F</option>
              </select>
              <select
                value={spSearchPreviousTeam}
                onChange={(e) => setSpSearchPreviousTeam(e.target.value)}
                className="flex-none text-xs"
                style={{ width: 140, borderColor: spSearchPreviousTeam ? '#185fa5' : undefined }}
              >
                <option value="">Previous team: any</option>
                {spPreviousTeamOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <select
                value={spSearchAvailability}
                onChange={(e) => setSpSearchAvailability(e.target.value)}
                className="flex-none text-xs"
                style={{ width: 130, borderColor: spSearchAvailability ? '#185fa5' : undefined }}
              >
                <option value="">Availability: any</option>
                <option value="available">Available</option>
                <option value="drafted">Drafted</option>
                <option value="not_available">Not Available</option>
              </select>
              <select
                value={spSortBy}
                onChange={(e) => setSpSortBy(e.target.value)}
                className="flex-none text-xs"
                style={{ width: 110 }}
              >
                <option value="name">Sort: name</option>
                <option value="gender">Sort: M/F</option>
                <option value="position">Sort: position</option>
              </select>
            </div>

            <p className="text-[10px] text-muted mb-2">{spResults.length} players</p>

            <div className="flex gap-2 overflow-x-auto pb-2">
              {spResults.map((p) => {
                const drafted = isRevealedDrafted(p);
                const draftedTeam = drafted ? teamsById[p.team_id] : null;
                const draftedTeamColor = draftedTeam?.team_color || '#0074ff';
                return (
                  <button
                    key={p.id}
                    onClick={() => openProfile(p.id)}
                    className="flex-none rounded-xl overflow-hidden flex flex-col items-center text-center"
                    style={{
                      width: 130,
                      background: drafted ? '#f1f3f6' : '#ffffff',
                      border: '1px solid #d8dde2',
                    }}
                  >
                    {drafted && (
                      <div className="w-full py-1" style={{ background: lightenColor(draftedTeamColor, 0.85) }}>
                        <p className="text-[9px] font-medium m-0" style={{ color: '#0c2340' }}>
                          Drafted By:
                        </p>
                        <p className="text-[10px] font-semibold m-0 truncate px-1" style={{ color: '#0c2340' }}>
                          {draftedTeam?.name || 'Unknown'}
                        </p>
                      </div>
                    )}
                    <div className="p-2.5 flex flex-col items-center">
                      {p.headshot_url ? (
                        <img src={p.headshot_url} alt={p.full_name} className="w-10 h-10 rounded-full object-cover mb-1.5" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center mb-1.5">
                          <i className="ti ti-user text-faint text-xl" aria-hidden="true" />
                        </div>
                      )}
                      <p className="text-xs font-medium text-ink m-0 leading-snug">
                        {p.full_name} <span className="font-normal text-muted">({p.gender})</span>
                      </p>
                      <p className="text-[10px] text-muted m-0 mt-0.5">
                        {p.offensive_position} / {p.defensive_position} &middot; {p.height_feet}'{p.height_inches}"
                      </p>
                      <p className="text-[10px] text-muted m-0 mt-0.5">Previous Team:</p>
                      <p className="text-[10px] text-muted m-0">{previousTeamLabel(p.previous_team)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );

  const draftedPlayersBlock = (
    <div className="mx-4 sm:mx-5 mt-3 rounded-xl border border-line bg-royal-pale/40 px-4 py-3.5">
      <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#0c447c' }}>
        Drafted players
      </p>

      <audio ref={audioRef} src="/sounds/pick-chime.mp3" preload="auto" />

      <div className="flex gap-2 overflow-x-auto pb-2 items-center" ref={draftedScrollRef}>
        {allSlots.map((slot) => {
          const isSkippedPick = slot.pick && !slot.pick.player_id;
          const isClockSlot =
            slot.pickNumber === currentPickNumber &&
            !slot.player &&
            !isSkippedPick &&
            (draftStatus === 'in_progress' || draftStatus === 'paused' || (draftStatus === 'not_started' && showDraftOrderPreview));
          const teamColor = slot.team?.team_color || '#0074ff';
          const owner = ownerByTeam[slot.team?.id];

          const isPoppedOut =
            showPopout && activeReveal && slot.pickNumber === activeReveal.pick_number && activeReveal.player_id;
          const isPoppedOutSkip =
            showPopout && activeReveal && slot.pickNumber === activeReveal.pick_number && !activeReveal.player_id;

          const skipReasonMessage =
            slot.pick?.skip_reason === 'gm_slow'
              ? 'The GM went to the toilet and never came back.'
              : slot.pick?.skip_reason === 'commissioner_decision'
              ? "Commissioner's Decision"
              : null;

          if (isPoppedOut) {
            const player = playersById[activeReveal.player_id];
            if (!player) return null;
            const poppedTeamColor = slot.team?.team_color || '#0074ff';
            const gmName = owner?.name;
            return (
              <div
                key={slot.pickNumber}
                ref={currentPickRef}
                onClick={() => openProfile(player.id)}
                className="flex-none rounded-2xl p-4 flex flex-col items-center text-center"
                style={{ width: 210, border: `4px solid ${poppedTeamColor}`, background: '#ffffff', cursor: 'pointer' }}
              >
                <p className="text-[19px] font-medium m-0 mb-2.5 tracking-wide" style={{ color: poppedTeamColor }}>
                  JUST DRAFTED!
                </p>
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <FootballIcon color={poppedTeamColor} size={15} />
                  <span className="text-sm font-medium" style={{ color: '#0c2340' }}>{slot.team?.name}</span>
                </div>
                {gmName && (
                  <p className="text-[13px] m-0 mb-3" style={{ color: '#5a6b7d' }}>
                    <span
                      className="text-[10px] font-medium rounded px-1.5 py-px mr-1"
                      style={{ color: poppedTeamColor, background: lightenColor(poppedTeamColor, 0.85) }}
                    >
                      GM
                    </span>
                    {gmName}
                  </p>
                )}
                {player.headshot_url ? (
                  <img src={player.headshot_url} alt={player.full_name} className="w-16 h-16 rounded-full object-cover mb-2.5" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-surface flex items-center justify-center mb-2.5">
                    <i className="ti ti-user text-faint text-2xl" aria-hidden="true" />
                  </div>
                )}
                <p className="text-[19px] font-medium m-0" style={{ color: '#0c2340' }}>{player.full_name}</p>
                <p className="text-xs m-0 mt-1 mb-1" style={{ color: '#5a6b7d' }}>
                  {player.offensive_position} / {player.defensive_position} &middot; {player.gender} &middot;{' '}
                  {player.height_feet}'{player.height_inches}"
                </p>
                <p className="text-[11px] m-0 mb-1.5" style={{ color: '#8b97a3' }}>
                  Previous Team: {previousTeamLabel(player.previous_team)}
                </p>
                {pubLineFor(player, players, gmName) && (
                  <p className="text-[11px] italic m-0" style={{ color: '#5a6b7d' }}>
                    {pubLineFor(player, players, gmName)}
                  </p>
                )}
              </div>
            );
          }

          return (
            <div
              key={slot.pickNumber}
              ref={isPoppedOutSkip ? currentPickRef : !activeReveal && slot.pickNumber === currentPickNumber ? currentPickRef : null}
              onClick={() => slot.player && openProfile(slot.player.id)}
              className={`flex-none rounded-xl p-3 flex flex-col items-center text-center ${
                isClockSlot && timeExpired ? 'animate-subtle-flash' : ''
              }`}
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
                Round {slot.round} &middot; Pick {pickInRound(slot.pickNumber, numTeams)}
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
                  {skipReasonMessage && (
                    <p className="text-[10px] text-faint m-0 mt-0.5 italic px-1">{skipReasonMessage}</p>
                  )}
                </>
              ) : isClockSlot ? (
                <>
                  <p className="text-xs font-medium m-0 leading-tight" style={{ color: '#0c2340' }}>
                    On the clock
                  </p>
                  <div
                    className="w-10 h-10 rounded-full bg-white flex items-center justify-center my-1.5"
                    style={{ border: `2px solid ${teamColor}` }}
                  >
                    <i className="ti ti-clock text-xl" style={{ color: teamColor }} aria-hidden="true" />
                  </div>
                  <p className="text-base font-semibold m-0 mb-1.5" style={{ color: '#0c2340' }}>
                    {timerDisplay}
                  </p>
                  <div className="flex items-center gap-1 justify-center">
                    <FootballIcon color={teamColor} size={13} />
                    <span className="text-[13px] font-semibold leading-tight" style={{ color: '#0c2340' }}>
                      {slot.team?.name}
                    </span>
                  </div>
                  {owner && <span className="text-[11px] text-muted mt-0.5">GM: {owner.name}</span>}
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
                ) : !isClockSlot ? (
                  <div className="flex items-center gap-1.5 justify-center min-w-0">
                    <FootballIcon color={teamColor} size={12} />
                    <span className="text-[10px] text-muted truncate leading-none">
                      {slot.team?.name}
                      {owner ? ` \u00b7 ${owner.name}` : ''}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const rostersBlock = (
    <div className="relative">
      <div
        className="mx-4 sm:mx-5 mt-4 rounded-xl border border-line bg-surface px-4 py-3"
        ref={rostersSectionRef}
      >
      <button
        onClick={() => {
          const opening = !viewByTeamOpen;
          setViewByTeamOpen(opening);
          if (opening) scrollRostersIntoView();
        }}
        className="w-full flex items-center justify-between"
      >
        <p className="text-xs font-semibold uppercase tracking-wide m-0" style={{ color: '#5a6b7d' }}>
          View rosters / Search players
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
                setSelectedRound(currentPickNumber > totalPicks ? 1 : Math.min(currentRound, maxRounds));
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
            <button
              type="button"
              onClick={() => {
                setRosterViewMode('search');
                scrollRostersIntoView();
              }}
              className="text-xs py-1.5 rounded-md font-medium text-center"
              style={{
                width: 104,
                background: rosterViewMode === 'search' ? '#185fa5' : '#ffffff',
                color: rosterViewMode === 'search' ? '#ffffff' : '#3d4a57',
                border: '1px solid #d8dde2',
              }}
            >
              Search players
            </button>
            {draftStatus === 'completed' && (
              <PrintRosterButton teams={teams} width={104} compact />
            )}
          </div>

          {rosterViewMode === 'search' && (
            <div>
              <div className="flex gap-2 flex-wrap items-center mb-2">
                <div className="relative flex-none" style={{ width: 150 }}>
                  <i className="ti ti-search absolute left-2.5 top-1/2 -translate-y-1/2 text-base text-faint" aria-hidden="true" />
                  <input
                    type="text"
                    value={spSearchName}
                    onChange={(e) => setSpSearchName(e.target.value)}
                    placeholder="Search by name"
                    className="w-full pl-8 text-xs"
                    style={{ borderColor: spSearchName ? '#185fa5' : undefined }}
                  />
                </div>
                <select
                  value={spSearchPosition}
                  onChange={(e) => setSpSearchPosition(e.target.value)}
                  className="flex-none text-xs"
                  style={{ width: 120, borderColor: spSearchPosition ? '#185fa5' : undefined }}
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
                  value={spSearchGender}
                  onChange={(e) => setSpSearchGender(e.target.value)}
                  className="flex-none text-xs"
                  style={{ width: 100, borderColor: spSearchGender ? '#185fa5' : undefined }}
                >
                  <option value="">M/F: any</option>
                  <option value="M">M</option>
                  <option value="F">F</option>
                </select>
                <select
                  value={spSearchPreviousTeam}
                  onChange={(e) => setSpSearchPreviousTeam(e.target.value)}
                  className="flex-none text-xs"
                  style={{ width: 140, borderColor: spSearchPreviousTeam ? '#185fa5' : undefined }}
                >
                  <option value="">Previous team: any</option>
                  {spPreviousTeamOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <select
                  value={spSearchAvailability}
                  onChange={(e) => setSpSearchAvailability(e.target.value)}
                  className="flex-none text-xs"
                  style={{ width: 130, borderColor: spSearchAvailability ? '#185fa5' : undefined }}
                >
                  <option value="">Availability: any</option>
                  <option value="available">Available</option>
                  <option value="drafted">Drafted</option>
                  <option value="not_available">Not Available</option>
                </select>
                <select
                  value={spSortBy}
                  onChange={(e) => setSpSortBy(e.target.value)}
                  className="flex-none text-xs"
                  style={{ width: 110 }}
                >
                  <option value="name">Sort: name</option>
                  <option value="gender">Sort: M/F</option>
                  <option value="position">Sort: position</option>
                </select>
              </div>

              <p className="text-[10px] text-muted mb-2">{spResults.length} players</p>

              <div className="flex gap-2 overflow-x-auto pb-2">
                {spResults.map((p) => {
                  const drafted = isRevealedDrafted(p);
                  const draftedTeam = drafted ? teamsById[p.team_id] : null;
                  const draftedTeamColor = draftedTeam?.team_color || '#0074ff';
                  return (
                    <button
                      key={p.id}
                      onClick={() => openProfile(p.id)}
                      className="flex-none rounded-xl overflow-hidden flex flex-col items-center text-center"
                      style={{
                        width: 130,
                        background: drafted ? '#f1f3f6' : '#ffffff',
                        border: '1px solid #d8dde2',
                      }}
                    >
                      {drafted && (
                        <div className="w-full py-1" style={{ background: lightenColor(draftedTeamColor, 0.85) }}>
                          <p className="text-[9px] font-medium m-0" style={{ color: '#0c2340' }}>
                            Drafted By:
                          </p>
                          <p className="text-[10px] font-semibold m-0 truncate px-1" style={{ color: '#0c2340' }}>
                            {draftedTeam?.name || 'Unknown'}
                          </p>
                        </div>
                      )}
                      <div className="p-2.5 flex flex-col items-center">
                        {p.headshot_url ? (
                          <img src={p.headshot_url} alt={p.full_name} className="w-10 h-10 rounded-full object-cover mb-1.5" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center mb-1.5">
                            <i className="ti ti-user text-faint text-xl" aria-hidden="true" />
                          </div>
                        )}
                        <p className="text-xs font-medium text-ink m-0 leading-snug">
                          {p.full_name} <span className="font-normal text-muted">({p.gender})</span>
                        </p>
                        <p className="text-[10px] text-muted m-0 mt-0.5">
                          {p.offensive_position} / {p.defensive_position} &middot; {p.height_feet}'{p.height_inches}"
                        </p>
                        <p className="text-[10px] text-muted m-0 mt-0.5">Previous Team:</p>
                        <p className="text-[10px] text-muted m-0">{previousTeamLabel(p.previous_team)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {rosterViewMode === 'team' && (
            <>
              <div className="flex gap-2 flex-wrap mb-2">
                {teams.map((t) => {
                  const color = t.team_color || '#0074ff';
                  const selected = viewingTeamId === t.id;
                  const isMine = t.id === myTeamId;
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
                          Proxy: {playersByEmail[viewedTeam.proxy_email]?.full_name || viewedTeam.proxy_email}
                        </p>
                      )}
                    </div>
                    {ownerByTeam[viewingTeamId] && (
                      <p className="text-[11px] m-0 mb-2" style={{ color: '#185fa5' }}>
                        GM:{' '}
                        <i
                          className={ownerByTeam[viewingTeamId].role === 'commissioner' ? 'ti ti-star-filled' : 'ti ti-star'}
                          style={{ color: teamColor }}
                          aria-hidden="true"
                        />{' '}
                        {ownerByTeam[viewingTeamId].name}
                      </p>
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
                            <span className="text-[9px] text-muted mt-0.5">Pick # {pickInRound(slot.pickNumber, numTeams)}</span>
                          </>
                        ) : isSkippedPick ? (
                          <>
                            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
                              <i className="ti ti-x text-faint text-base" aria-hidden="true" />
                            </div>
                            <p className="text-[10px] text-muted m-0 mt-1">Skipped</p>
                            {slot.pick?.skip_reason && (
                              <p className="text-[8px] text-faint m-0 mt-0.5 italic px-1 leading-tight">
                                {slot.pick.skip_reason === 'gm_slow'
                                  ? 'The GM went to the toilet and never came back.'
                                  : "Commissioner's Decision"}
                              </p>
                            )}
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
            <div className="bg-white rounded-lg p-3" style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '65vh' }}>
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
                                    <p
                                      className="text-[10px] font-medium m-0 mt-1 truncate leading-tight"
                                      style={{ color: '#0c2340' }}
                                    >
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
    </div>
  );

  return (
    <main style={{ background: '#ffffff', minHeight: '100vh', paddingBottom: 48 }}>
      <BrandHeader
        pageLabel={draftStatus === 'completed' ? 'Draft results' : draftStatus === 'paused' ? 'Draft paused' : draftStatus === 'not_started' ? 'Draft room' : 'Live draft'}
        liveIndicator={draftStatus === 'in_progress'}
        pickTimer={draftStatus === 'in_progress' ? timerDisplay : undefined}
      />

      {preDraftWaitingRoomBlock}

      {draftStatus === 'paused' && (
        <div className="bg-[#faeeda] mx-4 sm:mx-5 mt-4 rounded-lg p-3.5 flex gap-2">
          <i className="ti ti-player-pause text-base flex-shrink-0" style={{ color: '#854f0b' }} aria-hidden="true" />
          <p className="text-sm m-0" style={{ color: '#633806' }}>
            The commissioner has paused the draft. Grab a beer, have a smoke, we'll pick back up where we left off!
          </p>
        </div>
      )}

      {(draftStatus === 'in_progress' || draftStatus === 'paused') && (
        <>
          <div className="px-4 sm:px-5 pt-4">
            <p className="text-[10px] uppercase tracking-wide text-muted mb-1">Upcoming picks</p>
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
          </div>

          <p className="text-2xl font-semibold text-center m-0 pt-2" style={{ color: '#0c2340' }}>
            Round {currentRound}, Pick {pickInRound(currentPickNumber, numTeams)}
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

      {draftStatus === 'completed' ? (
        <>
          {rostersBlock}
          {draftedPlayersBlock}
        </>
      ) : (
        <>
          {(draftStatus !== 'not_started' || showDraftOrderPreview) && draftedPlayersBlock}
          {draftStatus !== 'not_started' && rostersBlock}
        </>
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
