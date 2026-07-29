'use client';

import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from './supabaseClient';
import FootballIcon from './FootballIcon';

function formatCountdown(ms) {
  if (ms <= 0) return null;
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  return `${days}d ${hours}h ${minutes}m`;
}

export default function BrandHeader({ pageLabel, liveIndicator, pickTimer }) {
  useEffect(() => {
    console.log('%c[Go Mammoth Draft] build: 2026-07-28 9:10am UK', 'color:#185fa5;font-weight:bold;');
  }, []);

  const router = useRouter();
  const pathname = usePathname();
  const [loggedInEmail, setLoggedInEmail] = useState(null);
  const [loggedInName, setLoggedInName] = useState(null);
  const [role, setRole] = useState(null);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [hasTeam, setHasTeam] = useState(false);
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
          supabase.from('profiles').select('role, team_id').eq('id', user.id).single(),
          supabase.from('players').select('full_name, team_id').eq('email', user.email).maybeSingle(),
        ]);
        setRole(profileRow?.role || null);
        setLoggedInName(playerRow?.full_name || null);
        setHasTeam(!!(profileRow?.team_id || playerRow?.team_id));
      } else {
        setRole(null);
        setLoggedInName(null);
        setHasTeam(false);
      }
      setRoleLoaded(true);
    }
    loadSessionAndRole();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => loadSessionAndRole());
    return () => subscription.unsubscribe();
  }, []);

  const [isDraftLive, setIsDraftLive] = useState(false);
  const [draftStatusRaw, setDraftStatusRaw] = useState(null);
  const [draftDatetimeMs, setDraftDatetimeMs] = useState(null);

  useEffect(() => {
    async function loadDraftStatus() {
      const { data } = await supabase.from('draft_settings').select('draft_status, draft_datetime').eq('id', 1).single();
      setIsDraftLive(data?.draft_status === 'in_progress');
      setDraftStatusRaw(data?.draft_status || null);
      setDraftDatetimeMs(data?.draft_datetime ? new Date(data.draft_datetime).getTime() : null);
    }
    loadDraftStatus();
    const channel = supabase
      .channel('brand-header-draft-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draft_settings' }, loadDraftStatus)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  // Start-of-draft popup - fires on whichever page someone happens to be
  // on, not just the draft/spectator rooms, since they might be checking
  // their profile or Commissioner Tools right as the draft is about to start.
  const [nowTick, setNowTick] = useState(() => Date.now());
  const isGmOrCommish = role === 'gm' || role === 'commissioner';
  useEffect(() => {
    if (!loggedInEmail || draftStatusRaw !== 'not_started' || draftDatetimeMs === null) return;
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [loggedInEmail, draftStatusRaw, draftDatetimeMs]);

  const secondsUntilDraftForPopup =
    loggedInEmail && draftStatusRaw === 'not_started' && draftDatetimeMs !== null
      ? Math.floor((draftDatetimeMs - nowTick) / 1000)
      : null;
  const showGmStartPopup =
    secondsUntilDraftForPopup !== null && secondsUntilDraftForPopup <= 10 && secondsUntilDraftForPopup >= -3;

  const navigatedToDraftRef = useRef(false);
  useEffect(() => {
    if (secondsUntilDraftForPopup !== null && secondsUntilDraftForPopup <= -3 && !navigatedToDraftRef.current) {
      navigatedToDraftRef.current = true;
      const target = isGmOrCommish ? '/draft' : '/live';
      if (pathname !== target) router.push(target);
    }
  }, [secondsUntilDraftForPopup, pathname, router, isGmOrCommish]);

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

  const isWithinDraftWindow =
    draftStatusRaw === 'in_progress' ||
    draftStatusRaw === 'paused' ||
    (draftStatusRaw === 'not_started' && draftDatetimeMs !== null && draftDatetimeMs - nowTick <= 30 * 60 * 1000);

  const navLinks = [];
  if (isGmOrCommish) {
    navLinks.push({ label: 'My Draft Room', href: '/draft?focus=selection', highlighted: isWithinDraftWindow });
  }
  navLinks.push({ label: 'Player profile', href: '/profile' });
  if (loggedInEmail && hasTeam) {
    navLinks.push({
      label: 'My team',
      href: isGmOrCommish ? '/draft?focus=myteam' : '/live?focus=team',
    });
  }
  navLinks.push({
    label: 'Search for player',
    href: isGmOrCommish ? '/draft?focus=search' : '/live?focus=search',
  });
  navLinks.push({
    label: isGmOrCommish ? 'Draft Results' : 'Live draft / results',
    href: isGmOrCommish ? '/draft?focus=results' : '/live',
    suppressActive: isGmOrCommish,
  });
  if (role === 'commissioner') navLinks.push({ label: 'Commissioner tools', href: '/commissioner' });

  const forename = loggedInName ? loggedInName.split(' ')[0] : null;

  const hamburgerButton = (
    <div style={{ position: 'relative' }} ref={menuRef}>
      <button
        onClick={() => roleLoaded && setMenuOpen((o) => !o)}
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
            const active = !link.suppressActive && pathname === link.href;
            return (
              <Link
                key={link.label}
                href={link.href}
                style={{
                  display: 'block',
                  fontSize: 13,
                  padding: '9px 10px',
                  borderRadius: 6,
                  color: link.highlighted ? '#c0392b' : active ? '#185fa5' : '#0c2340',
                  background: link.highlighted ? '#fceded' : active ? '#e6f1fb' : 'transparent',
                  fontWeight: link.highlighted || active ? 600 : 400,
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
            <>
              <Link
                href="/login"
                style={{ display: 'block', fontSize: 13, padding: '9px 10px', borderRadius: 6, color: '#0c2340', textDecoration: 'none' }}
              >
                Log in
              </Link>
              <Link
                href="/register"
                style={{ display: 'block', fontSize: 13, padding: '9px 10px', borderRadius: 6, color: '#0c2340', textDecoration: 'none' }}
              >
                Register as a player
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );

  const flagsRow = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div
        style={{
          width: 18,
          height: 12,
          borderRadius: 2,
          overflow: 'hidden',
          position: 'relative',
          border: '0.5px solid rgba(255,255,255,0.2)',
          background: 'repeating-linear-gradient(180deg, #b22234 0, #b22234 1.8px, #ffffff 1.8px, #ffffff 3.6px)',
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, width: '38%', height: '54%', background: '#3c3b6e' }} />
      </div>
      <svg width="18" height="12" viewBox="0 0 30 18" role="img" aria-label="UK flag">
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
    </div>
  );

  return (
    <div style={{ background: '#0c2340', padding: '14px 20px' }}>
      {/* Row 1: football icon + tag on the left, PICK CLOCK label on the right (live only) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <FootballIcon color="#0074ff" size={14} />
          <p style={{ fontSize: 11, letterSpacing: '0.06em', color: '#7fa8d9', margin: 0, textTransform: 'uppercase' }}>
            Go Mammoth League
          </p>
        </div>
        {pickTimer && (
          <p style={{ fontSize: 11, letterSpacing: '0.06em', color: '#7fa8d9', margin: 0, textTransform: 'uppercase' }}>
            Pick clock
          </p>
        )}
      </div>

      {/* Row 2: header title + flags on the left, timer value (live) or hamburger (not live) on the right */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <p style={{ fontSize: 20, fontWeight: 500, color: '#ffffff', margin: 0, lineHeight: 1.25 }}>
            Flag Football Draft 2026
          </p>
          {flagsRow}
        </div>
        {pickTimer ? (
          <p style={{ fontSize: 22, fontWeight: 500, color: '#ffffff', margin: 0, lineHeight: 1 }}>{pickTimer}</p>
        ) : (
          hamburgerButton
        )}
      </div>

      {countdownText && (
        <p style={{ fontSize: 12, color: '#f3c37a', margin: '6px 0 0', fontWeight: 500 }}>
          Draft starts in {countdownText}
        </p>
      )}

      {/* Row 3: page name / draft status on the left, "Logged in as" (+ hamburger, if live) on the right */}
      {pageLabel && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <p style={{ fontSize: 11, letterSpacing: '0.06em', color: '#7fa8d9', margin: 0, textTransform: 'uppercase' }}>
              {pageLabel}
            </p>
            {(liveIndicator || isDraftLive) && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#639922' }} />
                <span style={{ fontSize: 11, color: '#c0dd97' }}>Live</span>
              </span>
            )}
          </div>
          {pickTimer ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {forename && (
                <p style={{ fontSize: 10, color: '#a9c6e8', margin: 0, textAlign: 'right', flexShrink: 0 }}>
                  Logged in as: <span style={{ color: '#ffffff', fontWeight: 500 }}>{forename}</span>
                </p>
              )}
              {hamburgerButton}
            </div>
          ) : (
            forename && (
              <p style={{ fontSize: 10, color: '#a9c6e8', margin: 0, textAlign: 'right', flexShrink: 0 }}>
                Logged in as: <span style={{ color: '#ffffff', fontWeight: 500 }}>{forename}</span>
              </p>
            )
          )}
        </div>
      )}

      {showGmStartPopup && (
        <div
          className="fixed inset-0 flex items-center justify-center px-4"
          style={{ background: 'rgba(12,35,64,0.6)', zIndex: 200 }}
        >
          <div className="bg-white rounded-2xl p-8 text-center" style={{ maxWidth: 320 }}>
            {secondsUntilDraftForPopup > 0 ? (
              <>
                <p className="text-xs uppercase tracking-wide text-muted mb-2">Kicking off in</p>
                <p className="text-6xl font-bold m-0" style={{ color: '#185fa5' }}>
                  {secondsUntilDraftForPopup}
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold m-0 mb-2" style={{ color: '#0c2340' }}>
                  The Go Mammoth Draft has officially started!
                </p>
                <p className="text-sm m-0" style={{ color: '#5a6b7d' }}>
                  Don't expect to be the first pick.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
