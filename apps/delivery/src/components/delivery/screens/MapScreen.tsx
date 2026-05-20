'use client';
// handoff/screens/MapScreen.tsx
// Requiere: npm install mapbox-gl @types/mapbox-gl
// Añadir en next.config.mjs → transpilePackages: ['mapbox-gl']
// Añadir en .env.local → NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1...

import React, { useEffect, useRef, useState } from 'react';
import { C, S } from '@/lib/tokens';

// Importación dinámica de mapbox-gl para evitar SSR errors en Next.js
// mapboxgl.accessToken se fija en el useEffect

interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  deliveryAddress: string;
  total: number;
  status: string;
  lat?: number;
  lng?: number;
}

interface MapScreenProps {
  orders: Order[];
  driverLat?: number;
  driverLng?: number;
  onBack: () => void;
}

// Estilo Mapbox oscuro alineado con el design system
const MAPBOX_STYLE = 'mapbox://styles/mapbox/dark-v11';

// Crea un marker DOM personalizado
function createMarkerEl(label: string | number, color: string, size = 36): HTMLDivElement {
  const el = document.createElement('div');
  Object.assign(el.style, {
    width: `${size}px`, height: `${size}px`, borderRadius: '50%',
    background: color, border: '2.5px solid rgba(255,255,255,0.9)',
    boxShadow: `0 4px 16px rgba(0,0,0,0.5), 0 0 20px ${color}60`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#090909', fontWeight: '800',
    fontFamily: "'Outfit', system-ui, sans-serif", fontSize: '13px',
    cursor: 'pointer',
  });
  el.textContent = String(label);
  return el;
}

function createDriverMarkerEl(): HTMLDivElement {
  const el = document.createElement('div');
  Object.assign(el.style, {
    width: '48px', height: '48px', borderRadius: '50%',
    background: 'rgba(167,139,250,0.95)',
    border: '3px solid rgba(255,255,255,0.9)',
    boxShadow: '0 0 24px rgba(167,139,250,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px',
  });
  el.textContent = '🏍';
  return el;
}

// Popup HTML reutilizable
function popupHTML(order: Order): string {
  return `
    <div style="font-family:'Outfit',sans-serif;background:#141416;border:1px solid rgba(255,255,255,0.1);
      border-radius:12px;padding:10px 14px;min-width:160px;">
      <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:4px">#${order.orderNumber}</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.6)">${order.customerName}</div>
      <div style="font-size:16px;font-weight:700;color:#FFB84D;margin-top:6px">$${order.total.toFixed(2)}</div>
    </div>
  `;
}

export function MapScreen({ orders, driverLat = 19.4326, driverLng = -99.1332, onBack }: MapScreenProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef           = useRef<any>(null);
  const activeOrder      = orders.find(o => o.status === 'ON_THE_WAY') || orders[0];
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);

  useEffect(() => {
    let mapboxgl: any;

    async function initMap() {
      // Importación dinámica — evita SSR
      mapboxgl = (await import('mapbox-gl')).default;
      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

      if (!mapContainerRef.current || mapRef.current) return;

      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: MAPBOX_STYLE,
        center: [driverLng, driverLat],
        zoom: 14.5,
        pitch: 35,
        attributionControl: false,
      });

      mapRef.current.addControl(new mapboxgl.AttributionControl({ compact: true }));

      mapRef.current.on('load', async () => {
        const map = mapRef.current;
        if (!map) return;

        // ── Driver marker ──
        new mapboxgl.Marker({ element: createDriverMarkerEl() })
          .setLngLat([driverLng, driverLat])
          .addTo(map);

        // ── Order markers ──
        orders.forEach((order, idx) => {
          if (!order.lat || !order.lng) return;

          const markerColor = order.status === 'ON_THE_WAY' ? '#FFB84D' : '#A78BFA';
          const markerEl = createMarkerEl(idx + 1, markerColor);

          const popup = new mapboxgl.Popup({ offset: 20, closeButton: false })
            .setHTML(popupHTML(order));

          new mapboxgl.Marker({ element: markerEl })
            .setLngLat([order.lng, order.lat])
            .setPopup(popup)
            .addTo(map);
        });

        // ── Route (Mapbox Directions API) ──
        const activeWithCoords = orders.find(o => o.status === 'ON_THE_WAY' && o.lat && o.lng);
        if (activeWithCoords?.lat && activeWithCoords?.lng) {
          try {
            const resp = await fetch(
              `https://api.mapbox.com/directions/v5/mapbox/driving/` +
              `${driverLng},${driverLat};${activeWithCoords.lng},${activeWithCoords.lat}` +
              `?geometries=geojson&access_token=${mapboxgl.accessToken}`
            );
            const data = await resp.json();
            if (data.routes?.[0]) {
              const route = data.routes[0];
              setEtaMinutes(Math.round(route.duration / 60));

              map.addSource('route', {
                type: 'geojson',
                data: { type: 'Feature', properties: {}, geometry: route.geometry },
              });

              // Glow bajo la ruta
              map.addLayer({
                id: 'route-glow',
                type: 'line', source: 'route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#FFB84D', 'line-width': 16, 'line-opacity': 0.12 },
              });

              // Línea principal
              map.addLayer({
                id: 'route-line',
                type: 'line', source: 'route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#FFB84D', 'line-width': 4.5, 'line-opacity': 0.9 },
              });
            }
          } catch { /* Sin ruta — modo sin conexión */ }
        }
      });
    }

    initMap();
    return () => { mapRef.current?.remove(); mapRef.current = null; };
  }, [driverLat, driverLng]);

  return (
    <div style={{ height: '100vh', background: C.bg, display: 'flex', flexDirection: 'column', position: 'relative' }}>

      {/* Transparent header overlay */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
        padding: '10px 16px 40px',
        background: 'linear-gradient(180deg, rgba(9,9,11,0.96) 0%, rgba(9,9,11,0.5) 60%, transparent 100%)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button onClick={onBack} style={{
          ...S.iconBtn,
          border: '1px solid rgba(255,255,255,0.14)',
          background: 'rgba(255,255,255,0.07)',
          backdropFilter: 'blur(12px)',
          color: C.text,
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Ruta Activa</div>
          <div style={{ fontSize: 9, color: C.amber, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: 2 }}>
            {orders.length} {orders.length === 1 ? 'parada' : 'paradas'}{etaMinutes ? ` · ETA ${etaMinutes} min` : ''}
          </div>
        </div>
        <div style={{
          padding: '5px 12px', borderRadius: 20,
          background: 'rgba(255,184,77,0.14)', border: '1px solid rgba(255,184,77,0.38)',
          fontSize: 8, fontWeight: 700, color: C.amber, letterSpacing: '0.12em', textTransform: 'uppercase',
        }}>Optimizada</div>
      </div>

      {/* Map container */}
      <div ref={mapContainerRef} style={{ flex: 1, width: '100%' }} />

      {/* Bottom sheet */}
      {activeOrder && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
          background: 'rgba(9,9,11,0.97)', backdropFilter: 'blur(36px)',
          borderTop: `1px solid ${C.border}`,
          borderRadius: '24px 24px 0 0',
          padding: '12px 16px 44px',
        }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.12)', margin: '0 auto 16px' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 9, color: C.amber, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 4 }}>
                Próxima · #{activeOrder.orderNumber}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{activeOrder.customerName}</div>
            </div>
            <div style={{ background: C.amberSoft, border: '1px solid rgba(255,184,77,0.28)', borderRadius: 12, padding: '6px 14px', textAlign: 'center' }}>
              <div style={{ fontFamily: C.fontDisplay, fontSize: 20, fontWeight: 700, color: C.amber, lineHeight: 1 }}>
                ${(activeOrder.total || 0).toFixed(0)}
              </div>
              <div style={{ fontSize: 8, color: 'rgba(255,184,77,0.55)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 3 }}>
                pendiente
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, background: 'rgba(255,255,255,0.025)', borderRadius: 12, padding: '10px 12px', border: `1px solid ${C.border}` }}>
            <svg viewBox="0 0 24 24" fill="none" stroke={C.amber} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="13" height="13" style={{ flexShrink: 0 }}>
              <path d="M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            <span style={{ fontSize: 11, color: C.textDim, lineHeight: 1.55 }}>{activeOrder.deliveryAddress}</span>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            {etaMinutes && (
              <div style={{ flexShrink: 0, background: C.surf1, border: `1px solid ${C.border}`, borderRadius: 14, padding: '10px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontFamily: C.fontDisplay, fontSize: 22, fontWeight: 700, color: C.text, lineHeight: 1 }}>{etaMinutes}</div>
                <div style={{ fontSize: 8, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: 4 }}>min</div>
              </div>
            )}
            <button
              onClick={() => {
                // En Capacitor: usar @capacitor/app-launcher para abrir Maps nativo
                const url = `https://maps.google.com/?q=${encodeURIComponent(activeOrder.deliveryAddress)}`;
                window.open(url, '_blank');
              }}
              style={{ ...S.btnPrimary, flex: 1, height: 60, borderRadius: 16 }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="17" height="17">
                <polygon points="3 11 22 2 13 21 11 13 3 11"/>
              </svg>
              INICIAR NAVEGACIÓN
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
