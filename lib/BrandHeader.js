'use client';

import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from './supabaseClient';

function formatCountdown(ms) {
  if (ms <= 0) return null;
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  return `${days}d ${hours}h ${minutes}m`;
}

export default function BrandHeader({ pageLabel, liveIndicator, pickTimer }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loggedInEmail, setLoggedInEmail] = useState(null);
  const [loggedInName, setLoggedInName] = useState(null);
  const [role, setRole] = useState(null);
  const [countdownText, setCountdownText] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    async function loadSessionAndRole() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setLoggedInEmail(user?.email || null);
      if (user) {
        const [{ data: profileRow }, { data: playerRow }] = await Promise.all([
          supabase.from('profiles').select('role').eq('id', user.id).single(),
          supabase.from('players').select('full_name').eq('email', user.email).maybeSingle(),
        ]);
        setRole(profileRow?.role || null);
        setLoggedInName(playerRow?.full_name || null);
      } else {
        setRole(null);
        setLoggedInName(null);
      }
    }
    loadSessionAndRole();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => loadSessionAndRole());
    return () => subscription.unsubscribe();
  }, []);

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

  // Close the menu on outside click, and whenever the route changes
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  async function handleLogout() {
    await supabase.auth.signOut();
    setMenuOpen(false);
    router.push('/');
  }

  const navLinks = [
    { label: 'Player profile', href: '/profile' },
    { label: 'My team', href: '/live?focus=team' },
    { label: 'Live draft / results', href: '/live' },
  ];
  if (role === 'gm' || role === 'commissioner') navLinks.push({ label: 'GM draft', href: '/draft' });
  if (role === 'commissioner') navLinks.push({ label: 'Commissioner tools', href: '/commissioner' });

  return (
    <div style={{ background: '#0c2340', padding: '16px 20px', position: 'relative' }}>
      <div
        style={{ position: 'absolute', top: 14, right: 18, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}
        ref={menuRef}
      >
        {pickTimer && (
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 9, letterSpacing: '0.04em', color: '#7fa8d9', margin: '0 0 1px', textTransform: 'uppercase' }}>
              Pick clock
            </p>
            <p style={{ fontSize: 22, fontWeight: 500, color: '#ffffff', margin: 0, lineHeight: 1 }}>{pickTimer}</p>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
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

        <button
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', display: 'flex' }}
        >
          {menuOpen ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.8">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.8">
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            </svg>
          )}
        </button>

        {menuOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 10,
              width: 230,
              background: '#ffffff',
              borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
              padding: 8,
              zIndex: 50,
            }}
          >
            {navLinks.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.label}
                  href={link.href}
                  style={{
                    display: 'block',
                    fontSize: 13,
                    padding: '9px 10px',
                    borderRadius: 6,
                    color: active ? '#185fa5' : '#0c2340',
                    background: active ? '#e6f1fb' : 'transparent',
                    fontWeight: active ? 600 : 400,
                    textDecoration: 'none',
                  }}
                >
                  {link.label}
                </Link>
              );
            })}

            <div style={{ borderTop: '0.5px solid #d8dde2', margin: '6px 4px' }} />

            {loggedInEmail ? (
              <>
                <p style={{ fontSize: 11, color: '#8b97a3', padding: '4px 10px', margin: 0 }}>{loggedInEmail}</p>
                <button
                  onClick={handleLogout}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    fontSize: 13,
                    padding: '9px 10px',
                    borderRadius: 6,
                    color: '#c0392b',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Log out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                style={{
                  display: 'block',
                  fontSize: 13,
                  padding: '9px 10px',
                  borderRadius: 6,
                  color: '#0c2340',
                  textDecoration: 'none',
                }}
              >
                Log in
              </Link>
            )}
          </div>
        )}
        </div>

        {loggedInName && (
          <p style={{ fontSize: 11, color: '#a9c6e8', margin: 0 }}>
            Logged in as: <span style={{ color: '#ffffff', fontWeight: 500 }}>{loggedInName}</span>
          </p>
        )}
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
    </div>
  );
}
