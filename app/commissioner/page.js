'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import BrandHeader from '../../lib/BrandHeader';
import FootballIcon from '../../lib/FootballIcon';
import { randomizeDraftOrder } from '../../lib/draftLogic';

export default function CommissionerToolsPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  // All sections start collapsed - user taps a header to expand it.
  const [openSections, setOpenSections] = useState({});
  function toggleSection(key) {
    setOpenSections((s) => ({ ...s, [key]: !s[key] }));
  }
  const [myEmail, setMyEmail] = useState('');

  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [settings, setSettings] = useState(null);

  const [selectedEmail, setSelectedEmail] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [promoting, setPromoting] = useState(false);
  const [message, setMessage] = useState(null);

  // Draft format & schedule form state
  const [draftType, setDraftType] = useState('snake');
  const [draftDatetime, setDraftDatetime] = useState('');
  const [pickClockSeconds, setPickClockSeconds] = useState(120);
  const [minRosterSize, setMinRosterSize] = useState(9);
  const [minFemalePlayers, setMinFemalePlayers] = useState(2);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState(null);

  // Draft order form state
  const [teamOrder, setTeamOrder] = useState([]);
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderMessage, setOrderMessage] = useState(null);

  const [startingNow, setStartingNow] = useState(false);
  const [startMessage, setStartMessage] = useState(null);
  const [pausing, setPausing] = useState(false);

  const [savingUnlock, setSavingUnlock] = useState(false);

  const [resetEmail, setResetEmail] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetMessage, setResetMessage] = useState(null);

  const [playerPoolFilter, setPlayerPoolFilter] = useState('active');
  const [playerPoolSearch, setPlayerPoolSearch] = useState('');
  const [togglingPlayerId, setTogglingPlayerId] = useState(null);

  // Team management
  const [teamCountInput, setTeamCountInput] = useState(8);
  const [settingTeamCount, setSettingTeamCount] = useState(false);
  const [teamMgmtMessage, setTeamMgmtMessage] = useState(null);
  const [deletingTeamId, setDeletingTeamId] = useState(null);

  // Reset draft
  const [resetDraftConfirming, setResetDraftConfirming] = useState(false);
  const [resettingDraft, setResettingDraft] = useState(false);
  const [resetDraftMessage, setResetDraftMessage] = useState(null);

  // Assign / revoke commissioner
  const [commissionerEmail, setCommissionerEmail] = useState('');
  const [commissionerTeamId, setCommissionerTeamId] = useState('');
  const [assigningCommissioner, setAssigningCommissioner] = useState(false);
  const [commissionerMessage, setCommissionerMessage] = useState(null);
  const [revokingEmail, setRevokingEmail] = useState(null);
  const [reassigningTeamId, setReassigningTeamId] = useState(null);
  const [reassignEmail, setReassignEmail] = useState('');
  const [reassigning, setReassigning] = useState(false);
  const [clearingGmTeamId, setClearingGmTeamId] = useState(null);
  const [proxySelections, setProxySelections] = useState({});
  const [settingProxyTeamId, setSettingProxyTeamId] = useState(null);
  const [clearingProxyTeamId, setClearingProxyTeamId] = useState(null);
  const [proxyMessage, setProxyMessage] = useState(null);

  useEffect(() => {
    async function checkAccess() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setMyEmail(user.email?.toLowerCase() || '');
      const { data: profileRow } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profileRow?.role !== 'commissioner') {
        router.push('/profile');
        return;
      }
      setChecked(true);
    }
    checkAccess();
  }, [router]);

  const fetchData = useCallback(async () => {
    const [playersRes, teamsRes, profilesRes, settingsRes] = await Promise.all([
      supabase.from('players').select('*'),
      supabase.from('teams').select('*').order('draft_position', { ascending: true }),
      supabase.from('profiles').select('role, team_id, email'),
      supabase.from('draft_settings').select('*').eq('id', 1).single(),
    ]);
    setPlayers(playersRes.data || []);
    setTeams(teamsRes.data || []);
    setProfiles(profilesRes.data || []);
    setSettings(settingsRes.data || null);
    setTeamCountInput((teamsRes.data || []).length || 8);

    const s = settingsRes.data;
    if (s) {
      setDraftType(s.draft_type || 'snake');
      setDraftDatetime(s.draft_datetime ? toLocalInputValue(s.draft_datetime) : '');
      setPickClockSeconds(s.pick_clock_seconds ?? 120);
      setMinRosterSize(s.min_roster_size ?? 9);
      setMinFemalePlayers(s.min_female_players ?? 2);
    }
    setTeamOrder(
      (teamsRes.data || [])
        .slice()
        .sort((a, b) => (a.draft_position ?? 0) - (b.draft_position ?? 0))
        .map((t) => ({ id: t.id, name: t.name, team_color: t.team_color, draft_position: t.draft_position }))
    );
  }, []);

  useEffect(() => {
    if (checked) fetchData();
  }, [checked, fetchData]);

  // Best-effort auto-start check — harmless no-op if the scheduled time hasn't arrived yet.
  useEffect(() => {
    if (checked) supabase.rpc('start_draft_if_due');
  }, [checked]);

  function toLocalInputValue(isoString) {
    const d = new Date(isoString);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const assignedEmails = new Set(profiles.filter((p) => p.role === 'gm' || p.role === 'commissioner').map((p) => p.email));
  const commissionerEmails = new Set(profiles.filter((p) => p.role === 'commissioner').map((p) => p.email?.toLowerCase()));
  const sortedActivePlayers = players.filter((p) => p.is_active).slice().sort((a, b) => a.full_name.localeCompare(b.full_name));
  const availableToPromote = players
    .filter((p) => p.is_active && !p.team_id && !assignedEmails.has(p.email))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  const teamsById = Object.fromEntries(teams.map((t) => [t.id, t]));
  const playersByEmail = Object.fromEntries(players.map((p) => [p.email, p]));
  const currentGMs = profiles
    .filter((p) => p.role === 'gm' || p.role === 'commissioner')
    .map((p) => ({
      ...p,
      teamName: teamsById[p.team_id]?.name,
      playerName: playersByEmail[p.email]?.full_name,
    }));
  const ownerByTeamId = Object.fromEntries(currentGMs.filter((g) => g.team_id).map((g) => [g.team_id, g]));
  const teamsWithoutGM = teams.filter((t) => !ownerByTeamId[t.id]).sort((a, b) => a.name.localeCompare(b.name));

  const draftStatus = settings?.draft_status || 'not_started';
  const draftLocked = draftStatus !== 'not_started';

  const playerPool = useMemo(() => {
    const list = playerPoolFilter === 'active' ? players.filter((p) => p.is_active) : players.filter((p) => !p.is_active);
    const q = playerPoolSearch.trim().toLowerCase();
    const filtered = q
      ? list.filter((p) => p.full_name.toLowerCase().split(/\s+/).some((word) => word.startsWith(q)))
      : list;
    return filtered.slice().sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [players, playerPoolFilter, playerPoolSearch]);

  async function handlePromote() {
    if (!selectedEmail || !selectedTeamId) return;
    setPromoting(true);
    setMessage(null);
    const { error } = await supabase.rpc('promote_to_gm', {
      player_email: selectedEmail,
      target_team_id: selectedTeamId,
    });
    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({ type: 'success', text: 'Player promoted to GM and assigned to their team.' });
      setSelectedEmail('');
      setSelectedTeamId('');
      fetchData();
    }
    setPromoting(false);
  }

  async function handleSaveSettings() {
    setSavingSettings(true);
    setSettingsMessage(null);
    const { error } = await supabase
      .from('draft_settings')
      .update({
        draft_type: draftType,
        draft_datetime: draftDatetime ? new Date(draftDatetime).toISOString() : null,
        pick_clock_seconds: Number(pickClockSeconds) || 120,
        min_roster_size: Number(minRosterSize) || 9,
        min_female_players: Number(minFemalePlayers) || 2,
      })
      .eq('id', 1);
    if (error) {
      setSettingsMessage({ type: 'error', text: error.message });
    } else {
      setSettingsMessage({ type: 'success', text: 'Draft settings saved.' });
      fetchData();
    }
    setSavingSettings(false);
  }

  async function handleSaveOrder() {
    setSavingOrder(true);
    setOrderMessage(null);
    const seen = new Set();
    for (const t of teamOrder) {
      if (!t.draft_position || seen.has(t.draft_position)) {
        setOrderMessage({ type: 'error', text: 'Each team needs its own unique draft position (1, 2, 3…).' });
        setSavingOrder(false);
        return;
      }
      seen.add(t.draft_position);
    }
    const results = await Promise.all(
      teamOrder.map((t) => supabase.from('teams').update({ draft_position: t.draft_position }).eq('id', t.id))
    );
    const firstError = results.find((r) => r.error);
    if (firstError) {
      setOrderMessage({ type: 'error', text: firstError.error.message });
    } else {
      setOrderMessage({ type: 'success', text: 'Draft order saved.' });
      fetchData();
    }
    setSavingOrder(false);
  }

  function handleRandomizeOrder() {
    const positions = randomizeDraftOrder(teamOrder.map((t) => t.id));
    const posById = Object.fromEntries(positions.map((p) => [p.id, p.draft_position]));
    setTeamOrder((prev) =>
      prev
        .map((t) => ({ ...t, draft_position: posById[t.id] }))
        .sort((a, b) => a.draft_position - b.draft_position)
    );
  }

  async function handleStartNow() {
    setStartingNow(true);
    setStartMessage(null);
    const { error } = await supabase.rpc('start_draft_now');
    if (error) {
      setStartMessage({ type: 'error', text: error.message });
    } else {
      setStartMessage({ type: 'success', text: 'The draft is now live.' });
      fetchData();
    }
    setStartingNow(false);
  }

  async function handleToggleUnlock() {
    setSavingUnlock(true);
    await supabase
      .from('draft_settings')
      .update({ profile_edits_unlocked_override: !settings?.profile_edits_unlocked_override })
      .eq('id', 1);
    await fetchData();
    setSavingUnlock(false);
  }

  async function handleResetPassword() {
    if (!resetEmail) return;
    setResettingPassword(true);
    setResetMessage(null);
    const { error } = await supabase.rpc('reset_player_password', { target_email: resetEmail });
    if (error) {
      setResetMessage({ type: 'error', text: error.message });
    } else {
      setResetMessage({ type: 'success', text: `Password reset to the default. They can log in and set a new one from their profile.` });
      setResetEmail('');
    }
    setResettingPassword(false);
  }

  async function handleTogglePlayerActive(player) {
    setTogglingPlayerId(player.id);
    await supabase.from('players').update({ is_active: !player.is_active }).eq('id', player.id);
    await fetchData();
    setTogglingPlayerId(null);
  }

  async function handleSetTeamCount() {
    if (teamCountInput === teams.length) return;
    setSettingTeamCount(true);
    setTeamMgmtMessage(null);
    const { error } = await supabase.rpc('set_team_count', { target_count: teamCountInput });
    if (error) {
      setTeamMgmtMessage({ type: 'error', text: error.message });
      setTeamCountInput(teams.length);
    } else {
      setTeamMgmtMessage({ type: 'success', text: `League set to ${teamCountInput} teams.` });
      fetchData();
    }
    setSettingTeamCount(false);
  }

  async function handleDeleteTeam(team) {
    if (teams.length <= 4) {
      setTeamMgmtMessage({ type: 'error', text: 'At least 4 teams are required.' });
      return;
    }
    setDeletingTeamId(team.id);
    setTeamMgmtMessage(null);
    const { error } = await supabase.rpc('delete_team', { target_team_id: team.id });
    if (error) {
      setTeamMgmtMessage({ type: 'error', text: error.message });
    } else {
      await supabase.from('draft_settings').update({ num_teams: teams.length - 1 }).eq('id', 1);
      setTeamMgmtMessage({ type: 'success', text: `${team.name} removed.` });
      fetchData();
    }
    setDeletingTeamId(null);
  }

  async function handlePauseResume() {
    setPausing(true);
    setStartMessage(null);
    const pickClockSeconds = settings?.pick_clock_seconds ?? 120;
    let updates;
    if (draftStatus === 'paused') {
      // Resume: back-date current_pick_started_at so the clock continues
      // from exactly where it was when paused, instead of restarting.
      const remaining = settings?.paused_seconds_remaining ?? pickClockSeconds;
      const elapsedMs = (pickClockSeconds - remaining) * 1000;
      updates = {
        draft_status: 'in_progress',
        current_pick_started_at: new Date(Date.now() - elapsedMs).toISOString(),
        paused_seconds_remaining: null,
      };
    } else {
      const startedAt = settings?.current_pick_started_at ? new Date(settings.current_pick_started_at).getTime() : null;
      const remaining = startedAt
        ? Math.max(pickClockSeconds - Math.floor((Date.now() - startedAt) / 1000), 0)
        : pickClockSeconds;
      updates = { draft_status: 'paused', paused_seconds_remaining: remaining };
    }
    const { error } = await supabase.from('draft_settings').update(updates).eq('id', 1);
    if (error) {
      setStartMessage({ type: 'error', text: error.message });
    } else {
      setStartMessage({
        type: 'success',
        text: draftStatus === 'paused' ? 'Draft resumed.' : 'Draft paused.',
      });
      fetchData();
    }
    setPausing(false);
  }

  async function handleResetDraft() {
    if (!resetDraftConfirming) {
      setResetDraftConfirming(true);
      return;
    }
    setResettingDraft(true);
    setResetDraftMessage(null);
    const { error } = await supabase.rpc('reset_draft');
    if (error) {
      setResetDraftMessage({ type: 'error', text: error.message });
    } else {
      setResetDraftMessage({ type: 'success', text: 'Draft reset — every pick has been cleared.' });
      fetchData();
    }
    setResettingDraft(false);
    setResetDraftConfirming(false);
  }

  async function handleAssignCommissioner() {
    if (!commissionerEmail) return;
    setAssigningCommissioner(true);
    setCommissionerMessage(null);
    const { error } = await supabase.rpc('promote_to_commissioner', {
      player_email: commissionerEmail,
      target_team_id: commissionerTeamId || null,
    });
    if (error) {
      setCommissionerMessage({ type: 'error', text: error.message });
    } else {
      setCommissionerMessage({ type: 'success', text: 'Commissioner access granted.' });
      setCommissionerEmail('');
      setCommissionerTeamId('');
      fetchData();
    }
    setAssigningCommissioner(false);
  }

  async function handleRevokeCommissioner(email) {
    setRevokingEmail(email);
    setCommissionerMessage(null);
    const { error } = await supabase.rpc('demote_commissioner', { target_email: email });
    if (error) {
      setCommissionerMessage({ type: 'error', text: error.message });
    } else {
      setCommissionerMessage({ type: 'success', text: 'Commissioner access removed.' });
      fetchData();
    }
    setRevokingEmail(null);
  }

  async function handleReassign(teamId) {
    if (!reassignEmail) return;
    setReassigning(true);
    setCommissionerMessage(null);
    const { error } = await supabase.rpc('promote_to_gm', { player_email: reassignEmail, target_team_id: teamId });
    if (error) {
      setCommissionerMessage({ type: 'error', text: error.message });
    } else {
      setCommissionerMessage({ type: 'success', text: 'GM reassigned.' });
      setReassigningTeamId(null);
      setReassignEmail('');
      fetchData();
    }
    setReassigning(false);
  }

  async function handleClearGm(teamId, teamName) {
    if (!window.confirm(`Clear the GM from ${teamName}? The team stays as-is, ready to assign to someone else.`)) return;
    setClearingGmTeamId(teamId);
    setCommissionerMessage(null);
    const { error } = await supabase.rpc('clear_gm', { target_team_id: teamId });
    if (error) {
      setCommissionerMessage({ type: 'error', text: error.message });
    } else {
      setCommissionerMessage({ type: 'success', text: `GM cleared from ${teamName}.` });
      fetchData();
    }
    setClearingGmTeamId(null);
  }

  async function handleSetProxy(teamId) {
    const email = proxySelections[teamId];
    if (!email) return;
    setSettingProxyTeamId(teamId);
    setProxyMessage(null);
    const { error } = await supabase.from('teams').update({ proxy_email: email }).eq('id', teamId);
    if (error) {
      setProxyMessage({ type: 'error', text: error.message });
    } else {
      setProxyMessage({ type: 'success', text: 'Proxy set.' });
      fetchData();
    }
    setSettingProxyTeamId(null);
  }

  async function handleClearProxy(teamId) {
    setClearingProxyTeamId(teamId);
    setProxyMessage(null);
    const { error } = await supabase.from('teams').update({ proxy_email: null }).eq('id', teamId);
    if (error) {
      setProxyMessage({ type: 'error', text: error.message });
    } else {
      setProxyMessage({ type: 'success', text: 'Proxy cleared.' });
      fetchData();
    }
    setClearingProxyTeamId(null);
  }

  if (!checked) {
    return (
      <main style={{ background: '#ffffff', minHeight: '100vh' }}>
        <BrandHeader pageLabel="Commissioner tools" />
        <p className="text-center text-muted text-sm p-10">Checking access…</p>
      </main>
    );
  }

  return (
    <main style={{ background: '#ffffff', minHeight: '100vh' }}>
      <BrandHeader pageLabel="Commissioner tools" />
      <div className="max-w-xl mx-auto px-4 py-8">

        {/* Draft format & schedule */}
        <div className="bg-surface rounded-xl p-4 mb-5">
          <button onClick={() => toggleSection('draft-format-and-schedule')} className="w-full flex items-center justify-between">
            <p className="text-sm font-medium text-ink m-0">Draft format and schedule</p>
            <i className={`ti ti-chevron-${openSections['draft-format-and-schedule'] ? 'up' : 'down'} text-base text-muted`} aria-hidden="true" />
          </button>
          {openSections['draft-format-and-schedule'] && (
          <>
          <p className="text-xs text-muted mb-3">
            {draftLocked
              ? "The draft has already started, so format changes here won't affect what's already happened."
              : 'Set these before the draft starts.'}
          </p>

          {settingsMessage && (
            <div
              className="rounded-md px-3 py-2 mb-3 text-xs"
              style={{
                background: settingsMessage.type === 'error' ? '#fcebeb' : '#eaf3de',
                color: settingsMessage.type === 'error' ? '#791f1f' : '#27500a',
              }}
            >
              {settingsMessage.text}
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            <label className="text-xs text-muted">
              Draft type
              <select value={draftType} onChange={(e) => setDraftType(e.target.value)} className="w-full text-xs mt-1">
                <option value="snake">Snake (order reverses each round)</option>
                <option value="repeat">Repeat (same order every round)</option>
              </select>
            </label>

            <label className="text-xs text-muted">
              Draft date and time
              <input
                type="datetime-local"
                value={draftDatetime}
                onChange={(e) => setDraftDatetime(e.target.value)}
                className="w-full text-xs mt-1"
              />
            </label>

            <div className="flex gap-2">
              <label className="text-xs text-muted flex-1">
                Pick clock (seconds)
                <input
                  type="number"
                  min="10"
                  value={pickClockSeconds}
                  onChange={(e) => setPickClockSeconds(e.target.value)}
                  className="w-full text-xs mt-1"
                />
              </label>
              <label className="text-xs text-muted flex-1">
                Min roster size
                <input
                  type="number"
                  min="1"
                  value={minRosterSize}
                  onChange={(e) => setMinRosterSize(e.target.value)}
                  className="w-full text-xs mt-1"
                />
              </label>
              <label className="text-xs text-muted flex-1">
                Min female players
                <input
                  type="number"
                  min="0"
                  value={minFemalePlayers}
                  onChange={(e) => setMinFemalePlayers(e.target.value)}
                  className="w-full text-xs mt-1"
                />
              </label>
            </div>
          </div>

          <button onClick={handleSaveSettings} disabled={savingSettings} className="btn-primary text-xs w-full mt-3">
            {savingSettings ? 'Saving…' : 'Save draft settings'}
          </button>
          </>
          )}
        </div>
        <div className="bg-surface rounded-xl p-4 mb-5">
          <button onClick={() => toggleSection('draft-order')} className="w-full flex items-center justify-between">
            <p className="text-sm font-medium text-ink m-0">Draft order</p>
            <i className={`ti ti-chevron-${openSections['draft-order'] ? 'up' : 'down'} text-base text-muted`} aria-hidden="true" />
          </button>
          {openSections['draft-order'] && (
          <>
          <p className="text-xs text-muted mb-3">
            {draftLocked
              ? 'The draft order is locked once the draft has started.'
              : 'Set each team\u2019s draft position, or randomize.'}
          </p>

          {orderMessage && (
            <div
              className="rounded-md px-3 py-2 mb-3 text-xs"
              style={{
                background: orderMessage.type === 'error' ? '#fcebeb' : '#eaf3de',
                color: orderMessage.type === 'error' ? '#791f1f' : '#27500a',
              }}
            >
              {orderMessage.text}
            </div>
          )}

          <div className="flex flex-col gap-2 mb-3">
            {teamOrder.map((t) => (
              <div key={t.id} className="flex items-center gap-2 bg-white rounded-md px-3 py-2">
                <FootballIcon color={t.team_color || '#0074ff'} size={14} />
                <span className="text-xs text-ink flex-1">{t.name}</span>
                <input
                  type="number"
                  min="1"
                  disabled={draftLocked}
                  value={t.draft_position ?? ''}
                  onChange={(e) => {
                    const val = Number(e.target.value) || '';
                    setTeamOrder((prev) => prev.map((x) => (x.id === t.id ? { ...x, draft_position: val } : x)));
                  }}
                  className="text-xs"
                  style={{ width: 56 }}
                />
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button onClick={handleRandomizeOrder} disabled={draftLocked} className="btn-secondary text-xs flex-1">
              Randomize order
            </button>
            <button onClick={handleSaveOrder} disabled={draftLocked || savingOrder} className="btn-primary text-xs flex-1">
              {savingOrder ? 'Saving…' : 'Save order'}
            </button>
          </div>
          </>
          )}
        </div>
        <div className="bg-surface rounded-xl p-4 mb-5">
          <button onClick={() => toggleSection('draft-controls')} className="w-full flex items-center justify-between">
            <p className="text-sm font-medium text-ink m-0">Draft controls</p>
            <i className={`ti ti-chevron-${openSections['draft-controls'] ? 'up' : 'down'} text-base text-muted`} aria-hidden="true" />
          </button>
          {openSections['draft-controls'] && (
          <>
          <p className="text-xs text-muted mb-3">
            {draftStatus === 'not_started' && 'The draft will start automatically at the scheduled time above, or you can start it early.'}
            {draftStatus === 'in_progress' && 'The draft is currently live.'}
            {draftStatus === 'paused' && 'The draft is paused.'}
            {draftStatus === 'completed' && 'The draft has finished.'}
          </p>

          {draftStatus === 'not_started' && teamsWithoutGM.length > 0 && (
            <div className="rounded-md px-3 py-2 mb-3 text-xs" style={{ background: '#faeeda', color: '#633806' }}>
              Every team needs a GM before the draft can start. Still missing one: {teamsWithoutGM.map((t) => t.name).join(', ')}.
            </div>
          )}

          {startMessage && (
            <div
              className="rounded-md px-3 py-2 mb-3 text-xs"
              style={{
                background: startMessage.type === 'error' ? '#fcebeb' : '#eaf3de',
                color: startMessage.type === 'error' ? '#791f1f' : '#27500a',
              }}
            >
              {startMessage.text}
            </div>
          )}

          {draftStatus === 'not_started' && (
            <button
              onClick={handleStartNow}
              disabled={startingNow || teamsWithoutGM.length > 0}
              className="btn-primary text-xs w-full"
            >
              {startingNow ? 'Starting…' : 'Start draft now'}
            </button>
          )}

          {(draftStatus === 'in_progress' || draftStatus === 'paused') && (
            <button onClick={handlePauseResume} disabled={pausing} className="btn-secondary text-xs w-full">
              {pausing ? 'Saving…' : draftStatus === 'paused' ? 'Resume draft' : 'Pause draft'}
            </button>
          )}

          <div className="border-t border-line mt-3 pt-3">
            <p className="text-xs text-muted mb-2">
              Clears every pick and puts the draft back to not-started. Teams that are already assigned as GM/commissioner
              stay put — everyone else goes back into the pool. This can't be undone.
            </p>

            {resetDraftMessage && (
              <div
                className="rounded-md px-3 py-2 mb-2 text-xs"
                style={{
                  background: resetDraftMessage.type === 'error' ? '#fcebeb' : '#eaf3de',
                  color: resetDraftMessage.type === 'error' ? '#791f1f' : '#27500a',
                }}
              >
                {resetDraftMessage.text}
              </div>
            )}

            <button
              onClick={handleResetDraft}
              disabled={resettingDraft}
              className="text-xs w-full rounded-md py-2 font-medium"
              style={{ background: resetDraftConfirming ? '#c0392b' : '#fcebeb', color: resetDraftConfirming ? '#ffffff' : '#791f1f' }}
            >
              {resettingDraft ? 'Resetting…' : resetDraftConfirming ? 'Click again to confirm reset' : 'Reset the draft'}
            </button>
            {resetDraftConfirming && (
              <button onClick={() => setResetDraftConfirming(false)} className="text-[11px] text-muted mt-1.5 underline">
                Cancel
              </button>
            )}
          </div>
          </>
          )}
        </div>
        <div className="bg-surface rounded-xl p-4 mb-5">
          <button onClick={() => toggleSection('teams')} className="w-full flex items-center justify-between">
            <p className="text-sm font-medium text-ink m-0">Teams</p>
            <i className={`ti ti-chevron-${openSections['teams'] ? 'up' : 'down'} text-base text-muted`} aria-hidden="true" />
          </button>
          {openSections['teams'] && (
          <>
          <p className="text-xs text-muted mb-3">
            {draftLocked
              ? 'Teams are locked once the draft has started.'
              : `Add or remove teams (4-12 total). GMs name their own team and pick their color from their profile page \u2014 what you set here is just a placeholder until they do. Removing a team only works before it has any drafted roster or picks; if it has a GM but no roster yet, removing it releases that GM back into the player pool.`}
          </p>

          {teamMgmtMessage && (
            <div
              className="rounded-md px-3 py-2 mb-3 text-xs"
              style={{
                background: teamMgmtMessage.type === 'error' ? '#fcebeb' : '#eaf3de',
                color: teamMgmtMessage.type === 'error' ? '#791f1f' : '#27500a',
              }}
            >
              {teamMgmtMessage.text}
            </div>
          )}

          <div className="flex flex-col gap-2 mb-3">
            {teams.map((t) => {
              const owner = ownerByTeamId[t.id];
              return (
                <div key={t.id} className="flex items-center gap-2 bg-white rounded-md px-3 py-2">
                  <FootballIcon color={t.team_color || '#0074ff'} size={14} />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-ink block truncate">{t.name}</span>
                    <span className="text-[10px] text-muted block truncate">
                      {owner ? `GM: ${owner.playerName || owner.email}` : 'No GM assigned yet'}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      if (
                        !owner ||
                        window.confirm(
                          `Remove ${t.name}? This will release ${owner.playerName || owner.email} back into the player pool as a regular player.`
                        )
                      ) {
                        handleDeleteTeam(t);
                      }
                    }}
                    disabled={draftLocked || deletingTeamId === t.id}
                    className="text-[11px] font-medium rounded-md px-2 py-1 flex-shrink-0"
                    style={{ background: '#fcebeb', color: '#791f1f' }}
                  >
                    {deletingTeamId === t.id ? '…' : 'Remove'}
                  </button>
                </div>
              );
            })}
          </div>

          {!draftLocked && (
            <div className="flex items-center gap-2 bg-white rounded-md px-3 py-2.5">
              <span className="text-xs text-ink flex-1">
                Number of teams in the league
                <span className="block text-[11px] text-muted">Currently {teams.length}</span>
              </span>
              <select
                value={teamCountInput}
                onChange={(e) => setTeamCountInput(Number(e.target.value))}
                className="text-xs"
                style={{ width: 64 }}
              >
                {[4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <button
                onClick={handleSetTeamCount}
                disabled={teamCountInput === teams.length || settingTeamCount}
                className="btn-primary text-xs flex-shrink-0"
              >
                {settingTeamCount ? 'Saving…' : 'Apply'}
              </button>
            </div>
          )}
          <p className="text-[11px] text-faint mt-1.5">
            Raising the count adds placeholder teams with a temporary name and a random color \u2014 assign each a GM
            below, and they'll rename their team and pick their own color from their profile. Lowering the count only
            removes teams that don't have a GM yet.
          </p>
          </>
          )}
        </div>
        <div className="bg-surface rounded-xl p-4 mb-5">
          <button onClick={() => toggleSection('assign-a-gm')} className="w-full flex items-center justify-between">
            <p className="text-sm font-medium text-ink m-0">Assign a GM</p>
            <i className={`ti ti-chevron-${openSections['assign-a-gm'] ? 'up' : 'down'} text-base text-muted`} aria-hidden="true" />
          </button>
          {openSections['assign-a-gm'] && (
          <>
          <p className="text-xs text-muted mb-3">
            Choose a registered player and a team. They'll be removed from the draft pool and placed directly on that
            team's roster.
          </p>

          {message && (
            <div
              className="rounded-md px-3 py-2 mb-3 text-xs"
              style={{
                background: message.type === 'error' ? '#fcebeb' : '#eaf3de',
                color: message.type === 'error' ? '#791f1f' : '#27500a',
              }}
            >
              {message.text}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <select value={selectedEmail} onChange={(e) => setSelectedEmail(e.target.value)} className="flex-1 text-xs">
              <option value="">Select a player…</option>
              {availableToPromote.map((p) => (
                <option key={p.email} value={p.email}>
                  {p.full_name} ({p.email})
                </option>
              ))}
            </select>
            <select value={selectedTeamId} onChange={(e) => setSelectedTeamId(e.target.value)} className="flex-1 text-xs">
              <option value="">Select a team…</option>
              {teamsWithoutGM.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handlePromote}
            disabled={!selectedEmail || !selectedTeamId || promoting}
            className="btn-primary text-xs w-full"
          >
            {promoting ? 'Assigning…' : 'Assign as GM'}
          </button>

          {teamsWithoutGM.length === 0 && (
            <p className="text-[11px] text-faint mt-2">Every team already has a GM assigned.</p>
          )}
          {availableToPromote.length === 0 && teamsWithoutGM.length > 0 && (
            <p className="text-[11px] text-faint mt-2">
              No unassigned registered players available right now — they'll appear here once they register.
            </p>
          )}
          </>
          )}
        </div>
        <div className="bg-surface rounded-xl p-4 mb-5">
          <button onClick={() => toggleSection('current-gm-commissioner-assignments')} className="w-full flex items-center justify-between">
            <p className="text-sm font-medium text-ink m-0">Current GM / commissioner assignments</p>
            <i className={`ti ti-chevron-${openSections['current-gm-commissioner-assignments'] ? 'up' : 'down'} text-base text-muted`} aria-hidden="true" />
          </button>
          {openSections['current-gm-commissioner-assignments'] && (
          <>

          {commissionerMessage && (
            <div
              className="rounded-md px-3 py-2 mb-3 text-xs"
              style={{
                background: commissionerMessage.type === 'error' ? '#fcebeb' : '#eaf3de',
                color: commissionerMessage.type === 'error' ? '#791f1f' : '#27500a',
              }}
            >
              {commissionerMessage.text}
            </div>
          )}

          {currentGMs.length === 0 ? (
            <p className="text-xs text-muted">No one assigned yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {currentGMs.map((g) => (
                <div key={g.email} className="bg-white rounded-md px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {g.team_id ? (
                        <FootballIcon color={teamsById[g.team_id]?.team_color || '#0074ff'} size={14} />
                      ) : (
                        <i className="ti ti-shield text-sm text-muted" aria-hidden="true" />
                      )}
                      <span className="text-xs text-ink truncate">{teamsById[g.team_id]?.name || 'No team (admin only)'}</span>
                    </div>
                    <span className="text-xs text-muted flex items-center gap-1 flex-shrink-0">
                      <i className={g.role === 'commissioner' ? 'ti ti-star-filled' : 'ti ti-star'} aria-hidden="true" />
                      {g.playerName || g.email}
                    </span>
                    {g.role === 'commissioner' && g.email?.toLowerCase() !== myEmail && (
                      <button
                        onClick={() => handleRevokeCommissioner(g.email)}
                        disabled={revokingEmail === g.email}
                        className="text-[11px] font-medium rounded-md px-2 py-1 flex-shrink-0"
                        style={{ background: '#fcebeb', color: '#791f1f' }}
                      >
                        {revokingEmail === g.email ? '…' : 'Revoke'}
                      </button>
                    )}
                    {g.role === 'gm' && g.team_id && (
                      <div className="flex gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => {
                            setReassigningTeamId(reassigningTeamId === g.team_id ? null : g.team_id);
                            setReassignEmail('');
                          }}
                          className="text-[11px] font-medium rounded-md px-2 py-1"
                          style={{ background: '#e6f1fb', color: '#0c447c' }}
                        >
                          Reassign
                        </button>
                        <button
                          onClick={() => handleClearGm(g.team_id, teamsById[g.team_id]?.name || 'this team')}
                          disabled={clearingGmTeamId === g.team_id}
                          className="text-[11px] font-medium rounded-md px-2 py-1"
                          style={{ background: '#fcebeb', color: '#791f1f' }}
                        >
                          {clearingGmTeamId === g.team_id ? '…' : 'Clear GM'}
                        </button>
                      </div>
                    )}
                  </div>
                  {reassigningTeamId === g.team_id && (
                    <div className="flex gap-2 mt-2 pt-2 border-t border-line">
                      <select value={reassignEmail} onChange={(e) => setReassignEmail(e.target.value)} className="flex-1 text-xs">
                        <option value="">Select a new GM…</option>
                        {sortedActivePlayers
                          .filter((p) => p.email !== g.email)
                          .map((p) => (
                            <option key={p.email} value={p.email}>
                              {p.full_name} ({p.email})
                            </option>
                          ))}
                      </select>
                      <button
                        onClick={() => handleReassign(g.team_id)}
                        disabled={!reassignEmail || reassigning}
                        className="btn-primary text-xs flex-shrink-0"
                      >
                        {reassigning ? 'Saving…' : 'Confirm'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          </>
          )}
        </div>
        <div className="bg-surface rounded-xl p-4 mb-5">
          <button onClick={() => toggleSection('assign-a-commissioner')} className="w-full flex items-center justify-between">
            <p className="text-sm font-medium text-ink m-0">Assign a commissioner</p>
            <i className={`ti ti-chevron-${openSections['assign-a-commissioner'] ? 'up' : 'down'} text-base text-muted`} aria-hidden="true" />
          </button>
          {openSections['assign-a-commissioner'] && (
          <>
          <p className="text-xs text-muted mb-3">
            Give another registered player commissioner access — useful for a co-commissioner. There's no limit on how
            many you can add. Optionally tie them to a team, or leave it as admin-only. Only shows players who aren't
            already a commissioner.
          </p>

          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <select value={commissionerEmail} onChange={(e) => setCommissionerEmail(e.target.value)} className="flex-1 text-xs">
              <option value="">Select a player…</option>
              {sortedActivePlayers
                .filter((p) => !commissionerEmails.has(p.email?.toLowerCase()))
                .map((p) => (
                  <option key={p.email} value={p.email}>
                    {p.full_name} ({p.email})
                  </option>
                ))}
            </select>
            <select value={commissionerTeamId} onChange={(e) => setCommissionerTeamId(e.target.value)} className="flex-1 text-xs">
              <option value="">No team (admin only)</option>
              {teams
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </div>

          <button
            onClick={handleAssignCommissioner}
            disabled={!commissionerEmail || assigningCommissioner}
            className="btn-primary text-xs w-full"
          >
            {assigningCommissioner ? 'Assigning…' : 'Grant commissioner access'}
          </button>
          </>
          )}
        </div>
        <div className="bg-surface rounded-xl p-4 mb-5">
          <button onClick={() => toggleSection('player-pool')} className="w-full flex items-center justify-between">
            <p className="text-sm font-medium text-ink m-0">Player pool</p>
            <i className={`ti ti-chevron-${openSections['player-pool'] ? 'up' : 'down'} text-base text-muted`} aria-hidden="true" />
          </button>
          {openSections['player-pool'] && (
          <>
          <p className="text-xs text-muted mb-3">
            Inactivate a player to take them out of the draft pool without deleting them — for injury, a season off, or
            similar. Inactive players can't be drafted or registered against, and can be reactivated any time.
          </p>

          <div className="flex gap-1.5 mb-3">
            <button
              onClick={() => setPlayerPoolFilter('active')}
              className="text-xs px-2.5 py-1 rounded-md font-medium"
              style={{
                background: playerPoolFilter === 'active' ? '#185fa5' : '#ffffff',
                color: playerPoolFilter === 'active' ? '#ffffff' : '#3d4a57',
                border: '1px solid #d8dde2',
              }}
            >
              Active ({players.filter((p) => p.is_active).length})
            </button>
            <button
              onClick={() => setPlayerPoolFilter('inactive')}
              className="text-xs px-2.5 py-1 rounded-md font-medium"
              style={{
                background: playerPoolFilter === 'inactive' ? '#185fa5' : '#ffffff',
                color: playerPoolFilter === 'inactive' ? '#ffffff' : '#3d4a57',
                border: '1px solid #d8dde2',
              }}
            >
              Inactive ({players.filter((p) => !p.is_active).length})
            </button>
          </div>

          <div className="relative mb-3">
            <i className="ti ti-search absolute left-2.5 top-1/2 -translate-y-1/2 text-base text-faint" aria-hidden="true" />
            <input
              type="text"
              value={playerPoolSearch}
              onChange={(e) => setPlayerPoolSearch(e.target.value)}
              placeholder="Search by name"
              className="w-full text-xs"
              style={{ paddingLeft: 30 }}
            />
          </div>

          <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
            {playerPool.length === 0 && (
              <p className="text-xs text-muted">No {playerPoolFilter} players match.</p>
            )}
            {playerPool.map((p) => (
              <div key={p.id} className="flex items-center justify-between bg-white rounded-md px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-ink m-0 truncate">{p.full_name}</p>
                  <p className="text-[11px] text-muted m-0">
                    {p.team_id ? `On ${teamsById[p.team_id]?.name || 'a team'}` : 'Unassigned'}
                  </p>
                </div>
                <button
                  onClick={() => handleTogglePlayerActive(p)}
                  disabled={togglingPlayerId === p.id}
                  className="text-xs font-medium rounded-md px-2.5 py-1.5 flex-shrink-0"
                  style={{
                    background: p.is_active ? '#fcebeb' : '#eaf3de',
                    color: p.is_active ? '#791f1f' : '#27500a',
                  }}
                >
                  {togglingPlayerId === p.id ? '…' : p.is_active ? 'Inactivate' : 'Reactivate'}
                </button>
              </div>
            ))}
          </div>
          </>
          )}
        </div>
        <div className="bg-surface rounded-xl p-4 mb-5">
          <button onClick={() => toggleSection('draft-day-proxy')} className="w-full flex items-center justify-between">
            <p className="text-sm font-medium text-ink m-0">Draft-day proxy</p>
            <i className={`ti ti-chevron-${openSections['draft-day-proxy'] ? 'up' : 'down'} text-base text-muted`} aria-hidden="true" />
          </button>
          {openSections['draft-day-proxy'] && (
          <>
          <p className="text-xs text-muted mb-3">
            Let someone else pick for a team if its GM can't make it. Anyone active is eligible, even someone already
            drafted onto another roster. The GM keeps their own access too — this is a backup, not a replacement. Set
            or clear it any time, before or during the draft.
          </p>

          {proxyMessage && (
            <div
              className="rounded-md px-3 py-2 mb-3 text-xs"
              style={{
                background: proxyMessage.type === 'error' ? '#fcebeb' : '#eaf3de',
                color: proxyMessage.type === 'error' ? '#791f1f' : '#27500a',
              }}
            >
              {proxyMessage.text}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {teams.map((t) => {
              const owner = ownerByTeamId[t.id];
              const proxyPlayer = t.proxy_email ? players.find((p) => p.email?.toLowerCase() === t.proxy_email.toLowerCase()) : null;
              return (
                <div key={t.id} className="bg-white rounded-md px-3 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <FootballIcon color={t.team_color || '#0074ff'} size={14} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-ink m-0 truncate">{t.name}</p>
                      <p className="text-[11px] text-muted m-0">{owner ? `GM: ${owner.playerName || owner.email}` : 'No GM assigned yet'}</p>
                    </div>
                  </div>
                  {t.proxy_email ? (
                    <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-line mt-1.5">
                      <p className="text-[11px] m-0" style={{ color: '#0c447c' }}>
                        Proxy: {proxyPlayer?.full_name || t.proxy_email}
                        {proxyPlayer?.team_id && proxyPlayer.team_id !== t.id ? ` (drafted on ${teamsById[proxyPlayer.team_id]?.name})` : ''}
                      </p>
                      <button
                        onClick={() => handleClearProxy(t.id)}
                        disabled={clearingProxyTeamId === t.id}
                        className="text-[11px] font-medium rounded-md px-2 py-1 flex-shrink-0"
                        style={{ background: '#fcebeb', color: '#791f1f' }}
                      >
                        {clearingProxyTeamId === t.id ? '…' : 'Clear proxy'}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 pt-1.5 border-t border-line mt-1.5">
                      <select
                        value={proxySelections[t.id] || ''}
                        onChange={(e) => setProxySelections((s) => ({ ...s, [t.id]: e.target.value }))}
                        className="flex-1 text-xs"
                      >
                        <option value="">Set a proxy…</option>
                        {sortedActivePlayers
                          .filter((p) => p.email?.toLowerCase() !== owner?.email?.toLowerCase())
                          .map((p) => (
                            <option key={p.email} value={p.email}>
                              {p.full_name}
                              {p.team_id && p.team_id !== t.id ? ` (${teamsById[p.team_id]?.name})` : ''}
                            </option>
                          ))}
                      </select>
                      <button
                        onClick={() => handleSetProxy(t.id)}
                        disabled={!proxySelections[t.id] || settingProxyTeamId === t.id}
                        className="btn-primary text-xs flex-shrink-0"
                      >
                        {settingProxyTeamId === t.id ? '…' : 'Set'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </>
          )}
        </div>
        <div className="bg-surface rounded-xl p-4 mb-5">
          <button onClick={() => toggleSection('profile-edit-lock')} className="w-full flex items-center justify-between">
            <p className="text-sm font-medium text-ink m-0">Profile edit lock</p>
            <i className={`ti ti-chevron-${openSections['profile-edit-lock'] ? 'up' : 'down'} text-base text-muted`} aria-hidden="true" />
          </button>
          {openSections['profile-edit-lock'] && (
          <>
          <p className="text-xs text-muted mb-3">
            Profiles normally lock 2 hours before the draft and stay locked once it's complete. Override this to let
            everyone edit their profile again.
          </p>
          <button onClick={handleToggleUnlock} disabled={savingUnlock} className="btn-secondary text-xs w-full">
            {savingUnlock
              ? 'Saving…'
              : settings?.profile_edits_unlocked_override
              ? 'Re-lock profile edits'
              : 'Unlock profile edits'}
          </button>
          </>
          )}
        </div>
        <div className="bg-surface rounded-xl p-4">
          <button onClick={() => toggleSection('reset-a-player-s-password')} className="w-full flex items-center justify-between">
            <p className="text-sm font-medium text-ink m-0">Reset a player's password</p>
            <i className={`ti ti-chevron-${openSections['reset-a-player-s-password'] ? 'up' : 'down'} text-base text-muted`} aria-hidden="true" />
          </button>
          {openSections['reset-a-player-s-password'] && (
          <>
          <p className="text-xs text-muted mb-3">
            Resets their password back to the default (draft2026). They'll need to log in and set a new one from their
            profile.
          </p>

          {resetMessage && (
            <div
              className="rounded-md px-3 py-2 mb-3 text-xs"
              style={{
                background: resetMessage.type === 'error' ? '#fcebeb' : '#eaf3de',
                color: resetMessage.type === 'error' ? '#791f1f' : '#27500a',
              }}
            >
              {resetMessage.text}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              placeholder="player@email.com"
              className="flex-1 text-xs"
            />
            <button
              onClick={handleResetPassword}
              disabled={!resetEmail || resettingPassword}
              className="btn-primary text-xs flex-shrink-0"
            >
              {resettingPassword ? 'Resetting…' : 'Reset password'}
            </button>
          </div>
          </>
          )}
        </div>
      </div>
    </main>
  );
}
