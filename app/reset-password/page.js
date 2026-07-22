'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import BrandHeader from '../../lib/BrandHeader';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [done, setDone] = useState(false);

  // Supabase reads the recovery token out of the URL automatically and
  // establishes a session for it - we just need to wait for that to happen
  // before letting the person set a new password.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage(null);
    if (!newPassword || !confirmPassword) {
      setMessage({ type: 'error', text: 'Enter your new password twice.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: "Those passwords don't match." });
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setMessage({ type: 'error', text: error.message });
      setSaving(false);
      return;
    }
    setDone(true);
    setSaving(false);
    setTimeout(() => router.push('/profile'), 1200);
  }

  return (
    <main style={{ minHeight: '100vh', background: '#ffffff' }}>
      <BrandHeader pageLabel="Set a new password" />
      <div className="max-w-md mx-auto px-4 py-8">
        {!ready ? (
          <p className="text-center text-muted text-sm p-10">Verifying your reset link…</p>
        ) : done ? (
          <div className="bg-[#eaf3de] rounded-md px-3 py-3 flex gap-2">
            <i className="ti ti-check text-base flex-shrink-0" style={{ color: '#27500a', marginTop: 1 }} aria-hidden="true" />
            <p className="text-xs m-0" style={{ color: '#27500a' }}>
              Password updated. Taking you to your profile…
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {message && (
              <div
                className="rounded-md px-3 py-2 mb-4 text-xs"
                style={{
                  background: message.type === 'error' ? '#fcebeb' : '#eaf3de',
                  color: message.type === 'error' ? '#791f1f' : '#27500a',
                }}
              >
                {message.text}
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
              className="mb-4"
            />
            <button type="submit" disabled={saving} className="btn-primary w-full">
              {saving ? 'Updating…' : 'Set new password'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
