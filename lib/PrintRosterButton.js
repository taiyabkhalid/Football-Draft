'use client';

import { useState } from 'react';

export default function PrintRosterButton({ teams, pinnedTeamId, label = 'Print Roster', width, compact }) {
  const [open, setOpen] = useState(false);
  const sorted = (teams || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const ordered = pinnedTeamId
    ? [sorted.find((t) => t.id === pinnedTeamId), ...sorted.filter((t) => t.id !== pinnedTeamId)].filter(Boolean)
    : sorted;

  return (
    <div style={{ position: 'relative', width: width || '100%' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs font-medium flex items-center justify-center gap-1"
        style={{
          width: '100%',
          padding: compact ? '6px 4px' : '6px 10px',
          background: '#185fa5',
          color: '#ffffff',
          border: 'none',
          borderRadius: 6,
          fontSize: compact ? 11 : undefined,
        }}
      >
        <i className="ti ti-printer" style={{ fontSize: compact ? 12 : 14 }} aria-hidden="true" />
        {label}
        <i className={`ti ti-chevron-${open ? 'up' : 'down'}`} style={{ fontSize: 12 }} aria-hidden="true" />
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            zIndex: 20,
            marginTop: 4,
            width: '100%',
            minWidth: 200,
            background: '#ffffff',
            border: '1px solid #d8dde2',
            borderRadius: 8,
            overflow: 'hidden',
            maxHeight: 280,
            overflowY: 'auto',
          }}
        >
          {ordered.map((t) => (
            <a
              key={t.id}
              href={`/print?type=team&teamId=${t.id}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              style={{ display: 'block', padding: '8px 12px', fontSize: 12, color: '#0c2340', textDecoration: 'none', borderBottom: '1px solid #eef0f2' }}
            >
              {t.name}
            </a>
          ))}
          <a
            href="/print?type=all"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            style={{
              display: 'block',
              padding: '8px 12px',
              fontSize: 12,
              fontWeight: 600,
              color: '#0c447c',
              background: '#e6f1fb',
              textDecoration: 'none',
              borderBottom: '1px solid #eef0f2',
            }}
          >
            Print All Teams
          </a>
          <a
            href="/print?type=draft"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            style={{ display: 'block', padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#0c447c', background: '#e6f1fb', textDecoration: 'none' }}
          >
            Print Draft
          </a>
        </div>
      )}
    </div>
  );
}
