'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import BrandHeader from '../../lib/BrandHeader';
import FootballIcon, { TEAM_COLORS } from '../../lib/FootballIcon';

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [player, setPlayer] = useState(null);
  const [team, setTeam] = useState(null);
  const [settings, setSettings] = useState(null);
  const [role, setRole] = useState(null);
  const [teamNameDraft, setTeamNameDraft] = useState('');
  const [teamColorDraft, setTeamColorDraft] = useState('#0074ff');
  const [savingTeamName, setSavingTeamName] = useState(false);

  const loadProfile = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push('/login');
      return;
    }

    const [{ data: playerRow }, { data: settingsRow }, { data: profileRow }] = await Promise.all([
      supabase.from('players').select('*').eq('email', user.email).single(),
      supabase.from('draft_settings').select('*').eq('id', 1).single(),
      supabase.from('profiles').select('role, team_id').eq('id', user.id).maybeSingle(),
    ]);

    if (!playerRow) {
      router.push('/login');
      return;
    }

    setPlayer(playerRow);
    setSettings(settingsRow);
    setRole(profileRow?.role || null);

    const teamId = profileRow?.team_id || playerRow.team_id;
    if (teamId) {
      const { data: teamRow } = await supabase.from('teams').select('*').eq('id', teamId).single();
      setTeam(teamRow);
      setTeamNameDraft(teamRow?.name || '');
      setTeamColorDraft(teamRow?.team_color || '#0074ff');
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

  if (loading || !player) {
    return (
      <main style={{ background: '#ffffff', minHeight: '100vh' }}>
        <BrandHeader pageLabel="Your profile" />
        <p className="text-center text-muted text-sm p-10">Loading your profile…</p>
      </main>
    );
  }

  const draftStatus = settings?.draft_status || 'not_started';
  const draftDatetime = settings?.draft_datetime ? new Date(settings.draft_datetime) : null;

  // Locked if: commissioner hasn't overridden it open, AND
  // (the draft has already ended, OR we're within 2 hours of the scheduled start)
  const withinTwoHoursOfDraft =
    draftDatetime && Date.now() >= draftDatetime.getTime() - 2 * 60 * 60 * 1000;
  const locked =
    !settings?.profile_edits_unlocked_override && (draftStatus === 'completed' || withinTwoHoursOfDraft);

  return (
    <main style={{ background: '#ffffff', minHeight: '100vh' }}>
      <BrandHeader pageLabel="Your profile" />

      {draftDatetime && (
        <div className="bg-royal-pale px-5 py-2.5 flex items-center gap-2">
          <i className="ti ti-calendar text-sm" style={{ color: '#0c447c' }} aria-hidden="true" />
          <p className="text-xs m-0" style={{ color: '#0c447c' }}>
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
        <div className="flex gap-3 items-center mb-4">
          {player.headshot_url ? (
            <img src={player.headshot_url} alt={player.full_name} className="w-14 h-14 rounded-full object-cover" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-surface flex items-center justify-center flex-shrink-0">
              <i className="ti ti-user text-faint text-3xl" aria-hidden="true" />
            </div>
          )}
          <div>
            <p className="text-base font-medium text-ink m-0">{player.full_name}</p>
            <p className="text-xs text-muted m-0">
              {player.offensive_position} / {player.defensive_position} &middot; {player.height_feet}'
              {player.height_inches}" &middot; {player.gender}
            </p>
            {role === 'commissioner' && (
              <p className="text-[11px] font-medium m-0 mt-1 flex items-center gap-1" style={{ color: '#185fa5' }}>
                <i className="ti ti-star-filled text-sm" aria-hidden="true" /> Commish
              </p>
            )}
            {role === 'gm' && (
              <p className="text-[11px] font-medium m-0 mt-1 flex items-center gap-1" style={{ color: '#185fa5' }}>
                <i className="ti ti-star text-sm" aria-hidden="true" /> General Manager
              </p>
            )}
          </div>
        </div>

        <div className="bg-surface rounded-lg p-3.5 mb-1.5">
          <p className="text-[10px] uppercase tracking-wide text-muted mb-1">Drafted by</p>
          {team ? (
            <p className="text-sm font-medium text-ink m-0">{team.name}</p>
          ) : (
            <p className="text-xs text-faint m-0" style={{ fontStyle: 'italic' }}>
              Not yet drafted
            </p>
          )}
        </div>
        {!team && draftStatus !== 'completed' && (
          <p className="text-[10px] text-faint mb-3 flex items-center gap-1">
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#639922', display: 'inline-block' }} />
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
                    background: '#ffffff',
                    border: teamColorDraft === c.hex ? `2px solid ${c.hex}` : '1px solid #d8dde2',
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
            <p className="text-xs m-0" style={{ color: '#0c447c' }}>
              The draft has ended.{' '}
              {team ? `You're on ${team.name}.` : "You weren't drafted this season."}
            </p>
          </div>
        )}

        {locked ? (
          <div className="bg-[#faeeda] rounded-lg p-3.5 mb-4 flex gap-2">
            <i className="ti ti-lock text-base flex-shrink-0" style={{ color: '#854f0b', marginTop: 1 }} aria-hidden="true" />
            <p className="text-xs m-0" style={{ color: '#633806' }}>
              Profile updates are locked 2 hours before the draft. Contact the commissioner for any changes.
            </p>
          </div>
        ) : (
          <Link href="/register" className="btn-secondary block text-center mb-4">
            Update your profile
          </Link>
        )}

        {team && (
          <Link href="/live?focus=team" className="btn-primary block text-center mb-3">
            View My Team
          </Link>
        )}

        <Link href="/live" className="block text-center text-sm font-medium" style={{ color: '#185fa5' }}>
          Watch the live draft <i className="ti ti-arrow-right text-sm" aria-hidden="true" />
        </Link>
      </div>
    </main>
  );
}
