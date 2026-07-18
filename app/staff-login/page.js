'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';

export default function StaffLoginPage() {
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
      setError('Incorrect email or password.');
      setLoading(false);
      return;
    }

    router.push('/draft');
  }

  return (
    <main style={{ minHeight: '100vh', background: '#ffffff' }}>
      <div style={{ maxWidth: 420, margin: '0 auto', padding: '0 16px' }}>
        <div
          style={{
            background: '#0c2340',
            padding: '20px',
            borderRadius: '0 0 12px 12px',
            marginBottom: 32,
          }}
        >
          <p
            style={{
              fontSize: 11,
              letterSpacing: '0.06em',
              color: '#7fa8d9',
              margin: '0 0 4px',
              textTransform: 'uppercase',
            }}
          >
            Go Mammoth League
          </p>
          <p style={{ fontSize: 20, fontWeight: 500, color: '#ffffff', margin: 0 }}>
            Commissioner and GM login
          </p>
        </div>

        <form onSubmit={handleLogin}>
          {error && (
            <div
              style={{
                background: '#fcebeb',
                border: '0.5px solid #e24b4a',
                borderRadius: 8,
                padding: '10px 14px',
                marginBottom: 16,
              }}
            >
              <p style={{ fontSize: 12, color: '#791f1f', margin: 0 }}>{error}</p>
            </div>
          )}

          <label style={{ fontSize: 12, color: '#5a6b7d', display: 'block', marginBottom: 4 }}>
            Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            style={inputStyle}
          />

          <label
            style={{
              fontSize: 12,
              color: '#5a6b7d',
              display: 'block',
              marginTop: 14,
              marginBottom: 4,
            }}
          >
            Password
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              background: '#185fa5',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              padding: 13,
              fontSize: 14,
              fontWeight: 500,
              marginTop: 20,
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Signing in…' : 'Log in'}
          </button>
        </form>
      </div>
    </main>
  );
}

const inputStyle = {
  width: '100%',
  border: '0.5px solid #d8dde2',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 13,
  boxSizing: 'border-box',
};
