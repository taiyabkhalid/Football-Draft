'use client';

import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import HeadshotCapture from '../../lib/HeadshotCapture';
import MondayPicker from '../../lib/MondayPicker';

const PREVIOUS_TEAMS = [
  'Warriors',
  'Storm',
  'T-Reds',
  'Pink Panthers',
  'Huskies',
  'Just Ballers',
  'Purple Dragons',
  'Other',
  'Never Played',
  'None',
];

const initialForm = {
  full_name: '',
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
  game_time_unavailable: '',
  call_on_draft_night: false,
  enjoys_pub: false,
};

export default function RegisterPage() {
  const [form, setForm] = useState(initialForm);
  const [photoBlob, setPhotoBlob] = useState(null);
  const [mondays, setMondays] = useState([]);
  const [availableAllSeason, setAvailableAllSeason] = useState(false);

  const handleAvailableAllSeason = (e) => {
    const checked = e.target.checked;
    setAvailableAllSeason(checked);
    if (checked) setMondays([]);
  };
  const [errors, setErrors] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  function validate() {
    const missing = [];
    if (!form.full_name.trim()) missing.push('Full name');
    if (!form.phone.trim()) missing.push('Phone number');
    if (!form.email.trim()) missing.push('Email');
    if (!photoBlob) missing.push('Headshot');
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
      // Defensive check: catch any value that doesn't exactly match what the
      // database allows, with a clear message, before we even try to upload/insert.
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

      // 1. Upload the cropped headshot to Supabase Storage
      const fileName = `${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('headshots')
        .upload(fileName, photoBlob, { contentType: 'image/jpeg' });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('headshots').getPublicUrl(fileName);

      // 2. Insert the player row
      const { error: insertError } = await supabase.from('players').insert({
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        headshot_url: publicUrl,
        offensive_position: form.offensive_position.trim(),
        defensive_position: form.defensive_position.trim(),
        position_preference: form.position_preference.trim(),
        height_feet: Number(form.height_feet),
        height_inches: Number(form.height_inches),
        gender: form.gender,
        previous_team: ['None', 'Never Played'].includes(form.previous_team) ? null : form.previous_team,
        injury_status: form.injury_status,
        weeks_until_recovered:
          form.injury_status === 'Injured' ? Number(form.weeks_until_recovered) : null,
        game_time_unavailable: form.game_time_unavailable,
        unavailable_mondays: mondays,
        call_on_draft_night: form.call_on_draft_night,
        enjoys_pub: form.enjoys_pub,
      });

      if (insertError) throw insertError;

      setDone(true);
    } catch (err) {
      setErrors([`Something went wrong: ${err.message}`]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <main className="max-w-lg mx-auto px-4 py-16 text-center">
        <p className="font-display text-4xl text-lights mb-3">You're on the board</p>
        <p className="text-chalk/70 text-sm">
          Your profile has been submitted. GMs will see your card when the draft opens.
        </p>
      </main>
    );
  }

  return (
    <main className="max-w-xl mx-auto px-4 py-10">
      <p className="font-display text-4xl text-lights leading-none mb-1">Player Registration</p>
      <p className="text-chalk/60 text-sm mb-6">
        Every field below is required before your card can go into the draft pool.
      </p>

      {errors.length > 0 && (
        <div className="bg-flag/10 border border-flag/40 rounded-md p-3 mb-6">
          <p className="text-xs font-semibold text-flag mb-1">Please fix the following:</p>
          <ul className="text-xs text-chalk/80 list-disc list-inside">
            {errors.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* 1st & Basic info */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lights font-display text-sm">1ST &amp; BASIC INFO</span>
            <div className="flex-1 h-px bg-field-700" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="field-label">Full name</label>
              <input type="text" value={form.full_name} onChange={set('full_name')} placeholder="Jordan Miles" />
            </div>
            <div>
              <label className="field-label">Phone number</label>
              <input type="tel" value={form.phone} onChange={set('phone')} placeholder="(555) 555-5555" />
            </div>
            <div className="sm:col-span-2">
              <label className="field-label">Email</label>
              <input type="email" value={form.email} onChange={set('email')} placeholder="you@email.com" />
            </div>
          </div>
        </section>

        {/* 2nd & Headshot */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lights font-display text-sm">2ND &amp; HEADSHOT</span>
            <div className="flex-1 h-px bg-field-700" />
          </div>
          <HeadshotCapture onPhotoReady={setPhotoBlob} />
        </section>

        {/* 3rd & Position */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lights font-display text-sm">3RD &amp; POSITION</span>
            <div className="flex-1 h-px bg-field-700" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="field-label">Offensive position</label>
              <select value={form.offensive_position} onChange={set('offensive_position')}>
                <option value="">Select&hellip;</option>
                <option>QB</option>
                <option>WR</option>
                <option>C</option>
              </select>
            </div>
            <div>
              <label className="field-label">Defensive position</label>
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
            <label className="field-label">Position preference</label>
            <select value={form.position_preference} onChange={set('position_preference')}>
              <option value="">Select&hellip;</option>
              <option>Offense only</option>
              <option>Defense only</option>
              <option>Both</option>
            </select>
          </div>
        </section>

        {/* 4th & Bio */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lights font-display text-sm">4TH &amp; BIO</span>
            <div className="flex-1 h-px bg-field-700" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="field-label">Height (ft)</label>
              <select value={form.height_feet} onChange={set('height_feet')}>
                <option value="">-</option>
                <option>4</option>
                <option>5</option>
                <option>6</option>
                <option>7</option>
              </select>
            </div>
            <div>
              <label className="field-label">Height (in)</label>
              <select value={form.height_inches} onChange={set('height_inches')}>
                <option value="">-</option>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i}>{i}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Gender</label>
              <select value={form.gender} onChange={set('gender')}>
                <option value="">-</option>
                <option value="M">M</option>
                <option value="F">F</option>
              </select>
            </div>
          </div>
        </section>

        {/* 5th & History */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lights font-display text-sm">5TH &amp; HISTORY</span>
            <div className="flex-1 h-px bg-field-700" />
          </div>
          <div>
            <label className="field-label">Previous team</label>
            <select value={form.previous_team} onChange={set('previous_team')}>
              <option value="">Select&hellip;</option>
              {PREVIOUS_TEAMS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
        </section>

        {/* 6th & Health */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lights font-display text-sm">6TH &amp; HEALTH</span>
            <div className="flex-1 h-px bg-field-700" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="field-label">Injury status</label>
              <select value={form.injury_status} onChange={set('injury_status')}>
                <option value="">Select&hellip;</option>
                <option>None</option>
                <option>Recovering</option>
                <option>Injured</option>
              </select>
            </div>
            {form.injury_status === 'Injured' && (
              <div>
                <label className="field-label">Weeks until recovered</label>
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

        {/* 7th & Availability */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lights font-display text-sm">7TH &amp; AVAILABILITY</span>
            <div className="flex-1 h-px bg-field-700" />
          </div>
          <div className="mb-4">
            <label className="field-label">Game time not available</label>
            <select value={form.game_time_unavailable} onChange={set('game_time_unavailable')}>
              <option value="">Select&hellip;</option>
              <option>7 PM game</option>
              <option>8 PM game</option>
              <option>9 PM game</option>
              <option>Available for all</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={availableAllSeason}
              onChange={handleAvailableAllSeason}
              className="w-4 h-4"
            />
            Available for the entire season
          </label>
          {!availableAllSeason && (
            <>
              <label className="field-label">Unavailable Mondays</label>
              <MondayPicker selected={mondays} onChange={setMondays} />
            </>
          )}
        </section>

        {/* 8th & Extras */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lights font-display text-sm">8TH &amp; EXTRAS</span>
            <div className="flex-1 h-px bg-field-700" />
          </div>
          <label className="flex items-center gap-2 text-sm mb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.call_on_draft_night}
              onChange={set('call_on_draft_night')}
              className="w-4 h-4"
            />
            Call me on Draft Night
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.enjoys_pub} onChange={set('enjoys_pub')} className="w-4 h-4" />
            I enjoy the Pub
          </label>
        </section>

        <button type="submit" disabled={submitting} className="btn-primary w-full text-base py-3">
          {submitting ? 'Submitting…' : 'Submit profile'}
        </button>
      </form>
    </main>
  );
}
