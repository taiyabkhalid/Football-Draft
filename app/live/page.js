'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { getRound, getTeamOnTheClock } from '../../lib/draftLogic';
import BrandHeader from '../../lib/BrandHeader';

export default function LiveDraftPage() {
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [picks, setPicks] = useState([]);
  const [settings, setSettings] = useState(null);
  const [viewingTeamId, setViewingTeamId] = useState(null);
  const [myTeamId, setMyTeamId] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const [teamsRes, playersRes, picksRes, settingsRes] = await Promise.all([
      supabase.from('teams').select('*').order('draft_position', { ascending: true }),
      supabase.from('players').select('*').eq('is_active', true),
      supabase.from('draft_picks').select('*').order('pick_number', { ascending: true }),
      supabase.from('draft_settings').select('*').eq('id', 1).single(),
    ]);
    setTeams(teamsRes.data || []);
    setPlayers(playersRes.data || []);
    setPicks(picksRes.data || []);
    setSettings(settingsRes.data || null);
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
  const teamOnClock = numTeams ? getTeamOnTheClock(currentPickNumber, numTeams, teams) : null;
  const teamNextOnClock = numTeams ? getTeamOnTheClock(currentPickNumber + 1, numTeams, teams) : null;
  const draftStatus = settings?.draft_status || 'not_started';

  const playersById = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);
  const teamsById = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams]);
  const previousPick = picks.length > 0 ? picks[picks.length - 1] : null;

  const next10 = useMemo(() => {
    if (!numTeams) return [];
    const list = [];
    for (let i = 1; i <= 10; i++) {
      const pickNum = currentPickNumber + i;
      list.push({ pickNumber: pickNum, team: getTeamOnTheClock(pickNum, numTeams, teams) });
    }
    return list;
  }, [currentPickNumber, numTeams, teams]);

  const rosterByTeam = useMemo(() => {
    const map = {};
    for (const t of teams) {
      const roster = players.filter((p) => p.team_id === t.id);
      map[t.id] = { players: roster, count: roster.length, femaleCount: roster.filter((p) => p.gender === 'F').length };
    }
    return map;
  }, [teams, players]);

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
      <BrandHeader pageLabel={draftStatus === 'completed' ? 'Draft results' : 'Live draft'} liveIndicator={draftStatus === 'in_progress'} />

      {draftStatus === 'in_progress' && (
        <>
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
            <div className="flex-1 rounded-lg p-3" style={{ background: '#185fa5' }}>
              <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: '#cfe2f5' }}>
                On the clock
              </p>
              <p className="text-[13px] font-semibold" style={{ color: '#ffffff' }}>
                {teamOnClock?.name || '—'}
              </p>
            </div>
            <div className="flex-1 bg-surface rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted mb-1">Next up</p>
              <p className="text-xs text-ink">{teamNextOnClock?.name || '—'}</p>
            </div>
          </div>

          <div className="px-4 sm:px-5 pt-3">
            <p className="text-[10px] uppercase tracking-wide text-muted mb-1">Next 10 picks</p>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {next10.map((n) => (
                <span key={n.pickNumber} className="flex-none text-xs px-2.5 py-1.5 rounded-md bg-surface text-muted whitespace-nowrap">
                  {n.team?.name || '—'}
                </span>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted px-4 sm:px-5 pt-1">
            Round {currentRound}, pick {currentPickNumber}
          </p>

          <div className="border-t border-line mx-4 sm:mx-5 mt-3" />
        </>
      )}

      {draftStatus === 'completed' && (
        <div className="bg-royal-pale mx-4 sm:mx-5 mt-4 rounded-lg p-3.5">
          <p className="text-sm m-0" style={{ color: '#0c447c' }}>
            The draft has ended. Final rosters are below.
          </p>
        </div>
      )}

      <div className="px-4 sm:px-5 pt-4">
        <p className="text-[10px] uppercase tracking-wide text-muted mb-2">Tap a team to view their picks</p>
        <div className="flex gap-2 flex-wrap mb-3">
          {teams.map((t) => (
            <button
              key={t.id}
              onClick={() => setViewingTeamId(viewingTeamId === t.id ? null : t.id)}
              className="text-xs px-2.5 py-1.5 rounded-md font-medium"
              style={{
                background: viewingTeamId === t.id ? '#185fa5' : t.id === myTeamId ? '#e6f1fb' : '#f1f3f6',
                color: viewingTeamId === t.id ? '#ffffff' : t.id === myTeamId ? '#0c447c' : '#3d4a57',
                border: t.id === myTeamId && viewingTeamId !== t.id ? '1px solid #185fa5' : 'none',
              }}
            >
              {t.name}
              {t.id === myTeamId ? ' (you)' : ''}
            </button>
          ))}
        </div>

        {viewingTeamId && rosterByTeam[viewingTeamId] && (
          <div className="bg-surface rounded-lg p-3.5 mb-4">
            <p className="text-sm font-medium text-ink mb-2">{teamsById[viewingTeamId]?.name}</p>
            {rosterByTeam[viewingTeamId].players.length === 0 ? (
              <p className="text-xs text-muted m-0">No picks yet.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {rosterByTeam[viewingTeamId].players.map((p) => (
                  <div key={p.id} className="flex justify-between text-xs bg-white rounded-md px-2.5 py-2">
                    <span className="text-ink">{p.full_name}</span>
                    <span className="text-muted">
                      {p.offensive_position} / {p.defensive_position} &middot; {p.gender}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
