'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import BrandHeader from '../../lib/BrandHeader';
import FootballIcon from '../../lib/FootballIcon';

export default function CommissionerToolsPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [profiles, setProfiles] = useState([]);

  const [selectedEmail, setSelectedEmail] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [promoting, setPromoting] = useState(false);
  const [message, setMessage] = useState(null);

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
    const [playersRes, teamsRes, profilesRes] = await Promise.all([
      supabase.from('players').select('*').eq('is_active', true),
      supabase.from('teams').select('*').order('name', { ascending: true }),
      supabase.from('profiles').select('role, team_id, email'),
    ]);
    setPlayers(playersRes.data || []);
    setTeams(teamsRes.data || []);
    setProfiles(profilesRes.data || []);
  }, []);

  useEffect(() => {
    if (checked) fetchData();
  }, [checked, fetchData]);

  const gmEmails = new Set(profiles.filter((p) => p.team_id).map((p) => p.email));
  const availableToPromote = players.filter((p) => !p.team_id && !gmEmails.has(p.email));

  const teamsById = Object.fromEntries(teams.map((t) => [t.id, t]));
  const playersByEmail = Object.fromEntries(players.map((p) => [p.email, p]));
  const currentGMs = profiles
    .filter((p) => p.team_id)
    .map((p) => ({
      ...p,
      teamName: teamsById[p.team_id]?.name,
      playerName: playersByEmail[p.email]?.full_name,
    }));

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

        <div className="bg-surface rounded-xl p-4">
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
      </div>
    </main>
  );
}
