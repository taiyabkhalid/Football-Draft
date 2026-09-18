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

export default function BrandHeader({ pageLabel, liveIndicator, pickTimer, showSoundToggle, soundOn, onToggleSound }) {
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
  const [isProxy, setIsProxy] = useState(false);
  const [showWatchDraftModal, setShowWatchDraftModal] = useState(false);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);
  const [savingDarkMode, setSavingDarkMode] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    async function loadSessionAndRole() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setLoggedInEmail(user?.email || null);
      if (user) {
        const [{ data: profileRow }, { data: playerRow }, { data: teamsRow }] = await Promise.all([
          supabase.from('profiles').select('role, team_id, dark_mode_enabled').eq('id', user.id).single(),
          supabase.from('players').select('full_name, team_id').eq('email', user.email).maybeSingle(),
          supabase.from('teams').select('proxy_email'),
        ]);
        setRole(profileRow?.role || null);
        setDarkModeEnabled(Boolean(profileRow?.dark_mode_enabled));
        setLoggedInName(playerRow?.full_name || null);
        setHasTeam(!!(profileRow?.team_id || playerRow?.team_id));
        const myEmailLower = user.email?.toLowerCase() || '';
        setIsProxy(
          (teamsRow || []).some((t) =>
            (t.proxy_email || '')
              .split(',')
              .map((e) => e.trim().toLowerCase())
              .includes(myEmailLower)
          )
        );
      } else {
        setRole(null);
        setLoggedInName(null);
        setHasTeam(false);
        setIsProxy(false);
        setDarkModeEnabled(false);
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
  const [draftCompletedAtMs, setDraftCompletedAtMs] = useState(null);

  useEffect(() => {
    async function loadDraftStatus() {
      const { data } = await supabase
        .from('draft_settings')
        .select('draft_status, draft_datetime, draft_completed_at')
        .eq('id', 1)
        .single();
      setIsDraftLive(data?.draft_status === 'in_progress');
      setDraftStatusRaw(data?.draft_status || null);
      setDraftDatetimeMs(data?.draft_datetime ? new Date(data.draft_datetime).getTime() : null);
      setDraftCompletedAtMs(data?.draft_completed_at ? new Date(data.draft_completed_at).getTime() : null);
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
  // their profile or Commish Tools right as the draft is about to start.
  const [nowTick, setNowTick] = useState(() => Date.now());
  const isGmOrCommish = role === 'gm' || role === 'commissioner' || isProxy;
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

  async function handleToggleDarkMode() {
    const newValue = !darkModeEnabled;
    setSavingDarkMode(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').update({ dark_mode_enabled: newValue }).eq('id', user.id);
    }
    setDarkModeEnabled(newValue);
    setSavingDarkMode(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    try {
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith('proxyNoticeSeen_'))
        .forEach((k) => sessionStorage.removeItem(k));
    } catch (e) {
      // sessionStorage unavailable - logout still proceeds normally.
    }
    setMenuOpen(false);
    router.push('/');
  }

  const isWithinDraftWindow =
    draftStatusRaw === 'in_progress' ||
    draftStatusRaw === 'paused' ||
    (draftStatusRaw === 'not_started' && draftDatetimeMs !== null && draftDatetimeMs - nowTick <= 30 * 60 * 1000);

  const isCompleted = draftStatusRaw === 'completed';
  // A 2-hour grace period after completion before My Draft Room disappears
  // from the menu - we don't want menu items shifting around on GMs in the
  // immediate aftermath of a draft while they're still reviewing results.
  const completedOverTwoHoursAgo = isCompleted && draftCompletedAtMs !== null && Date.now() - draftCompletedAtMs > 2 * 60 * 60 * 1000;

  const navLinks = [];
  if (isGmOrCommish) {
    if (!completedOverTwoHoursAgo) {
      navLinks.push({ label: 'My Draft Room', href: '/draft?focus=selection', highlighted: isWithinDraftWindow });
    }
    // GM/commissioner never get the Live dot here on purpose - it would
    // distract from "go draft," which is what they should actually be
    // doing while the draft is live, not watching the spectator room.
    navLinks.push({
      label: isCompleted ? 'Spectator Draft Room' : 'Watch Draft',
      href: '/live',
      isWatchDraftLink: !isCompleted,
    });
  }
  navLinks.push({ label: 'Player profile', href: '/profile' });
  if (loggedInEmail && (hasTeam || isProxy)) {
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
    label: isGmOrCommish ? 'Draft Results' : draftStatusRaw === 'completed' ? 'Draft Results' : 'Watch Draft',
    href: isGmOrCommish ? '/draft?focus=results' : '/live',
    suppressActive: isGmOrCommish,
    showLiveDot: !isGmOrCommish && isWithinDraftWindow && draftStatusRaw !== 'completed',
  });
  if (role === 'commissioner') navLinks.push({ label: 'Commish Tools', href: '/commissioner' });

  const forename = loggedInName ? loggedInName.split(' ')[0] : null;

  const soundToggleButton = showSoundToggle && (
    <button
      onClick={onToggleSound}
      aria-label={soundOn ? 'Mute draft pick chime' : 'Enable draft pick chime'}
      style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', display: 'flex' }}
    >
      {soundOn ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7fa8d9" strokeWidth="1.8">
          <path d="M11 5L6 9H2v6h4l5 4V5z" />
          <path d="M15.5 8.5a5 5 0 010 7" strokeLinecap="round" />
          <path d="M18.5 5.5a9 9 0 010 13" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8b97a3" strokeWidth="1.8">
          <path d="M11 5L6 9H2v6h4l5 4V5z" />
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </svg>
      )}
    </button>
  );

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
            background: 'var(--df-surface)',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            padding: 8,
            zIndex: 50,
          }}
        >
          {navLinks.map((link) => {
            const active = !link.suppressActive && pathname === link.href;
            return (
              <a
                key={link.label}
                href={link.href}
                onClick={(e) => {
                  e.preventDefault();
                  if (link.isWatchDraftLink) {
                    setMenuOpen(false);
                    setShowWatchDraftModal(true);
                    return;
                  }
                  setMenuOpen(false);
                  const separator = link.href.includes('?') ? '&' : '?';
                  const target = `${link.href}${separator}t=${Date.now()}`;
                  console.log('[menu-nav]', link.label, '->', target);
                  router.push(target);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 13,
                  padding: '9px 10px',
                  borderRadius: 6,
                  color: link.highlighted ? 'var(--df-error)' : active ? 'var(--df-accent)' : 'var(--df-text-primary)',
                  background: link.highlighted ? 'var(--df-error-bg)' : active ? 'var(--df-info-bg)' : 'transparent',
                  fontWeight: link.highlighted || active ? 600 : 400,
                  textDecoration: 'none',
                  cursor: 'pointer',
                }}
              >
                {link.label}
                {link.showLiveDot && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--df-success)' }} />
                    <span style={{ fontSize: 11, color: 'var(--df-success)', fontWeight: 600 }}>Live</span>
                  </span>
                )}
              </a>
            );
          })}

          <div style={{ borderTop: '0.5px solid var(--df-border)', margin: '6px 4px' }} />

          {loggedInEmail ? (
            <>
              <p style={{ fontSize: 11, color: 'var(--df-text-faint)', padding: '4px 10px', margin: 0 }}>{loggedInEmail}</p>
              {role === 'commissioner' && (
                <div className="flex items-center justify-between" style={{ padding: '8px 10px' }}>
                  <span style={{ fontSize: 13, color: 'var(--df-text-primary)', fontWeight: 500 }}>Dark Mode</span>
                  <button
                    onClick={handleToggleDarkMode}
                    disabled={savingDarkMode}
                    role="switch"
                    aria-checked={darkModeEnabled}
                    style={{
                      width: 40,
                      height: 22,
                      borderRadius: 11,
                      background: darkModeEnabled ? 'var(--df-accent)' : 'var(--df-border)',
                      border: 'none',
                      position: 'relative',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: 2,
                        left: darkModeEnabled ? 20 : 2,
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        background: 'var(--df-surface)',
                        transition: 'left 0.15s ease',
                      }}
                    />
                  </button>
                </div>
              )}
              <button
                onClick={handleLogout}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  fontSize: 13,
                  padding: '9px 10px',
                  borderRadius: 6,
                  color: 'var(--df-error)',
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
                style={{ display: 'block', fontSize: 13, padding: '9px 10px', borderRadius: 6, color: 'var(--df-text-primary)', textDecoration: 'none' }}
              >
                Log in
              </Link>
              <Link
                href="/register"
                style={{ display: 'block', fontSize: 13, padding: '9px 10px', borderRadius: 6, color: 'var(--df-text-primary)', textDecoration: 'none' }}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {soundToggleButton}
            {hamburgerButton}
          </div>
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
              {soundToggleButton}
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
          <div className="rounded-2xl p-8 text-center df-modal-card" style={{ maxWidth: 320, background: 'var(--df-surface)' }}>
            {secondsUntilDraftForPopup > 0 ? (
              <>
                <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--df-text-faint)' }}>Kicking off in</p>
                <p className="text-6xl font-bold m-0" style={{ color: 'var(--df-accent)' }}>
                  {secondsUntilDraftForPopup}
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold m-0 mb-2" style={{ color: 'var(--df-text-primary)' }}>
                  The Go Mammoth Draft has officially started!
                </p>
                <p className="text-sm m-0" style={{ color: 'var(--df-text-muted)' }}>
                  Don't expect to be the first pick.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {showWatchDraftModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(12,35,64,0.5)', zIndex: 200 }}
          className="flex items-center justify-center px-4"
          onClick={() => setShowWatchDraftModal(false)}
        >
          <div
            className="rounded-xl p-5 df-modal-card"
            style={{ maxWidth: 340, width: '100%', background: 'var(--df-surface)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-semibold m-0 mb-2" style={{ color: 'var(--df-text-primary)' }}>
              Heads up
            </p>
            <p className="text-sm m-0 mb-4" style={{ color: 'var(--df-text-secondary)' }}>
              This is the Spectator Room for the draft. You can't make draft selections from here — you'll need to
              go to My Draft Room to make your picks.
            </p>
            <a
              href="/draft?focus=selection"
              onClick={(e) => {
                e.preventDefault();
                setShowWatchDraftModal(false);
                router.push(`/draft?focus=selection&t=${Date.now()}`);
              }}
              className="block text-center mb-2"
              style={{
                background: 'var(--df-accent)',
                color: 'var(--df-surface)',
                fontWeight: 600,
                borderRadius: 8,
                padding: '9px 14px',
                fontSize: 13,
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              Go to My Draft Room instead?
            </a>
            <a
              href="/live"
              onClick={(e) => {
                e.preventDefault();
                setShowWatchDraftModal(false);
                router.push(`/live?t=${Date.now()}`);
              }}
              className="block text-center"
              style={{
                color: 'var(--df-text-muted)',
                fontWeight: 500,
                borderRadius: 8,
                padding: '9px 14px',
                fontSize: 13,
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              Continue to Spectator Room
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
