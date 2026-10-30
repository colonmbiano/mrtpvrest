'use client';
// MarketplaceTrackingMap.tsx — Mapa de solo lectura del seguimiento v1: el repartidor
// y, si la sucursal tiene coordenadas, el punto de salida. Leaflet + OpenStreetMap por
// CDN, igual que MapLocationPicker. El mapa se crea una vez y los pines se mueven en
// cada consulta del seguimiento (cada 15 s), sin recrearlo.

import { useEffect, useRef, useState } from 'react';
import { loadLeaflet } from './MapLocationPicker';
import type { V1LatLng } from '../lib/marketplaceV1Checkout';

const OSM_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTR = '© OpenStreetMap';

function dotHTML(color: string, size: number): string {
  return `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:${color};
    border:3px solid #ffffff;box-shadow:0 1px 6px rgba(0,0,0,0.35)"></span>`;
}

export default function MarketplaceTrackingMap({ courier, origin, accent, height = 220 }: {
  courier: V1LatLng;
  origin: V1LatLng | null;
  accent: string;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const courierRef = useRef<any>(null);
  const originRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  // 1) Cargar Leaflet y crear el mapa (una vez). Sin arrastre: no secuestra el scroll del modal.
  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;
      const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true, dragging: false })
        .setView([courier.lat, courier.lng], 15);
      L.tileLayer(OSM_TILES, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(map);
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 0);
      setReady(true);
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      courierRef.current = null;
      originRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) Mover los pines con cada consulta y encuadrar repartidor y sucursal.
  const { lat: courierLat, lng: courierLng } = courier;
  const originLat = origin?.lat ?? null;
  const originLng = origin?.lng ?? null;
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    const pin = (ref: { current: any }, lat: number, lng: number, html: string, size: number, label: string) => {
      if (ref.current) { ref.current.setLatLng([lat, lng]); return; }
      const icon = L.divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
      ref.current = L.marker([lat, lng], { icon, keyboard: false, title: label, alt: label }).addTo(map);
    };
    pin(courierRef, courierLat, courierLng, dotHTML(accent, 20), 20, 'Repartidor');
    if (originLat !== null && originLng !== null) {
      pin(originRef, originLat, originLng, dotHTML('#475569', 14), 14, 'Sucursal');
      map.fitBounds([[courierLat, courierLng], [originLat, originLng]], { padding: [36, 36], maxZoom: 16 });
    } else {
      if (originRef.current) { originRef.current.remove(); originRef.current = null; }
      map.setView([courierLat, courierLng], Math.max(map.getZoom() || 15, 15));
    }
  }, [ready, courierLat, courierLng, originLat, originLng, accent]);

  return (
    <section aria-label="Mapa con la ubicación del repartidor"
      style={{ position: 'relative', width: '100%', height, borderRadius: 16, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#eef2f5' }} />
    </section>
  );
}
