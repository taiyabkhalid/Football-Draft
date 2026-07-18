'use client';

import { useState, useMemo } from 'react';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildCalendarGrid(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = firstDay.getDay(); // 0 = Sunday

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
  return cells;
}

export default function MondayPicker({ selected, onChange }) {
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const [viewMonth, setViewMonth] = useState(startOfMonth(today));

  const cells = buildCalendarGrid(viewMonth);
  const monthLabel = viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const isCurrentMonth = viewMonth.getFullYear() === today.getFullYear() && viewMonth.getMonth() === today.getMonth();

  const goPrevMonth = () => {
    if (isCurrentMonth) return; // don't allow navigating before the current month
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1));
  };
  const goNextMonth = () => {
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1));
  };

  const toggle = (iso) => {
    if (selected.includes(iso)) {
      onChange(selected.filter((d) => d !== iso));
    } else {
      onChange([...selected, iso]);
    }
  };

  const sortedSelected = [...selected].sort();

  return (
    <div>
      <div className="bg-field-800 border border-field-700 rounded-lg p-3 max-w-sm">
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={goPrevMonth}
            disabled={isCurrentMonth}
            className="text-chalk/60 hover:text-lights disabled:opacity-20 disabled:hover:text-chalk/60 px-2 text-sm"
            aria-label="Previous month"
          >
            ‹
          </button>
          <span className="text-sm font-semibold text-chalk">{monthLabel}</span>
          <button
            type="button"
            onClick={goNextMonth}
            className="text-chalk/60 hover:text-lights px-2 text-sm"
            aria-label="Next month"
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-chalk/40 mb-1">
          {DAY_LABELS.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {cells.map((date, i) => {
            if (!date) return <span key={i} />;
            const isMonday = date.getDay() === 1;
            const iso = isoDate(date);
            const isPast = date < today;
            const active = isMonday && selected.includes(iso);

            if (!isMonday) {
              return (
                <span key={i} className="py-1.5 text-chalk/25">
                  {date.getDate()}
                </span>
              );
            }

            return (
              <button
                type="button"
                key={i}
                disabled={isPast}
                onClick={() => toggle(iso)}
                className={`rounded-full py-1.5 font-medium ${
                  isPast
                    ? 'text-chalk/20 cursor-not-allowed'
                    : active
                    ? 'bg-lights text-field-950'
                    : 'text-chalk hover:bg-field-700 border border-field-700'
                }`}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-chalk/50 mt-2">
        {sortedSelected.length === 0
          ? 'No unavailable Mondays selected yet.'
          : `Unavailable: ${sortedSelected
              .map((d) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
              .join(', ')}`}
      </p>
    </div>
  );
}
