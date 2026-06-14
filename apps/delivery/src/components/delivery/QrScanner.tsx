'use client';
// QrScanner.tsx — Escáner de QR dentro de la app (cámara + jsQR).
// Se usa para vincular el dispositivo del repartidor sin teclear IDs.
// Importante en iOS: el escaneo ocurre DENTRO de la PWA instalada, así los
// datos quedan en su propio almacenamiento (la cámara nativa abriría Safari,
// que tiene storage separado). Requiere HTTPS y permiso de cámara.
import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { X } from 'lucide-react';
import { C } from '@/lib/tokens';

interface Props {
  onResult: (text: string) => void;
  onClose: () => void;
}

export default function QrScanner({ onResult, onClose }: Props) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Refs a los callbacks para no reiniciar la cámara si el padre re-renderiza.
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const stop = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    const scan = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (w && h) {
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, w, h);
            const img = ctx.getImageData(0, 0, w, h);
            const code = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
            if (code?.data) {
              stop();
              onResultRef.current(code.data);
              return;
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(scan);
    };

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Este dispositivo no permite usar la cámara aquí.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true'); // iOS: evita que tome pantalla completa
        await video.play();
        rafRef.current = requestAnimationFrame(scan);
      } catch (e: any) {
        setError(
          e?.name === 'NotAllowedError'
            ? 'Permiso de cámara denegado. Actívalo en Ajustes del iPhone → Safari/la app.'
            : 'No se pudo abrir la cámara.'
        );
      }
    };

    start();
    return () => { cancelled = true; stop(); };
  }, []);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60, background: '#000',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    }}>
      <button onClick={onClose} aria-label="Cerrar" style={{
        position: 'absolute', top: 'calc(env(safe-area-inset-top) + 16px)', right: 16, zIndex: 2,
        width: 44, height: 44, borderRadius: 22, border: '1px solid rgba(255,255,255,0.2)',
        background: 'rgba(0,0,0,0.5)', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <X size={20} strokeWidth={2.5} />
      </button>

      {error ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#fff', maxWidth: 320 }}>
          <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>No se pudo escanear</p>
          <p style={{ fontSize: 12, opacity: 0.8, lineHeight: 1.5 }}>{error}</p>
          <button onClick={onClose} style={{
            marginTop: 20, padding: '10px 18px', borderRadius: 12,
            background: C.amber, color: '#090909', fontWeight: 700, fontSize: 13, border: 'none',
          }}>
            Volver
          </button>
        </div>
      ) : (
        <>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted playsInline />
          {/* Marco guía */}
          <div style={{
            position: 'absolute', width: 240, height: 240, borderRadius: 24,
            border: '3px solid rgba(255,255,255,0.85)', boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
          }} />
          <div style={{
            position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom) + 40px)',
            color: '#fff', fontSize: 13, fontWeight: 600, textAlign: 'center', padding: '0 24px',
          }}>
            Apunta al código QR de vinculación del admin
          </div>
        </>
      )}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}
