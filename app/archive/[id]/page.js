'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import BrandHeader from '../../../lib/BrandHeader';

// Read-only view of a single archived draft's results. Contact info
// visibility (player_email / player_phone) is entirely decided by the
// get_archived_draft_details backend function - this page never applies
// its own filtering on top, since the function already returns null for
// any field this specific viewer isn't allowed to see.
export default function ArchivedDraftPage() {
  const params = useParams();
  const router = useRouter();
  const archivedDraftId = params?.id;

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [draftInfo, setDraftInfo] = useState(null);
  const [picks, setPicks] = useState([]);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);

  useEffect(() => {
    async function loadDarkModePreference() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').select('dark_mode_enabled').eq('id', user.id).maybeSingle();
      setDarkModeEnabled(Boolean(data?.dark_mode_enabled));
    }
    loadDarkModePreference();
  }, []);

  useEffect(() => {
    if (!archivedDraftId) return;

    async function load() {
      setLoading(true);
      setErrorMessage(null);

      const [infoRes, picksRes] = await Promise.all([
        supabase.from('archived_drafts').select('name, completed_at').eq('id', archivedDraftId).single(),
        supabase.rpc('get_archived_draft_details', { p_archived_draft_id: archivedDraftId }),
      ]);

      if (infoRes.error) {
        setErrorMessage("This draft couldn't be found, or you don't have access to view it.");
        setLoading(false);
        return;
      }
      if (picksRes.error) {
        setErrorMessage(picksRes.error.message);
        setLoading(false);
        return;
      }

      setDraftInfo(infoRes.data);
      setPicks(picksRes.data || []);
      setLoading(false);
    }

    load();
  }, [archivedDraftId]);

  return (
    <div
      data-theme={darkModeEnabled ? 'dark' : 'light'}
      className="max-w-6xl mx-auto px-4 pb-10"
      style={{ background: 'var(--df-surface)', minHeight: '100vh' }}
    >
      <BrandHeader />

      <div className="flex items-center justify-between mb-4 mt-2">
        <button onClick={() => router.push('/profile')} className="text-xs text-muted flex items-center gap-1">
          <i className="ti ti-arrow-left text-sm" aria-hidden="true" />
          Back to profile
        </button>
      </div>

      {loading && <p className="text-sm text-muted">Loading…</p>}

      {errorMessage && (
        <div className="rounded-md px-3 py-2 text-sm" style={{ background: 'var(--df-error-bg)', color: 'var(--df-error-text-strong)' }}>
          {errorMessage}
        </div>
      )}

      {!loading && !errorMessage && draftInfo && (
        <>
          <div className="rounded-lg border border-line px-3.5 py-3 mb-4">
            <p className="text-[15px] font-semibold m-0" style={{ color: 'var(--df-text-primary)' }}>
              {draftInfo.name}
            </p>
            <p className="text-xs m-0 mt-1" style={{ color: 'var(--df-text-muted)' }}>
              Completed{' '}
              {new Date(draftInfo.completed_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}{' '}
              · Full Draft Order
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="text-xs" style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1050 }}>
              <thead>
                <tr style={{ background: 'var(--df-surface-subtle)' }}>
                  <th className="text-left px-3 py-2" style={{ color: 'var(--df-text-muted)', minWidth: 55 }}>
                    Pick#
                  </th>
                  <th className="text-left px-3 py-2" style={{ color: 'var(--df-text-muted)', minWidth: 170 }}>
                    Player
                  </th>
                  <th className="text-left px-3 py-2" style={{ color: 'var(--df-text-muted)', minWidth: 70 }}>
                    Gender
                  </th>
                  <th className="text-left px-3 py-2" style={{ color: 'var(--df-text-muted)', minWidth: 110 }}>
                    Pos (Off/Def)
                  </th>
                  <th className="text-left px-3 py-2" style={{ color: 'var(--df-text-muted)', minWidth: 140 }}>
                    Team
                  </th>
                  <th className="text-left px-3 py-2" style={{ color: 'var(--df-text-muted)', minWidth: 150 }}>
                    GM
                  </th>
                  <th className="text-left px-3 py-2" style={{ color: 'var(--df-text-muted)', minWidth: 220 }}>
                    Email
                  </th>
                  <th className="text-left px-3 py-2" style={{ color: 'var(--df-text-muted)', minWidth: 130 }}>
                    Phone
                  </th>
                </tr>
              </thead>
              <tbody>
                {picks.map((p) => (
                  <tr key={p.pick_id} style={{ borderTop: '1px solid var(--df-border)' }}>
                    <td className="px-3 py-2" style={{ color: 'var(--df-text-primary)', whiteSpace: 'nowrap' }}>
                      {p.overall_pick_number ?? '—'}
                    </td>
                    <td className="px-3 py-2" style={{ color: 'var(--df-text-primary)', whiteSpace: 'nowrap' }}>
                      {p.player_full_name || (
                        <span style={{ fontStyle: 'italic', color: 'var(--df-text-faint)' }}>Skipped</span>
                      )}
                    </td>
                    <td className="px-3 py-2" style={{ color: 'var(--df-text-primary)', whiteSpace: 'nowrap' }}>
                      {p.gender || ''}
                    </td>
                    <td className="px-3 py-2" style={{ color: 'var(--df-text-primary)', whiteSpace: 'nowrap' }}>
                      {p.player_full_name ? `${p.offensive_position || ''} / ${p.defensive_position || ''}` : ''}
                    </td>
                    <td className="px-3 py-2" style={{ color: 'var(--df-accent)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {p.team_name}
                    </td>
                    <td className="px-3 py-2" style={{ color: 'var(--df-text-primary)', whiteSpace: 'nowrap' }}>
                      {p.gm_name || ''}
                    </td>
                    <td className="px-3 py-2" style={{ color: p.player_email ? 'var(--df-text-primary)' : 'var(--df-text-faint)', whiteSpace: 'nowrap' }}>
                      {p.player_email || <span style={{ fontStyle: 'italic' }}>—</span>}
                    </td>
                    <td className="px-3 py-2" style={{ color: p.player_phone ? 'var(--df-text-primary)' : 'var(--df-text-faint)', whiteSpace: 'nowrap' }}>
                      {p.player_phone || <span style={{ fontStyle: 'italic' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
