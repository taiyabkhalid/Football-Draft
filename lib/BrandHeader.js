'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from './supabaseClient';

const BASE_NAV_LINKS = [
  { label: 'Player profile', href: '/profile' },
  { label: 'My team', href: '/live' },
  { label: 'Live draft / results', href: '/live' },
];

function formatCountdown(ms) {
  if (ms <= 0) return null;
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  return `${days}d ${hours}h ${minutes}m`;
}

export default function BrandHeader({ pageLabel, liveIndicator }) {
  const router = useRouter();
  const [loggedInEmail, setLoggedInEmail] = useState(null);
  const [role, setRole] = useState(null); // 'gm' | 'commissioner' | null
  const [countdownText, setCountdownText] = useState(null);

  useEffect(() => {
    async function loadSessionAndRole() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setLoggedInEmail(user?.email || null);
      if (user) {
        const { data: profileRow } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        setRole(profileRow?.role || null);
      } else {
        setRole(null);
      }
    }
    loadSessionAndRole();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadSessionAndRole();
    });
    return () => subscription.unsubscribe();
  }, []);

  // Countdown to draft night (UK time), updates every minute
  useEffect(() => {
    let intervalId;
    async function loadCountdown() {
      const { data: settings } = await supabase.from('draft_settings').select('draft_datetime').eq('id', 1).single();
      if (!settings?.draft_datetime) return;
      const target = new Date(settings.draft_datetime).getTime();

      function tick() {
        setCountdownText(formatCountdown(target - Date.now()));
      }
      tick();
      intervalId = setInterval(tick, 60000);
    }
    loadCountdown();
    return () => clearInterval(intervalId);
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
  }

  const navLinks = [...BASE_NAV_LINKS];
  if (role === 'gm' || role === 'commissioner') {
    navLinks.push({ label: 'GM draft', href: '/draft' });
  }
  if (role === 'commissioner') {
    navLinks.push({ label: 'Commissioner tools', href: '/commissioner' });
  }

  return (
    <div style={{ background: '#0c2340', padding: '16px 20px', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 14, right: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 22,
            height: 14,
            borderRadius: 2,
            overflow: 'hidden',
            position: 'relative',
            border: '0.5px solid rgba(255,255,255,0.2)',
            background: 'repeating-linear-gradient(180deg, #b22234 0, #b22234 2.1px, #ffffff 2.1px, #ffffff 4.2px)',
          }}
        >
          <div style={{ position: 'absolute', top: 0, left: 0, width: '38%', height: '54%', background: '#3c3b6e' }} />
        </div>
        <svg width="22" height="14" viewBox="0 0 30 18" role="img" aria-label="UK flag">
          <rect width="30" height="18" fill="#012169" />
          <line x1="0" y1="0" x2="30" y2="18" stroke="#ffffff" strokeWidth="3.6" />
          <line x1="30" y1="0" x2="0" y2="18" stroke="#ffffff" strokeWidth="3.6" />
          <line x1="0" y1="0" x2="30" y2="18" stroke="#c8102e" strokeWidth="1.4" />
          <line x1="30" y1="0" x2="0" y2="18" stroke="#c8102e" strokeWidth="1.4" />
          <rect x="12" y="0" width="6" height="18" fill="#ffffff" />
          <rect x="0" y="6.5" width="30" height="5" fill="#ffffff" />
          <rect x="13.2" y="0" width="3.6" height="18" fill="#c8102e" />
          <rect x="0" y="7.6" width="30" height="2.8" fill="#c8102e" />
        </svg>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7fa8d9" strokeWidth="1.5" aria-hidden="true">
          <ellipse cx="12" cy="12" rx="9" ry="5.5" transform="rotate(-30 12 12)" />
          <path
            d="M7.5 12 L16.5 12 M9.5 10.5 L9.5 13.5 M12 9.8 L12 14.2 M14.5 10.5 L14.5 13.5"
            transform="rotate(-30 12 12)"
            strokeWidth="1.1"
          />
        </svg>
      </div>

      <p style={{ fontSize: 11, letterSpacing: '0.06em', color: '#7fa8d9', margin: '0 0 4px', textTransform: 'uppercase' }}>
        Go Mammoth League
      </p>
      <p style={{ fontSize: 20, fontWeight: 500, color: '#ffffff', margin: 0, lineHeight: 1.25 }}>
        GM Flag Football Draft 2026
      </p>

      {countdownText && (
        <p style={{ fontSize: 12, color: '#f3c37a', margin: '6px 0 0', fontWeight: 500 }}>
          Draft starts in {countdownText}
        </p>
      )}

      {pageLabel && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
          <p style={{ fontSize: 13, color: '#a9c6e8', margin: 0 }}>{pageLabel}</p>
          {liveIndicator && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#639922' }} />
              <span style={{ fontSize: 11, color: '#c0dd97' }}>Live</span>
            </span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              style={{ fontSize: 11, color: '#a9c6e8', textDecoration: 'none', borderBottom: '1px solid transparent' }}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {loggedInEmail && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#7fa8d9' }}>{loggedInEmail}</span>
            <button
              onClick={handleLogout}
              style={{
                fontSize: 11,
                color: '#f3c37a',
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Log out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
