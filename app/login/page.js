'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import BrandHeader from '../../lib/BrandHeader';

export default function PlayerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <main style={{ minHeight: '100vh', background: '#ffffff' }}>
      <BrandHeader pageLabel="Player login" />
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
          <p className="text-[11px] text-faint mb-4">Every player uses the same password: draft2026</p>

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Signing in…' : 'Log in'}
          </button>
        </form>
      </div>
    </main>
  );
}
