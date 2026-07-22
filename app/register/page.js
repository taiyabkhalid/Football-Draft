'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import HeadshotCapture from '../../lib/HeadshotCapture';
import MondayPicker from '../../lib/MondayPicker';
import BrandHeader from '../../lib/BrandHeader';

const PREVIOUS_TEAMS = [
  'Water Warriors',
  'Storm',
  'T-Reds',
  'Pink Panthers',
  'City Huskies',
  'Just Ballers',
  'Purple Cobras',
  'Pulling My Leg',
  'Other',
  'Never Played',
];

const initialForm = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  offensive_position: '',
  defensive_position: '',
  position_preference: '',
  height_feet: '',
  height_inches: '',
  gender: '',
  previous_team: '',
  injury_status: '',
  weeks_until_recovered: '',
  game_time_unavailable: 'Available for all',
  call_on_draft_night: false,
  enjoys_pub: false,
};

const Req = () => <span style={{ color: '#c0392b' }}> *</span>;

export default function RegisterPage() {
  const router = useRouter();
  const [mode, setMode] = useState('create'); // 'create' | 'edit'
  const [checkingSession, setCheckingSession] = useState(true);
  const [locked, setLocked] = useState(false);

  const [form, setForm] = useState(initialForm);
  const [photoBlob, setPhotoBlob] = useState(null);
  const [existingHeadshotUrl, setExistingHeadshotUrl] = useState(null);
  const [mondays, setMondays] = useState([]);
  const [availableAllSeason, setAvailableAllSeason] = useState(false);
  const [errors, setErrors] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [autoLoggedIn, setAutoLoggedIn] = useState(false);

  // Seamless login: once we're logged in and done, jump straight to the
  // profile page rather than making them click through - a brief pause so
  // the confirmation message is still visible for a moment first.
  useEffect(() => {
    if (done && autoLoggedIn) {
      const timer = setTimeout(() => router.push('/profile'), 1200);
      return () => clearTimeout(timer);
    }
  }, [done, autoLoggedIn, router]);

  // On load: if logged in, switch to edit mode and pre-fill with their data
  useEffect(() => {
    async function checkSessionAndLoad() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setCheckingSession(false);
        return;
      }

      const [{ data: playerRow }, { data: settingsRow }] = await Promise.all([
        supabase.from('players').select('*').eq('email', user.email).single(),
        supabase.from('draft_settings').select('*').eq('id', 1).single(),
      ]);

      if (!playerRow) {
        setCheckingSession(false);
        return;
      }

      // Same lock logic as the profile page
      const draftDatetime = settingsRow?.draft_datetime ? new Date(settingsRow.draft_datetime) : null;
      const withinTwoHours = draftDatetime && Date.now() >= draftDatetime.getTime() - 2 * 60 * 60 * 1000;
      const isLocked =
        !settingsRow?.profile_edits_unlocked_override &&
        (settingsRow?.draft_status === 'completed' || withinTwoHours);

      if (isLocked) {
        setLocked(true);
        setCheckingSession(false);
        return;
      }

      const [firstName, ...rest] = (playerRow.full_name || '').split(' ');
      setForm({
        firstName: firstName || '',
        lastName: rest.join(' '),
        phone: playerRow.phone || '',
        email: playerRow.email || '',
        offensive_position: playerRow.offensive_position || '',
        defensive_position: playerRow.defensive_position || '',
        position_preference: playerRow.position_preference || '',
        height_feet: String(playerRow.height_feet ?? ''),
        height_inches: String(playerRow.height_inches ?? ''),
        gender: playerRow.gender || '',
        previous_team: playerRow.previous_team || '',
        injury_status: playerRow.injury_status || '',
        weeks_until_recovered: playerRow.weeks_until_recovered ? String(playerRow.weeks_until_recovered) : '',
        game_time_unavailable: playerRow.game_time_unavailable || 'Available for all',
        call_on_draft_night: playerRow.call_on_draft_night || false,
        enjoys_pub: playerRow.enjoys_pub || false,
      });
      setExistingHeadshotUrl(playerRow.headshot_url || null);
      setMondays((playerRow.unavailable_mondays || []).map((d) => d));
      setAvailableAllSeason((playerRow.unavailable_mondays || []).length === 0);
      setMode('edit');
      setCheckingSession(false);
    }
    checkSessionAndLoad();
  }, []);

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleAvailableAllSeason = (e) => {
    const checked = e.target.checked;
    setAvailableAllSeason(checked);
    if (checked) setMondays([]);
  };

  function validate() {
    const missing = [];
    if (!form.firstName.trim()) missing.push('First name');
    if (!form.lastName.trim()) missing.push('Last name');
    if (!form.phone.trim()) missing.push('Phone number');
    if (mode === 'create' && !form.email.trim().toLowerCase()) missing.push('Email');
    if (!photoBlob && !existingHeadshotUrl) missing.push('Headshot');
    if (!form.offensive_position) missing.push('Offensive position');
    if (!form.defensive_position) missing.push('Defensive position');
    if (!form.position_preference) missing.push('Position preference');
    if (!form.height_feet) missing.push('Height (feet)');
    if (form.height_inches === '') missing.push('Height (inches)');
    if (!form.gender) missing.push('Gender');
    if (!form.previous_team) missing.push('Previous team');
    if (!form.injury_status) missing.push('Injury status');
    if (form.injury_status === 'Injured' && !form.weeks_until_recovered) {
      missing.push('Weeks until recovered');
    }
    if (!form.game_time_unavailable) missing.push('Game time not available');
    return missing;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const missing = validate();
    setErrors(missing);
    if (missing.length > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSubmitting(true);
    try {
      const ENUMS = {
        offensive_position: ['QB', 'WR', 'C'],
        defensive_position: ['CB', 'Safety', 'LB', 'Rush'],
        position_preference: ['Offense only', 'Defense only', 'Both'],
        gender: ['M', 'F'],
        injury_status: ['None', 'Recovering', 'Injured'],
        game_time_unavailable: ['7 PM game', '8 PM game', '9 PM game', 'Available for all'],
      };
      for (const [field, allowed] of Object.entries(ENUMS)) {
        const value = String(form[field]).trim();
        if (!allowed.includes(value)) {
          throw new Error(
            `"${field.replace(/_/g, ' ')}" has an unrecognized value ("${form[field]}"). Please re-select it and try again.`
          );
        }
      }

      let headshotUrl = existingHeadshotUrl;
      if (photoBlob) {
        const fileName = `${crypto.randomUUID()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('headshots')
          .upload(fileName, photoBlob, { contentType: 'image/jpeg' });
        if (uploadError) throw uploadError;
        const {
          data: { publicUrl },
        } = supabase.storage.from('headshots').getPublicUrl(fileName);
        headshotUrl = publicUrl;
      }

      const payload = {
        full_name: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
        phone: form.phone.trim(),
        headshot_url: headshotUrl,
        offensive_position: form.offensive_position.trim(),
        defensive_position: form.defensive_position.trim(),
        position_preference: form.position_preference.trim(),
        height_feet: Number(form.height_feet),
        height_inches: Number(form.height_inches),
        gender: form.gender,
        previous_team: form.previous_team === 'Never Played' ? null : form.previous_team,
        injury_status: form.injury_status,
        weeks_until_recovered: form.injury_status === 'Injured' ? Number(form.weeks_until_recovered) : null,
        game_time_unavailable: form.game_time_unavailable,
        unavailable_mondays: mondays,
        call_on_draft_night: form.call_on_draft_night,
        enjoys_pub: form.enjoys_pub,
      };

      if (mode === 'edit') {
        const { error: updateError } = await supabase.from('players').update(payload).eq('email', form.email.trim().toLowerCase());
        if (updateError) {
          throw new Error(`${updateError.message} — position_preference sent was: "${payload.position_preference}"`);
        }
        setAutoLoggedIn(true); // editing means they were already logged in
      } else {
        const { error: insertError } = await supabase.from('players').insert({ ...payload, email: form.email.trim().toLowerCase() });
        if (insertError) {
          throw new Error(`${insertError.message} — position_preference sent was: "${payload.position_preference}"`);
        }

        // If this email was already pre-assigned a team (e.g. a GM or the
        // commissioner set up ahead of time), sync their new player card
        // to that team immediately, rather than leaving them in the pool
        // until someone manually reassigns them.
        await supabase.rpc('sync_preassigned_team', { p_email: form.email.trim().toLowerCase() });

        const { error: signUpError } = await supabase.auth.signUp({
          email: form.email.trim().toLowerCase(),
          password: 'draft2026',
        });
        if (signUpError && !signUpError.message.includes('already registered')) {
          console.error('Account creation issue:', signUpError.message);
        }

        // Guarantee a session for the common case (brand new player using the
        // shared password). If this email already has a different password
        // (e.g. a GM/commissioner account), this will simply fail quietly,
        // and they'll need to log in once with their own credentials.
        const { data: signInData } = await supabase.auth.signInWithPassword({
          email: form.email.trim().toLowerCase(),
          password: 'draft2026',
        });
        setAutoLoggedIn(!!signInData?.session);
      }

      setDone(true);
    } catch (err) {
      setErrors([`Something went wrong: ${err.message}`]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  }

  if (checkingSession) {
    return (
      <main>
        <BrandHeader pageLabel={mode === 'edit' ? 'Edit your profile' : 'Player registration'} />
        <p className="text-center text-muted text-sm p-10">Loading…</p>
      </main>
    );
  }

  if (locked) {
    return (
      <main>
        <BrandHeader pageLabel="Edit your profile" />
        <div className="max-w-md mx-auto px-4 py-10">
          <Link
            href="/profile"
            className="inline-flex items-center gap-1 text-xs font-medium mb-4"
            style={{ color: '#185fa5', textDecoration: 'none' }}
          >
            <i className="ti ti-chevron-left text-sm" aria-hidden="true" />
            Back to profile
          </Link>
          <div className="bg-[#faeeda] rounded-lg p-4 flex gap-2">
            <i className="ti ti-lock text-base flex-shrink-0" style={{ color: '#854f0b', marginTop: 1 }} aria-hidden="true" />
            <p className="text-xs m-0" style={{ color: '#633806' }}>
              Profile updates are locked 2 hours before the draft. Contact the commissioner for any changes.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (done) {
    return (
      <main>
        <BrandHeader pageLabel={mode === 'edit' ? 'Edit your profile' : 'Player registration'} />
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
          <p className="font-display text-4xl text-royal mb-3">{mode === 'edit' ? 'Changes saved' : "You're on the board"}</p>
          <p className="text-muted text-sm mb-6">
            {mode === 'edit'
              ? 'Your profile has been updated.'
              : "Your profile has been submitted. GMs will see your card when the draft opens."}
          </p>
          {autoLoggedIn ? (
            <Link href="/profile" className="btn-primary inline-block">
              Go to your profile
            </Link>
          ) : (
            <Link href="/login" className="btn-primary inline-block">
              Log in to view your profile
            </Link>
          )}
        </div>
      </main>
    );
  }

  return (
    <main>
      <BrandHeader pageLabel={mode === 'edit' ? 'Edit your profile' : 'Player registration'} />
      <div className="max-w-xl mx-auto px-4 py-10">
        {mode === 'edit' && (
          <Link
            href="/profile"
            className="inline-flex items-center gap-1 text-xs font-medium mb-4"
            style={{ color: '#185fa5', textDecoration: 'none' }}
          >
            <i className="ti ti-chevron-left text-sm" aria-hidden="true" />
            Back to profile
          </Link>
        )}
        <p className="text-muted text-sm mb-6">
          Fields marked <span style={{ color: '#c0392b' }}>*</span> are required.
        </p>

        {errors.length > 0 && (
          <div className="bg-danger/10 rounded-md p-3 mb-6">
            <p className="text-xs font-semibold text-danger mb-1">Please fix the following:</p>
            <ul className="text-xs text-muted list-disc list-inside">
              {errors.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="font-display text-sm text-royal">Basic info</span>
              <div className="flex-1 h-px bg-line" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="field-label">
                  First name
                  <Req />
                </label>
                <input type="text" value={form.firstName} onChange={set('firstName')} placeholder="Jordan" />
              </div>
              <div>
                <label className="field-label">
                  Last name
                  <Req />
                </label>
                <input type="text" value={form.lastName} onChange={set('lastName')} placeholder="Miles" />
              </div>
              <div>
                <label className="field-label">
                  Phone number
                  <Req />
                </label>
                <input type="tel" value={form.phone} onChange={set('phone')} placeholder="(555) 555-5555" />
              </div>
              <div>
                <label className="field-label">
                  Email
                  {mode === 'create' && <Req />}
                  {mode === 'edit' && ' (cannot be changed)'}
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={set('email')}
                  placeholder="you@email.com"
                  disabled={mode === 'edit'}
                  style={mode === 'edit' ? { background: '#f1f3f6', color: '#8b97a3' } : undefined}
                />
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="font-display text-sm text-royal">
                Headshot
                <Req />
              </span>
              <div className="flex-1 h-px bg-line" />
            </div>
            <HeadshotCapture onPhotoReady={setPhotoBlob} initialUrl={existingHeadshotUrl} />
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="font-display text-sm text-royal">Position</span>
              <div className="flex-1 h-px bg-line" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="field-label">
                  Offensive position
                  <Req />
                </label>
                <select value={form.offensive_position} onChange={set('offensive_position')}>
                  <option value="">Select&hellip;</option>
                  <option>QB</option>
                  <option>WR</option>
                  <option>C</option>
                </select>
              </div>
              <div>
                <label className="field-label">
                  Defensive position
                  <Req />
                </label>
                <select value={form.defensive_position} onChange={set('defensive_position')}>
                  <option value="">Select&hellip;</option>
                  <option>CB</option>
                  <option>Safety</option>
                  <option>LB</option>
                  <option>Rush</option>
                </select>
              </div>
            </div>
            <div>
              <label className="field-label">
                Position preference
                <Req />
              </label>
              <select value={form.position_preference} onChange={set('position_preference')}>
                <option value="">Select&hellip;</option>
                <option>Offense only</option>
                <option>Defense only</option>
                <option>Both</option>
              </select>
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="font-display text-sm text-royal">Bio</span>
              <div className="flex-1 h-px bg-line" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="field-label">
                  Height (ft)
                  <Req />
                </label>
                <select value={form.height_feet} onChange={set('height_feet')}>
                  <option value="">-</option>
                  <option>4</option>
                  <option>5</option>
                  <option>6</option>
                  <option>7</option>
                </select>
              </div>
              <div>
                <label className="field-label">
                  Height (in)
                  <Req />
                </label>
                <select value={form.height_inches} onChange={set('height_inches')}>
                  <option value="">-</option>
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i}>{i}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">
                  Gender
                  <Req />
                </label>
                <select value={form.gender} onChange={set('gender')}>
                  <option value="">-</option>
                  <option value="M">M</option>
                  <option value="F">F</option>
                </select>
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="font-display text-sm text-royal">History</span>
              <div className="flex-1 h-px bg-line" />
            </div>
            <div>
              <label className="field-label">
                Previous team
                <Req />
              </label>
              <select value={form.previous_team} onChange={set('previous_team')}>
                <option value="">Select&hellip;</option>
                {PREVIOUS_TEAMS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="font-display text-sm text-royal">Health</span>
              <div className="flex-1 h-px bg-line" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="field-label">
                  Injury status
                  <Req />
                </label>
                <select value={form.injury_status} onChange={set('injury_status')}>
                  <option value="">Select&hellip;</option>
                  <option>None</option>
                  <option>Recovering</option>
                  <option>Injured</option>
                </select>
              </div>
              {form.injury_status === 'Injured' && (
                <div>
                  <label className="field-label">
                    Weeks until recovered
                    <Req />
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={form.weeks_until_recovered}
                    onChange={set('weeks_until_recovered')}
                    placeholder="e.g. 3"
                  />
                </div>
              )}
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="font-display text-sm text-royal">Availability</span>
              <div className="flex-1 h-px bg-line" />
            </div>
            <div className="mb-4">
              <label className="field-label">
                Game time not available
                <Req />
              </label>
              <select value={form.game_time_unavailable} onChange={set('game_time_unavailable')}>
                <option value="">Select&hellip;</option>
                <option>Available for all</option>
                <option>7 PM game</option>
                <option>8 PM game</option>
                <option>9 PM game</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm mb-3 cursor-pointer">
              <input type="checkbox" checked={availableAllSeason} onChange={handleAvailableAllSeason} className="w-4 h-4" />
              Available for the entire season
            </label>
            {!availableAllSeason && (
              <>
                <label className="field-label">
                  Unavailable Mondays
                  <Req />
                </label>
                <MondayPicker selected={mondays} onChange={setMondays} />
              </>
            )}
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="font-display text-sm text-royal">Extras</span>
              <div className="flex-1 h-px bg-line" />
            </div>
            <label className="flex items-center gap-2 text-sm mb-2 cursor-pointer">
              <input type="checkbox" checked={form.call_on_draft_night} onChange={set('call_on_draft_night')} className="w-4 h-4" />
              Call me on Draft Night
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.enjoys_pub} onChange={set('enjoys_pub')} className="w-4 h-4" />
              I enjoy the Pub
            </label>
          </section>

          <button type="submit" disabled={submitting} className="btn-primary w-full text-base py-3">
            {submitting ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Submit profile'}
          </button>
        </form>
      </div>
    </main>
  );
}
