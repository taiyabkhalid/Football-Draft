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

  const [savingUnlock, setSavingUnlock] = useState(false);

  const [resetEmail, setResetEmail] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetMessage, setResetMessage] = useState(null);

  const [playerPoolFilter, setPlayerPoolFilter] = useState('active');
  const [togglingPlayerId, setTogglingPlayerId] = useState(null);

  useEffect(() => {
    async function checkAccess() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
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

  const gmEmails = new Set(profiles.filter((p) => p.team_id).map((p) => p.email));
  const availableToPromote = players.filter((p) => p.is_active && !p.team_id && !gmEmails.has(p.email));

  const teamsById = Object.fromEntries(teams.map((t) => [t.id, t]));
  const playersByEmail = Object.fromEntries(players.map((p) => [p.email, p]));
  const currentGMs = profiles
    .filter((p) => p.team_id)
    .map((p) => ({
      ...p,
      teamName: teamsById[p.team_id]?.name,
      playerName: playersByEmail[p.email]?.full_name,
    }));

  const draftStatus = settings?.draft_status || 'not_started';
  const draftLocked = draftStatus !== 'not_started';

  const playerPool = useMemo(() => {
    const list = playerPoolFilter === 'active' ? players.filter((p) => p.is_active) : players.filter((p) => !p.is_active);
    return list.slice().sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [players, playerPoolFilter]);

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
    const { error } = await supabase
      .from('draft_settings')
      .update({ draft_status: 'in_progress', current_pick_started_at: new Date().toISOString() })
      .eq('id', 1)
      .eq('draft_status', 'not_started');
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
          <p className="text-sm font-medium text-ink mb-1">Draft format and schedule</p>
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
        </div>

        {/* Draft order */}
        <div className="bg-surface rounded-xl p-4 mb-5">
          <p className="text-sm font-medium text-ink mb-1">Draft order</p>
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
        </div>

        {/* Start controls */}
        <div className="bg-surface rounded-xl p-4 mb-5">
          <p className="text-sm font-medium text-ink mb-1">Start the draft</p>
          <p className="text-xs text-muted mb-3">
            {draftStatus === 'not_started' && 'The draft will start automatically at the scheduled time above, or you can start it early.'}
            {draftStatus === 'in_progress' && 'The draft is currently live.'}
            {draftStatus === 'completed' && 'The draft has finished.'}
          </p>

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
            <button onClick={handleStartNow} disabled={startingNow} className="btn-primary text-xs w-full">
              {startingNow ? 'Starting…' : 'Start draft now'}
            </button>
          )}
        </div>

        {/* Player pool management */}
        <div className="bg-surface rounded-xl p-4 mb-5">
          <p className="text-sm font-medium text-ink mb-1">Player pool</p>
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

          <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
            {playerPool.length === 0 && (
              <p className="text-xs text-muted">No {playerPoolFilter} players.</p>
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
        </div>

        {/* Assign a GM */}
        <div className="bg-surface rounded-xl p-4 mb-5">
          <p className="text-sm font-medium text-ink mb-1">Assign a GM</p>
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
              {teams.map((t) => (
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

          {availableToPromote.length === 0 && (
            <p className="text-[11px] text-faint mt-2">
              No unassigned registered players available right now — they'll appear here once they register.
            </p>
          )}
        </div>

        <div className="bg-surface rounded-xl p-4 mb-5">
          <p className="text-sm font-medium text-ink mb-3">Current GM / commissioner assignments</p>
          {currentGMs.length === 0 ? (
            <p className="text-xs text-muted">No one assigned yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {currentGMs.map((g) => (
                <div key={g.email} className="flex items-center justify-between bg-white rounded-md px-3 py-2">
                  <div className="flex items-center gap-2">
                    <FootballIcon color={teamsById[g.team_id]?.team_color || '#0074ff'} size={14} />
                    <span className="text-xs text-ink">{teamsById[g.team_id]?.name}</span>
                  </div>
                  <span className="text-xs text-muted flex items-center gap-1">
                    <i className={g.role === 'commissioner' ? 'ti ti-star-filled' : 'ti ti-star'} aria-hidden="true" />
                    {g.playerName || g.email}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Profile edit unlock */}
        <div className="bg-surface rounded-xl p-4 mb-5">
          <p className="text-sm font-medium text-ink mb-1">Profile edit lock</p>
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
        </div>

        {/* Reset a player's password */}
        <div className="bg-surface rounded-xl p-4">
          <p className="text-sm font-medium text-ink mb-1">Reset a player's password</p>
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
        </div>
      </div>
    </main>
  );
}
