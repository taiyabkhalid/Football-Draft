'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import BrandHeader from '../../lib/BrandHeader';
import FootballIcon, { TEAM_COLORS } from '../../lib/FootballIcon';
import PrintRosterButton from '../../lib/PrintRosterButton';

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [player, setPlayer] = useState(null);
  const [team, setTeam] = useState(null);
  const [allTeams, setAllTeams] = useState([]);
  const [proxyTeamId, setProxyTeamId] = useState(null);
  const [proxyTeams, setProxyTeams] = useState([]);
  const [settings, setSettings] = useState(null);
  const [role, setRole] = useState(null);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);
  const [savingDarkMode, setSavingDarkMode] = useState(false);
  const [teamNameDraft, setTeamNameDraft] = useState('');
  const [teamColorDraft, setTeamColorDraft] = useState('var(--df-accent-secondary)');

  const [gmContact, setGmContact] = useState(null);
  const [showWatchDraftModal, setShowWatchDraftModal] = useState(false);
  const [myArchivedDrafts, setMyArchivedDrafts] = useState([]);
  const [selectedArchivedDraftId, setSelectedArchivedDraftId] = useState('');

  useEffect(() => {
    async function loadArchivedDrafts() {
      const { data, error } = await supabase.rpc('get_my_archived_drafts');
      if (!error) setMyArchivedDrafts(data || []);
    }
    loadArchivedDrafts();
  }, []);

  useEffect(() => {
    if (!team || settings?.draft_status !== 'completed') {
      setGmContact(null);
      return;
    }
    async function fetchGmContact() {
      const { data, error } = await supabase.rpc('get_my_gm_contact');
      if (error) {
        supabase
          .from('debug_logs')
          .insert({
            category: 'contacts',
            message: 'profile.js get_my_gm_contact FAILED',
            data: { errorMessage: error.message, errorCode: error.code, errorDetails: error.details, errorHint: error.hint },
            user_agent: navigator.userAgent,
          })
          .then(() => {})
          .catch(() => {});
        console.error('[contacts] get_my_gm_contact failed:', error.message);
        setGmContact(null);
        return;
      }
      supabase
        .from('debug_logs')
        .insert({
          category: 'contacts',
          message: 'profile.js get_my_gm_contact result',
          data: { rowCount: (data || []).length, firstRow: data?.[0] || null },
          user_agent: navigator.userAgent,
        })
        .then(() => {})
        .catch(() => {});
      setGmContact(data?.[0] || null);
    }
    fetchGmContact();
  }, [team, settings?.draft_status]);
  const [savingTeamName, setSavingTeamName] = useState(false);

  const [securityOpen, setSecurityOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState(null);

  const loadProfile = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push('/login');
      return;
    }

    const [{ data: playerRow }, { data: settingsRow }, { data: profileRow }, { data: allTeamsRow }] = await Promise.all([
      supabase.from('players').select('*').eq('email', user.email).single(),
      supabase.from('draft_settings').select('*').eq('id', 1).single(),
      supabase.from('profiles').select('role, team_id, dark_mode_enabled').eq('id', user.id).maybeSingle(),
      supabase.from('teams').select('id, name, proxy_email'),
    ]);

    if (!playerRow) {
      router.push('/login');
      return;
    }

    setPlayer(playerRow);
    setSettings(settingsRow);
    setRole(profileRow?.role || null);
    setDarkModeEnabled(Boolean(profileRow?.dark_mode_enabled));

    // A non-GM player can be designated as a draft-day proxy for a team -
    // they need the same "go draft" access as an actual GM would, even
    // though their role is just "player".
    const myEmailLower = user.email?.toLowerCase() || '';
    const proxyTeam = (allTeamsRow || []).find((t) =>
      (t.proxy_email || '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .includes(myEmailLower)
    );
    setProxyTeamId(proxyTeam?.id || null);
    setProxyTeams(
      (allTeamsRow || []).filter((t) =>
        (t.proxy_email || '')
          .split(',')
          .map((e) => e.trim().toLowerCase())
          .includes(myEmailLower)
      )
    );

    if (settingsRow?.draft_status === 'completed') {
      setAllTeams(allTeamsRow || []);
    }

    const teamId = profileRow?.team_id || playerRow.team_id;
    if (teamId) {
      const { data: teamRow } = await supabase.from('teams').select('*').eq('id', teamId).single();
      setTeam(teamRow);
      setTeamNameDraft(teamRow?.name || '');
      setTeamColorDraft(teamRow?.team_color || 'var(--df-accent-secondary)');
    }

    setLoading(false);
  }, [router]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Live update: if this player gets drafted while they're viewing this
  // page, refresh automatically instead of requiring a manual reload.
  useEffect(() => {
    const channel = supabase
      .channel('profile-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, loadProfile)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draft_settings' }, loadProfile)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loadProfile]);

  async function saveTeamName() {
    if (!team) return;
    setSavingTeamName(true);
    await supabase
      .from('teams')
      .update({ name: teamNameDraft.trim(), team_color: teamColorDraft })
      .eq('id', team.id);
    setTeam((t) => ({ ...t, name: teamNameDraft.trim(), team_color: teamColorDraft }));
    setSavingTeamName(false);
  }

  async function handleToggleDarkMode() {
    const newValue = !darkModeEnabled;
    setSavingDarkMode(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').update({ dark_mode_enabled: newValue }).eq('id', user.id);
    }
    setDarkModeEnabled(newValue);
    setSavingDarkMode(false);
  }

  async function updatePassword() {
    setPasswordMessage(null);
    if (!newPassword || !confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'Enter your new password twice.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: "Those passwords don't match." });
      return;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPasswordMessage({ type: 'error', text: error.message });
    } else {
      setPasswordMessage({ type: 'success', text: 'Password updated.' });
      setNewPassword('');
      setConfirmPassword('');
    }
    setSavingPassword(false);
  }

  if (loading || !player) {
    return (
      <main data-theme={darkModeEnabled ? 'dark' : 'light'} style={{ background: 'var(--df-surface)', minHeight: '100vh', paddingBottom: 48 }}>
        <BrandHeader pageLabel="Your profile" />
        <p className="text-center text-muted text-sm p-10">Loading your profile…</p>
      </main>
    );
  }

  const draftStatus = settings?.draft_status || 'not_started';
  const draftDatetime = settings?.draft_datetime ? new Date(settings.draft_datetime) : null;

  // Locked if: commissioner hasn't overridden it open, AND
  // (the draft is currently happening, OR we're within 2 hours of the scheduled start)
  // Once the draft completes, profiles unlock automatically.
  const withinTwoHoursOfDraft =
    draftDatetime && Date.now() >= draftDatetime.getTime() - 2 * 60 * 60 * 1000;
  const locked =
    !settings?.profile_edits_unlocked_override &&
    (draftStatus === 'in_progress' || draftStatus === 'paused' || withinTwoHoursOfDraft);

  // Separate 30-minute threshold, matching the same timing the hamburger
  // menu's "Watch Draft" label switches at - this button's wording should
  // change at the same point, not just once the draft is technically live.
  const withinThirtyMinutesOfDraft =
    draftDatetime && Date.now() >= draftDatetime.getTime() - 30 * 60 * 1000;
  const showWatchWording =
    draftStatus === 'in_progress' || draftStatus === 'paused' || (draftStatus === 'not_started' && withinThirtyMinutesOfDraft);

  return (
    <main data-theme={darkModeEnabled ? 'dark' : 'light'} style={{ background: 'var(--df-surface)', minHeight: '100vh', paddingBottom: 48 }}>
      <BrandHeader pageLabel="Your profile" />

      {draftDatetime && (
        <div className="bg-royal-pale px-5 py-2.5 flex items-center gap-2">
          <i className="ti ti-calendar text-sm" style={{ color: 'var(--df-accent)' }} aria-hidden="true" />
          <p className="text-xs m-0" style={{ color: 'var(--df-accent)' }}>
            Draft night:{' '}
            {draftDatetime.toLocaleString('en-US', {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </p>
        </div>
      )}

      <div className="max-w-md mx-auto px-4 py-6">
        {(role === 'gm' || role === 'commissioner' || proxyTeamId) && (
          <Link
            href={draftStatus === 'completed' ? '/draft?focus=results' : '/draft?focus=selection'}
            className="block text-center mb-4"
            style={{
              background: draftStatus === 'completed' ? 'var(--df-accent)' : 'var(--df-error)',
              color: 'var(--df-surface)',
              fontWeight: 600,
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 13,
              textDecoration: 'none',
            }}
          >
            {draftStatus === 'completed' ? 'Draft Results' : 'Go to My Draft Room'}
          </Link>
        )}

        {role !== 'gm' && role !== 'commissioner' && !proxyTeamId && draftStatus === 'completed' && (
          <Link
            href="/live?focus=results"
            className="block text-center mb-4"
            style={{
              background: 'var(--df-accent)',
              color: 'var(--df-surface)',
              fontWeight: 600,
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 13,
              textDecoration: 'none',
            }}
          >
            Draft Results
          </Link>
        )}

        {team && (
          <Link
            href={role === 'gm' || role === 'commissioner' ? '/draft?focus=myteam' : '/live?focus=team'}
            className="btn-primary block text-center mb-3"
          >
            View My Team
          </Link>
        )}

        <div className="flex gap-3 items-start justify-between mb-4">
          <div className="flex gap-3 items-center min-w-0">
            {player.headshot_url ? (
              <img src={player.headshot_url} alt={player.full_name} className="w-14 h-14 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-surface flex items-center justify-center flex-shrink-0">
                <i className="ti ti-user text-faint text-3xl" aria-hidden="true" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-base font-medium text-ink m-0">{player.full_name}</p>
              <p className="text-xs text-muted m-0">
                {player.offensive_position} / {player.defensive_position} &middot; {player.height_feet}'
                {player.height_inches}" &middot; {player.gender}
              </p>
              {role === 'commissioner' && (
                <p className="text-[11px] font-medium m-0 mt-1" style={{ color: 'var(--df-accent)' }}>
                  Commish
                </p>
              )}
              {role === 'gm' && (
                <p className="text-[11px] font-medium m-0 mt-1" style={{ color: 'var(--df-accent)' }}>
                  General Manager
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 flex-shrink-0 items-stretch">
            {!locked && (
              <Link
                href="/register"
                className="text-xs font-medium"
                style={{
                  color: 'var(--df-accent)',
                  background: 'var(--df-info-bg)',
                  borderRadius: 6,
                  padding: '6px 10px',
                  whiteSpace: 'nowrap',
                  textDecoration: 'none',
                  width: 108,
                  textAlign: 'center',
                }}
              >
                Update profile
              </Link>
            )}
            {draftStatus === 'completed' && (
              <PrintRosterButton teams={allTeams} pinnedTeamId={team?.id} width={108} />
            )}
            {role === 'commissioner' && (
              <Link
                href="/commissioner"
                className="text-xs font-medium"
                style={{
                  color: 'var(--df-surface)',
                  background: 'var(--df-accent)',
                  borderRadius: 6,
                  padding: '6px 10px',
                  whiteSpace: 'nowrap',
                  textDecoration: 'none',
                  width: 108,
                  textAlign: 'center',
                }}
              >
                Commish Tools
              </Link>
            )}
          </div>
        </div>

        <div className="bg-surface rounded-lg p-3.5 mb-1.5">
          <p className="text-[10px] uppercase tracking-wide text-muted mb-1">Drafted by</p>
          {team ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <FootballIcon color={team.team_color || 'var(--df-accent-secondary)'} size={16} />
                <p className="text-sm font-medium text-ink m-0">{team.name}</p>
              </div>
              {gmContact && gmContact.email?.toLowerCase() !== player?.email?.toLowerCase() && (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs m-0" style={{ color: 'var(--df-text-secondary)' }}>GM: {gmContact.full_name}</p>
                  {gmContact.phone && (
                    <p className="text-xs m-0 flex items-center gap-1 flex-shrink-0" style={{ color: 'var(--df-text-secondary)' }}>
                      <i className="ti ti-phone text-xs" style={{ color: 'var(--df-text-faint)' }} aria-hidden="true" />
                      {gmContact.phone}
                    </p>
                  )}
                </div>
              )}
            </>
          ) : player?.is_active === false ? (
            <p className="text-xs text-faint m-0" style={{ fontStyle: 'italic' }}>
              You are not eligible to be drafted -{' '}
              <a href="https://wa.me/14045185304" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--df-accent)', fontStyle: 'normal' }}>
                Whatsapp the commissioner if this is wrong (+1 404 518 5304)
              </a>
              .
            </p>
          ) : (
            <p className="text-xs text-faint m-0" style={{ fontStyle: 'italic' }}>
              Not yet drafted
            </p>
          )}
          {proxyTeams.length > 0 && (
            <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--df-border)' }}>
              <p className="text-[10px] uppercase tracking-wide text-muted mb-1">Proxy for</p>
              {proxyTeams.map((t) => (
                <div key={t.id} className="flex items-center gap-2 mb-1">
                  <FootballIcon color={t.team_color || 'var(--df-accent-secondary)'} size={14} />
                  <p className="text-xs font-medium text-ink m-0">{t.name}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        {!team && draftStatus !== 'completed' && (
          <p className="text-[10px] text-faint mb-3 flex items-center gap-1">
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--df-success)', display: 'inline-block' }} />
            Updates automatically once you're picked
          </p>
        )}

        {(role === 'gm' || role === 'commissioner') && team && (
          <div className="bg-surface rounded-lg p-3.5 mb-3">
            <p className="text-[10px] uppercase tracking-wide text-muted mb-1">Your team name</p>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={teamNameDraft}
                onChange={(e) => setTeamNameDraft(e.target.value)}
                className="flex-1 text-xs"
              />
            </div>

            <p className="text-[10px] uppercase tracking-wide text-muted mb-2">Team color</p>
            <div className="flex gap-2 flex-wrap mb-3">
              {TEAM_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setTeamColorDraft(c.hex)}
                  aria-label={c.name}
                  className="rounded-full flex items-center justify-center"
                  style={{
                    width: 30,
                    height: 30,
                    background: 'var(--df-surface)',
                    border: teamColorDraft === c.hex ? `2px solid ${c.hex}` : '1px solid var(--df-border)',
                  }}
                >
                  <FootballIcon color={c.hex} size={16} />
                </button>
              ))}
            </div>

            <button
              onClick={saveTeamName}
              disabled={savingTeamName || (teamNameDraft.trim() === team.name && teamColorDraft === team.team_color)}
              className="btn-secondary text-xs w-full"
            >
              {savingTeamName ? 'Saving…' : 'Save'}
              </button>
          </div>
        )}

        {draftStatus === 'completed' && (
          <div className="bg-royal-pale rounded-lg p-3.5 mb-3">
            <p className="text-xs m-0" style={{ color: 'var(--df-accent)' }}>
              The draft has ended.{' '}
              {team ? `You're on ${team.name}.` : "You weren't drafted this season."}
            </p>
          </div>
        )}

        {locked && (
          <div className="bg-[var(--df-warning-bg)] rounded-lg p-3.5 mb-4 flex gap-2">
            <i className="ti ti-lock text-base flex-shrink-0" style={{ color: 'var(--df-warning-text)', marginTop: 1 }} aria-hidden="true" />
            <p className="text-xs m-0" style={{ color: 'var(--df-warning-text-strong)' }}>
              Profile updates are locked 2 hours before the draft. Contact the commissioner for any changes.
            </p>
          </div>
        )}

        {draftStatus !== 'completed' && (
          (role === 'gm' || role === 'commissioner' || proxyTeamId) ? (
            <button
              onClick={() => setShowWatchDraftModal(true)}
              className="btn-primary block text-center mb-4 w-full"
            >
              {showWatchWording ? (
                <>
                  Watch the live draft <i className="ti ti-arrow-right text-sm" aria-hidden="true" />
                </>
              ) : (
                'Enter Spectator Draft Room'
              )}
            </button>
          ) : (
            <Link href="/live" className="btn-primary block text-center mb-4">
              {showWatchWording ? (
                <>
                  Watch the live draft <i className="ti ti-arrow-right text-sm" aria-hidden="true" />
                </>
              ) : (
                'Enter Draft Room'
              )}
            </Link>
          )
        )}

        {showWatchDraftModal && (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(12,35,64,0.5)', zIndex: 200 }}
            className="flex items-center justify-center px-4"
            onClick={() => setShowWatchDraftModal(false)}
          >
            <div
              className="bg-df-surface rounded-xl p-5 df-modal-card"
              style={{ maxWidth: 340, width: '100%' }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-base font-semibold m-0 mb-2" style={{ color: 'var(--df-text-primary)' }}>
                Heads up
              </p>
              <p className="text-sm m-0 mb-4" style={{ color: 'var(--df-text-secondary)' }}>
                This is the Spectator Room for the draft. You can't make draft selections from here — you'll need to
                go to My Draft Room to make your picks.
              </p>
              <a
                href="/draft?focus=selection"
                onClick={(e) => {
                  e.preventDefault();
                  setShowWatchDraftModal(false);
                  router.push(`/draft?focus=selection&t=${Date.now()}`);
                }}
                className="block text-center mb-2"
                style={{
                  background: 'var(--df-accent)',
                  color: 'var(--df-surface)',
                  fontWeight: 600,
                  borderRadius: 8,
                  padding: '9px 14px',
                  fontSize: 13,
                  textDecoration: 'none',
                  cursor: 'pointer',
                }}
              >
                Go to My Draft Room instead?
              </a>
              <a
                href="/live"
                onClick={(e) => {
                  e.preventDefault();
                  setShowWatchDraftModal(false);
                  router.push(`/live?t=${Date.now()}`);
                }}
                className="block text-center"
                style={{
                  color: 'var(--df-text-muted)',
                  fontWeight: 500,
                  borderRadius: 8,
                  padding: '9px 14px',
                  fontSize: 13,
                  textDecoration: 'none',
                  cursor: 'pointer',
                }}
              >
                Continue to Spectator Room
              </a>
            </div>
          </div>
        )}

        {role === 'commissioner' && (
          <div className="rounded-lg border border-line px-3.5 py-3 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide m-0" style={{ color: 'var(--df-text-muted)' }}>
                  Dark Mode (GM Draft Page)
                </p>
                <p className="text-[11px] m-0 mt-1" style={{ color: 'var(--df-text-faint)' }}>
                  Applies only to the GM Draft page while this is being tested.
                </p>
              </div>
              <button
                onClick={handleToggleDarkMode}
                disabled={savingDarkMode}
                role="switch"
                aria-checked={darkModeEnabled}
                style={{
                  width: 44,
                  height: 24,
                  borderRadius: 12,
                  background: darkModeEnabled ? 'var(--df-accent)' : 'var(--df-border)',
                  border: 'none',
                  position: 'relative',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 2,
                    left: darkModeEnabled ? 22 : 2,
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: 'var(--df-surface)',
                    transition: 'left 0.15s ease',
                  }}
                />
              </button>
            </div>
          </div>
        )}

        {myArchivedDrafts.length > 0 && (
          <div className="rounded-lg border border-line px-3.5 py-3 mb-4">
            <p className="text-xs font-semibold uppercase tracking-wide m-0 mb-2" style={{ color: 'var(--df-text-muted)' }}>
              Past Draft Results
            </p>
            <select
              value={selectedArchivedDraftId}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedArchivedDraftId(id);
                if (id) router.push(`/archive/${id}`);
              }}
              className="w-full rounded-md px-2.5 py-2 text-[13px]"
              style={{ border: '1px solid var(--df-border)' }}
            >
              <option value="">Select a draft to view</option>
              {myArchivedDrafts.map((d) => (
                <option key={d.archived_draft_id} value={d.archived_draft_id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="rounded-lg border border-line px-3.5 py-3 mb-4">
          <button
            onClick={() => setSecurityOpen((o) => !o)}
            className="w-full flex items-center justify-between"
          >
            <p className="text-xs font-semibold uppercase tracking-wide m-0" style={{ color: 'var(--df-text-muted)' }}>
              Update My Password
            </p>
            <i className={`ti ti-chevron-${securityOpen ? 'up' : 'down'} text-base text-muted`} aria-hidden="true" />
          </button>

          {securityOpen && (
            <div className="mt-3">
              {passwordMessage && (
                <div
                  className="rounded-md px-3 py-2 mb-3 text-xs"
                  style={{
                    background: passwordMessage.type === 'error' ? 'var(--df-error-bg)' : 'var(--df-success-bg)',
                    color: passwordMessage.type === 'error' ? 'var(--df-error-text-strong)' : 'var(--df-success-text-strong)',
                  }}
                >
                  {passwordMessage.text}
                </div>
              )}
              <label className="field-label">New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="mb-3"
              />
              <label className="field-label">Confirm new password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                className="mb-3"
              />
              <button onClick={updatePassword} disabled={savingPassword} className="btn-primary w-full">
                {savingPassword ? 'Updating…' : 'Update password'}
              </button>
            </div>
          )}
        </div>

        <div className="border-t border-line my-3" />

        <Link href="/" className="block text-center text-sm" style={{ color: 'var(--df-text-muted)' }}>
          Not you? <span style={{ color: 'var(--df-accent)', fontWeight: 500 }}>Register or log in as someone else</span>
        </Link>
      </div>
    </main>
  );
}
