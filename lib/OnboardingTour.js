'use client';

import { useState } from 'react';

// A small, sequential slide tour used for first-time GM/commissioner/proxy
// onboarding on the GM Draft Room. Deliberately simple (a centered card,
// one icon, one short headline, one short sentence, dot progress) rather
// than a spotlight-cutout tour over the real page - much more reliable to
// build correctly, and a wall of text was specifically flagged as
// counterintuitive, so each slide is intentionally terse.
//
// `forced` controls whether this can be dismissed at all: true for a
// genuine first-time run (no Skip, no backdrop click, no close icon -
// the person must click through every slide), false for a voluntary
// replay (Skip and backdrop-click both work, since they've already been
// through it and are just choosing to look again).
export default function OnboardingTour({ slides, forced, onComplete, onSkip }) {
  const [index, setIndex] = useState(0);
  if (!slides || slides.length === 0) return null;
  const slide = slides[index];
  const isLast = index === slides.length - 1;

  function handleBackdropClick() {
    if (!forced) onSkip?.();
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(12,35,64,0.5)', zIndex: 300 }}
      className="flex items-center justify-center px-4"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-white rounded-xl p-5 text-center flex flex-col"
        style={{ width: 340, maxWidth: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 flex flex-col items-center justify-center" style={{ minHeight: 230 }}>
          {slide.visual ? (
            <div className="mb-3.5 flex justify-center">{slide.visual}</div>
          ) : (
            <div
              className="rounded-full flex items-center justify-center mx-auto mb-3.5"
              style={{ width: 44, height: 44, background: slide.iconBg || '#e6f1fb' }}
            >
              <i className={`ti ${slide.icon}`} style={{ fontSize: 22, color: slide.iconColor || '#185fa5' }} aria-hidden="true" />
            </div>
          )}
          <p className="text-[15px] font-medium m-0 mb-1.5" style={{ color: '#0c2340' }}>
            {slide.title}
          </p>
          <p className="text-[13px] m-0" style={{ color: '#5a6b7d', lineHeight: 1.5 }}>
            {slide.body}
          </p>
        </div>
        {slides.length > 1 && (
          <div className="flex justify-center gap-1.5 mb-4 mt-4">
            {slides.map((_, i) => (
              <span
                key={i}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: i === index ? '#185fa5' : '#d8dde2',
                }}
              />
            ))}
          </div>
        )}
        <div className="flex items-center justify-between">
          {!forced ? (
            <button onClick={onSkip} className="text-xs" style={{ color: '#8b97a3' }}>
              Skip
            </button>
          ) : index > 0 ? (
            <button onClick={() => setIndex((i) => i - 1)} className="text-xs" style={{ color: '#8b97a3' }}>
              Back
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={() => (isLast ? onComplete() : setIndex((i) => i + 1))}
            className="text-[13px] font-medium rounded-md"
            style={{ background: '#185fa5', color: '#ffffff', border: 'none', padding: '7px 16px' }}
          >
            {isLast ? 'Got it' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
