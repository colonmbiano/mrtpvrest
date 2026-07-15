'use client';
// MapLocationPicker.tsx — Selector de ubicación con pin arrastrable.
// Leaflet + OpenStreetMap por CDN (mismo patrón que apps/admin/.../rastreo y
// apps/delivery MapScreen): gratis, sin cuenta ni token. El usuario mueve el pin
// o toca el mapa para fijar coordenadas; también puede usar su GPS.
//
// Controlado: recibe `value` y emite `onChange({lat,lng})`. La verdad del costo
// de envío la recalcula el backend (lib/delivery-fee); esto solo fija el punto.

import { useEffect, useRef, useState } from 'react';

const LEAFLET_VER = '1.9.4';
const OSM_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTR = '© OpenStreetMap';

type LatLng = { lat: number; lng: number };

// Carga Leaflet (CSS + JS) una sola vez y resuelve cuando window.L está listo.
function loadLeaflet(): Promise<any> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return;
    const w = window as any;
    if (w.L) return resolve(w.L);

    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = `https://cdnjs.cloudflare.com/ajax/libs/leaflet/${LEAFLET_VER}/leaflet.min.css`;
      document.head.appendChild(link);
    }
    let script = document.getElementById('leaflet-js') as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = 'leaflet-js';
      script.src = `https://cdnjs.cloudflare.com/ajax/libs/leaflet/${LEAFLET_VER}/leaflet.min.js`;
      document.head.appendChild(script);
    }
    const done = () => w.L && resolve(w.L);
    if (w.L) done();
    else script.addEventListener('load', done);
  });
}

function pinHTML(accent: string): string {
  // Teardrop SVG anclado en la punta inferior.
  return `<svg width="34" height="44" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 8.4 12 20 12 20s12-11.6 12-20C24 5.37 18.63 0 12 0z"
      fill="${accent}" stroke="#ffffff" stroke-width="2"/>
    <circle cx="12" cy="12" r="4.5" fill="#ffffff"/>
  </svg>`;
}

export function MapLocationPicker({
  value,
  onChange,
  accent = '#22c55e',
  height = 240,
  defaultCenter = { lat: 19.4326, lng: -99.1332 }, // CDMX como fallback
}: {
  value: LatLng | null;
  onChange: (c: LatLng) => void;
  accent?: string;
  height?: number | string;
  defaultCenter?: LatLng;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [ready, setReady] = useState(false);
  const [locating, setLocating] = useState(false);

  // Coloca (o crea) el pin arrastrable y emite el cambio.
  function placeMarker(lat: number, lng: number, emit = true) {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (!markerRef.current) {
      const icon = L.divIcon({ html: pinHTML(accent), className: '', iconSize: [34, 44], iconAnchor: [17, 44] });
      markerRef.current = L.marker([lat, lng], { icon, draggable: true }).addTo(map);
      markerRef.current.on('dragend', () => {
        const p = markerRef.current.getLatLng();
        onChangeRef.current({ lat: p.lat, lng: p.lng });
      });
    } else {
      markerRef.current.setLatLng([lat, lng]);
    }
    if (emit) onChangeRef.current({ lat, lng });
  }

  // 1) Cargar Leaflet y crear el mapa (una vez).
  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;
      const start = value || defaultCenter;
      // dragging:false — sin pan de una mano el mapa NO secuestra el scroll de la
      // página (el dedo scrollea el checkout, no panea). La ubicación se fija con
      // el botón GPS, tocando el mapa, o arrastrando el pin (fine-tuning).
      const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true, dragging: false })
        .setView([start.lat, start.lng], value ? 16 : 13);
      L.tileLayer(OSM_TILES, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(map);
      map.on('click', (e: any) => placeMarker(e.latlng.lat, e.latlng.lng));
      mapRef.current = map;
      if (value) placeMarker(value.lat, value.lng, false);
      setTimeout(() => map.invalidateSize(), 0);
      setReady(true);
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) Sincronizar el pin cuando `value` cambia desde afuera (p.ej. botón GPS del padre).
  useEffect(() => {
    if (!ready || !value) return;
    const cur = markerRef.current?.getLatLng();
    const same = cur && Math.abs(cur.lat - value.lat) < 1e-6 && Math.abs(cur.lng - value.lng) < 1e-6;
    if (same) return;
    placeMarker(value.lat, value.lng, false);
    mapRef.current?.setView([value.lat, value.lng], Math.max(mapRef.current.getZoom() || 13, 16));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.lat, value?.lng, ready]);

  function useMyLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        placeMarker(pos.coords.latitude, pos.coords.longitude);
        mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 16);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height, borderRadius: 16, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#eef2f5' }} />

      {/* Botón GPS flotante */}
      <button
        type="button"
        onClick={useMyLocation}
        aria-label="Usar mi ubicación"
        style={{
          position: 'absolute', top: 10, right: 10, zIndex: 500,
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '10px 14px', borderRadius: 12, cursor: 'pointer', minHeight: 40,
          background: '#ffffff', border: '1px solid #e5e7eb',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          fontSize: 12, fontWeight: 700, color: accent,
        }}
      >
        <span style={{ fontSize: 14 }}>📍</span>
        {locating ? 'Ubicando…' : 'Mi ubicación'}
      </button>

      {/* Hint cuando aún no hay pin */}
      {ready && !value && (
        <div
          style={{
            position: 'absolute', bottom: 22, left: 10, right: 10, zIndex: 500,
            padding: '8px 12px', borderRadius: 12, textAlign: 'center',
            background: 'rgba(255,255,255,0.94)', border: '1px solid #e5e7eb',
            fontSize: 12, fontWeight: 600, color: '#475569',
          }}
        >
          Toca el mapa o arrastra el pin para marcar tu ubicación
        </div>
      )}
    </div>
  );
}
