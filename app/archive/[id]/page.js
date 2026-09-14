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
    <div className="max-w-3xl mx-auto px-4 pb-10">
      <BrandHeader />

      <div className="flex items-center justify-between mb-4 mt-2">
        <button onClick={() => router.push('/profile')} className="text-xs text-muted flex items-center gap-1">
          <i className="ti ti-arrow-left text-sm" aria-hidden="true" />
          Back to profile
        </button>
      </div>

      {loading && <p className="text-sm text-muted">Loading…</p>}

      {errorMessage && (
        <div className="rounded-md px-3 py-2 text-sm" style={{ background: '#fcebeb', color: '#791f1f' }}>
          {errorMessage}
        </div>
      )}

      {!loading && !errorMessage && draftInfo && (
        <>
          <div className="rounded-lg border border-line px-3.5 py-3 mb-4">
            <p className="text-[15px] font-semibold m-0" style={{ color: '#0c2340' }}>
              {draftInfo.name}
            </p>
            <p className="text-xs m-0 mt-1" style={{ color: '#5a6b7d' }}>
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
            <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f7f9fb' }}>
                  <th className="text-left px-2 py-1.5" style={{ color: '#5a6b7d' }}>
                    Pick#
                  </th>
                  <th className="text-left px-2 py-1.5" style={{ color: '#5a6b7d' }}>
                    Player
                  </th>
                  <th className="text-left px-2 py-1.5" style={{ color: '#5a6b7d' }}>
                    Gender
                  </th>
                  <th className="text-left px-2 py-1.5" style={{ color: '#5a6b7d' }}>
                    Pos (Off/Def)
                  </th>
                  <th className="text-left px-2 py-1.5" style={{ color: '#5a6b7d' }}>
                    Team
                  </th>
                  <th className="text-left px-2 py-1.5" style={{ color: '#5a6b7d' }}>
                    GM
                  </th>
                  <th className="text-left px-2 py-1.5" style={{ color: '#5a6b7d' }}>
                    Contact
                  </th>
                </tr>
              </thead>
              <tbody>
                {picks.map((p) => (
                  <tr key={p.pick_id} style={{ borderTop: '1px solid #eef1f4' }}>
                    <td className="px-2 py-1.5" style={{ color: '#0c2340' }}>
                      {p.overall_pick_number ?? '—'}
                    </td>
                    <td className="px-2 py-1.5" style={{ color: '#0c2340' }}>
                      {p.player_full_name || (
                        <span style={{ fontStyle: 'italic', color: '#8b97a3' }}>Skipped</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5" style={{ color: '#0c2340' }}>
                      {p.gender || ''}
                    </td>
                    <td className="px-2 py-1.5" style={{ color: '#0c2340' }}>
                      {p.player_full_name ? `${p.offensive_position || ''} / ${p.defensive_position || ''}` : ''}
                    </td>
                    <td className="px-2 py-1.5" style={{ color: '#185fa5', fontWeight: 600 }}>
                      {p.team_name}
                    </td>
                    <td className="px-2 py-1.5" style={{ color: '#0c2340' }}>
                      {p.gm_name || ''}
                    </td>
                    <td className="px-2 py-1.5" style={{ color: p.player_email || p.player_phone ? '#0c2340' : '#8b97a3' }}>
                      {p.player_email || p.player_phone ? (
                        <>
                          {p.player_email}
                          {p.player_email && p.player_phone ? ' · ' : ''}
                          {p.player_phone}
                        </>
                      ) : (
                        <span style={{ fontStyle: 'italic' }}>—</span>
                      )}
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
