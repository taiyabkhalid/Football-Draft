'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import FootballIcon from '../../lib/FootballIcon';
import { getRound } from '../../lib/draftLogic';

const th = { textAlign: 'left', padding: '5px 8px', color: '#5a6b7d', fontWeight: 500 };
const td = { padding: '5px 8px' };

function PrintContent() {
  const params = useSearchParams();
  const type = params.get('type'); // 'team' | 'all' | 'draft'
  const teamId = params.get('teamId');

  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [numTeams, setNumTeams] = useState(0);
  const [contactsByPlayerId, setContactsByPlayerId] = useState({});
  const [emailToName, setEmailToName] = useState({});
  const [viewerRole, setViewerRole] = useState(null);
  const [viewerTeamId, setViewerTeamId] = useState(null);

  useEffect(() => {
    async function fetchAll() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const [teamsRes, playersRes, profilesRes, settingsRes, emailMatchRes] = await Promise.all([
        supabase.from('teams').select('*').order('name', { ascending: true }),
        supabase
          .from('players')
          .select(
            'id, full_name, headshot_url, offensive_position, defensive_position, position_preference, height_feet, height_inches, gender, previous_team, injury_status, weeks_until_recovered, game_time_unavailable, unavailable_mondays, call_on_draft_night, enjoys_pub, is_gm, team_id, draft_pick_number, is_active, created_at'
          )
          .eq('is_active', true),
        supabase.from('profiles').select('role, team_id, email'),
        supabase.from('draft_settings').select('num_teams').eq('id', 1).single(),
        // Separate, narrow query just for matching a profile's email to a
        // player's name (needed to display "GM: {name}") - kept apart from
        // the main roster fetch specifically so phone never rides along
        // with it.
        supabase.from('players').select('email, full_name'),
      ]);
      setTeams(teamsRes.data || []);
      setPlayers(playersRes.data || []);
      setProfiles(profilesRes.data || []);
      setNumTeams(settingsRes.data?.num_teams || (teamsRes.data || []).length);
      setEmailToName(Object.fromEntries((emailMatchRes.data || []).map((p) => [p.email, p.full_name])));

      if (user) {
        const myProfile = (profilesRes.data || []).find((p) => p.email?.toLowerCase() === user.email?.toLowerCase());
        setViewerRole(myProfile?.role || null);
        setViewerTeamId(myProfile?.team_id || null);

        // Contact info (phone/email) only ever comes back through this
        // restricted function, which itself checks the viewer is actually
        // authorized for whatever team_id is requested - the commissioner
        // can request every team at once (teamId param is 'all' or absent
        // with no specific team), anyone else only their own team, and it
        // simply returns nothing at all if they're not authorized rather
        // than erroring the whole page.
        const contactTeamId = myProfile?.role === 'commissioner' ? null : myProfile?.team_id || teamId;
        if (myProfile?.role === 'commissioner' || contactTeamId) {
          try {
            const { data: contactsRes } = await supabase.rpc('get_team_contacts', { p_team_id: contactTeamId });
            const byId = {};
            (contactsRes || []).forEach((c) => {
              byId[c.player_id] = { phone: c.phone, email: c.email };
            });
            setContactsByPlayerId(byId);
          } catch (e) {
            // Not authorized for this particular team - the roster/draft
            // info still renders fine, just without a contacts section.
          }
        }
      }

      setLoading(false);
    }
    fetchAll();
  }, [teamId]);

  if (loading) {
    return <p style={{ padding: 24, fontFamily: 'sans-serif' }}>Loading…</p>;
  }

  const teamsById = Object.fromEntries(teams.map((t) => [t.id, t]));
  const ownerByTeamId = Object.fromEntries(
    profiles
      .filter((p) => p.team_id)
      .map((p) => [p.team_id, emailToName[p.email] || p.email])
  );

  function rosterFor(team) {
    return players
      .filter((p) => p.team_id === team.id && p.draft_pick_number)
      .sort((a, b) => a.draft_pick_number - b.draft_pick_number);
  }

  function TeamSection({ team, breakBefore }) {
    const roster = rosterFor(team);
    const femaleCount = roster.filter((p) => p.gender === 'F').length;
    return (
      <div style={{ marginBottom: 24, pageBreakBefore: breakBefore ? 'always' : 'auto' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            paddingBottom: 10,
            borderBottom: `2px solid ${team.team_color || '#185fa5'}`,
            marginBottom: 10,
          }}
        >
          <FootballIcon color={team.team_color || '#0074ff'} size={18} />
          <div>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#0c2340', margin: 0 }}>{team.name}</p>
            <p style={{ fontSize: 11, color: '#5a6b7d', margin: 0 }}>
              GM: {ownerByTeamId[team.id] || 'Unassigned'} &middot; {roster.length} players &middot; {femaleCount} female
            </p>
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={th}>Overall Pick#</th>
              <th style={th}>Player</th>
              <th style={th}>Position (Off/Def)</th>
              <th style={th}>Gender</th>
              <th style={th}>Height</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((p) => (
              <tr key={p.id} style={{ borderTop: '1px solid #eef0f2' }}>
                <td style={td}>{p.draft_pick_number}</td>
                <td style={td}>{p.full_name}</td>
                <td style={td}>
                  {p.offensive_position} / {p.defensive_position}
                </td>
                <td style={td}>{p.gender}</td>
                <td style={td}>
                  {p.height_feet}'{p.height_inches}"
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {roster.some((p) => contactsByPlayerId[p.id]) && (
          <div style={{ marginTop: 14 }}>
            <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#8b97a3', margin: '0 0 6px' }}>
              Team Contacts
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={th}>Player</th>
                  <th style={th}>Phone</th>
                  <th style={th}>Email</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((p) => (
                  <tr key={p.id} style={{ borderTop: '1px solid #eef0f2' }}>
                    <td style={td}>{p.full_name}</td>
                    <td style={td}>{contactsByPlayerId[p.id]?.phone || '\u2014'}</td>
                    <td style={td}>{contactsByPlayerId[p.id]?.email || '\u2014'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  function DraftOrderTable() {
    const allDrafted = players
      .filter((p) => p.draft_pick_number)
      .sort((a, b) => a.draft_pick_number - b.draft_pick_number);
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            <th style={th}>Overall Pick#</th>
            <th style={th}>Round</th>
            <th style={th}>Player</th>
            <th style={th}>Position (Off/Def)</th>
            <th style={th}>Gender</th>
            <th style={th}>Team</th>
            <th style={th}>GM</th>
          </tr>
        </thead>
        <tbody>
          {allDrafted.map((p) => (
            <tr key={p.id} style={{ borderTop: '1px solid #eef0f2' }}>
              <td style={td}>{p.draft_pick_number}</td>
              <td style={td}>{getRound(p.draft_pick_number, numTeams)}</td>
              <td style={td}>{p.full_name}</td>
              <td style={td}>
                {p.offensive_position} / {p.defensive_position}
              </td>
              <td style={td}>{p.gender}</td>
              <td style={td}>{teamsById[p.team_id]?.name || ''}</td>
              <td style={td}>{ownerByTeamId[p.team_id] || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  let title = 'Draft results';
  let body = null;

  if (type === 'team') {
    const team = teamsById[teamId];
    title = team ? `${team.name} roster` : 'Team roster';
    body = team ? <TeamSection team={team} /> : <p>Team not found.</p>;
  } else if (type === 'all') {
    title = 'All team rosters';
    body = teams.map((t, i) => <TeamSection key={t.id} team={t} breakBefore={i > 0} />);
  } else if (type === 'draft') {
    title = 'Full draft order';
    body = <DraftOrderTable />;
  } else {
    body = <p>Nothing to print — check the link you used to get here.</p>;
  }

  return (
    <div style={{ fontFamily: 'sans-serif', color: '#0c2340', maxWidth: 850, margin: '0 auto', padding: 24 }}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: '#5a6b7d', margin: 0 }}>Use your browser's print dialog (Ctrl/Cmd+P) to print or save as PDF.</p>
        <button
          onClick={() => window.print()}
          style={{ fontSize: 13, fontWeight: 600, padding: '8px 16px', background: '#185fa5', color: '#fff', border: 'none', borderRadius: 6 }}
        >
          Print
        </button>
      </div>
      <h1 style={{ fontSize: 18, margin: '0 0 16px' }}>{title}</h1>
      {body}
      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}

export default function PrintPage() {
  return (
    <Suspense fallback={<p style={{ padding: 24, fontFamily: 'sans-serif' }}>Loading…</p>}>
      <PrintContent />
    </Suspense>
  );
}
