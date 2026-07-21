'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import BrandHeader from '../../lib/BrandHeader';

export default function CommissionerToolsPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

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
      <div className="max-w-md mx-auto px-4 py-10">
        <div className="bg-surface rounded-lg p-4">
          <p className="text-sm font-medium text-ink mb-2">Coming soon</p>
          <p className="text-xs text-muted mb-3">This page will let you:</p>
          <ul className="text-xs text-muted list-disc list-inside space-y-1">
            <li>Set the number of teams</li>
            <li>Promote a registered player to GM, and assign them a team</li>
            <li>Set the pick clock duration and draft order method</li>
            <li>Start, pause, or randomize the draft order</li>
            <li>Remove a player from the pool</li>
            <li>Unlock profile editing early</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
