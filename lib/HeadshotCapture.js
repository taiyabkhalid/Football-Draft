'use client';

import { useRef, useState, useCallback } from 'react';

// Crops any source image (camera frame or uploaded file) into a consistent
// centered square, so every player photo ends up the same shape regardless
// of how the original was framed.
function cropToSquare(sourceCanvasOrImg, srcW, srcH, outputSize = 480) {
  const side = Math.min(srcW, srcH);
  const sx = (srcW - side) / 2;
  const sy = (srcH - side) / 2;

  const out = document.createElement('canvas');
  out.width = outputSize;
  out.height = outputSize;
  const ctx = out.getContext('2d');
  ctx.drawImage(sourceCanvasOrImg, sx, sy, side, side, 0, 0, outputSize, outputSize);
  return out;
}

export default function HeadshotCapture({ onPhotoReady }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [mode, setMode] = useState('idle'); // idle | camera | preview
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState(null);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      setMode('camera');
      // videoRef isn't attached until after render, so wait a tick
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 0);
    } catch (err) {
      setError('Could not access camera. You can upload a photo instead.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const cropped = cropToSquare(video, video.videoWidth, video.videoHeight);
    cropped.toBlob(
      (blob) => {
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setMode('preview');
        stopCamera();
        onPhotoReady(blob);
      },
      'image/jpeg',
      0.9
    );
  }, [onPhotoReady, stopCamera]);

  const handleFileUpload = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const img = new Image();
      img.onload = () => {
        const cropped = cropToSquare(img, img.width, img.height);
        cropped.toBlob(
          (blob) => {
            const url = URL.createObjectURL(blob);
            setPreviewUrl(url);
            setMode('preview');
            onPhotoReady(blob);
          },
          'image/jpeg',
          0.9
        );
      };
      img.src = URL.createObjectURL(file);
    },
    [onPhotoReady]
  );

  const retake = () => {
    setPreviewUrl(null);
    setMode('idle');
    onPhotoReady(null);
  };

  return (
    <div className="flex flex-col items-center bg-field-800 rounded-lg p-4">
      {mode === 'idle' && (
        <div
          className="w-32 h-40 rounded-[50%] border-2 border-dashed border-chalk/30 flex items-center justify-center mb-3"
          aria-hidden="true"
        >
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-chalk/40">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" />
          </svg>
        </div>
      )}

      {mode === 'camera' && (
        <div className="relative w-40 h-52 mb-3 overflow-hidden rounded-[50%] border-2 border-lights">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
        </div>
      )}

      {mode === 'preview' && previewUrl && (
        <img src={previewUrl} alt="Headshot preview" className="w-32 h-32 rounded-full object-cover border-2 border-lights mb-3" />
      )}

      <p className="text-xs text-chalk/50 mb-3 text-center">
        {mode === 'camera' ? 'Line your face up in the frame' : 'Line your face up inside the frame'}
      </p>

      {error && <p className="text-xs text-flag mb-2">{error}</p>}

      <div className="flex gap-2 flex-wrap justify-center">
        {mode === 'idle' && (
          <>
            <button type="button" onClick={startCamera} className="btn-secondary text-xs">
              Use camera
            </button>
            <label className="btn-secondary text-xs cursor-pointer">
              Upload photo
              <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
            </label>
          </>
        )}
        {mode === 'camera' && (
          <button type="button" onClick={capturePhoto} className="btn-primary text-xs">
            Capture
          </button>
        )}
        {mode === 'preview' && (
          <button type="button" onClick={retake} className="btn-secondary text-xs">
            Retake
          </button>
        )}
      </div>
    </div>
  );
}
