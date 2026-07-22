'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import BrandHeader from '../../lib/BrandHeader';

export default function PlayerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSending, setResetSending] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Arriving from the landing page's "Forgot your password?" link
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('forgot') === '1') setForgotMode(true);
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError) {
      setError('That email/password combination was not recognized. Make sure you\'ve registered first.');
      setLoading(false);
      return;
    }

    router.push('/profile');
  }

  async function handleSendReset(e) {
    e.preventDefault();
    setResetSending(true);
    await supabase.auth.resetPasswordForEmail(resetEmail.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    // Always show the same message, regardless of whether the email is
    // actually registered - this avoids letting the form be used to
    // check who has an account.
    setResetSent(true);
    setResetSending(false);
  }

  if (forgotMode) {
    return (
      <main style={{ minHeight: '100vh', background: '#ffffff' }}>
        <BrandHeader pageLabel="Reset your password" />
        <div className="max-w-md mx-auto px-4 py-8">
          {resetSent ? (
            <div className="bg-[#eaf3de] rounded-md px-3 py-3 flex gap-2">
              <i className="ti ti-check text-base flex-shrink-0" style={{ color: '#27500a', marginTop: 1 }} aria-hidden="true" />
              <p className="text-xs m-0" style={{ color: '#27500a' }}>
                If that email is registered, a reset link is on its way.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSendReset}>
              <p className="text-sm text-muted mb-4">Enter your email and we'll send you a reset link.</p>
              <label className="field-label">Email</label>
              <input
                type="email"
                required
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="you@email.com"
                className="mb-4"
              />
              <button type="submit" disabled={resetSending} className="btn-primary w-full">
                {resetSending ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          )}

          <button
            onClick={() => {
              setForgotMode(false);
              setResetSent(false);
            }}
            className="block w-full text-center text-sm font-medium mt-4"
            style={{ color: '#185fa5' }}
          >
            Back to log in
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh', background: '#ffffff' }}>
      <BrandHeader pageLabel="Log in" />
      <div className="max-w-md mx-auto px-4 py-8">
        <form onSubmit={handleLogin}>
          {error && (
            <div className="bg-danger/10 rounded-md px-3 py-2 mb-4">
              <p className="text-xs text-danger m-0">{error}</p>
            </div>
          )}

          <label className="field-label">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="mb-3"
          />

          <label className="field-label">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="draft2026"
            className="mb-1"
          />
          <p className="text-[11px] text-faint mb-1">
            New players: use draft2026 the first time, then set your own password from your profile page.
          </p>
          <button
            type="button"
            onClick={() => setForgotMode(true)}
            className="block text-right text-xs font-medium mb-4 ml-auto"
            style={{ color: '#185fa5' }}
          >
            Forgot password?
          </button>

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Signing in…' : 'Log in'}
          </button>
        </form>
      </div>
    </main>
  );
}
