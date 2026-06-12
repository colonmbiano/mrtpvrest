'use client';
// MapScreen.tsx — Mapa de ruta del repartidor.
// Leaflet + OpenStreetMap (tiles oscuros de CARTO) + ruta/ETA por OSRM público.
// Gratis, sin cuenta ni token. Mismo enfoque que apps/admin/.../rastreo (Leaflet por CDN).
// Migrado desde Mapbox GL para eliminar la dependencia de cuenta/token externa.

import React, { useEffect, useRef, useState } from 'react';
import { C, S } from '@/lib/tokens';

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

// Tiles oscuros gratuitos (CARTO sobre datos OSM) — alineados con el design system.
const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTR = '© OpenStreetMap © CARTO';
const LEAFLET_VER = '1.9.4';

// ── Markers como divIcon HTML (mismo look que la versión Mapbox) ──
function driverMarkerHTML(): string {
  return `<div style="width:48px;height:48px;border-radius:50%;background:rgba(167,139,250,0.95);
    border:3px solid rgba(255,255,255,0.9);box-shadow:0 0 24px rgba(167,139,250,0.7);
    display:flex;align-items:center;justify-content:center;font-size:22px;">🏍</div>`;
}

function orderMarkerHTML(label: string | number, color: string): string {
  return `<div style="width:36px;height:36px;border-radius:50%;background:${color};
    border:2.5px solid rgba(255,255,255,0.9);box-shadow:0 4px 16px rgba(0,0,0,0.5),0 0 20px ${color}60;
    display:flex;align-items:center;justify-content:center;color:#090909;font-weight:800;
    font-family:'Outfit',system-ui,sans-serif;font-size:13px;cursor:pointer;">${label}</div>`;
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
  const mapRef          = useRef<any>(null);
  const leafletRef      = useRef<any>(null);
  const groupRef        = useRef<any>(null); // capa de markers + ruta (se limpia y repuebla)
  const [mapReady, setMapReady] = useState(false);
  const activeOrder     = orders.find(o => o.status === 'ON_THE_WAY') || orders[0];
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);

  // 1) Cargar Leaflet (CDN) y crear el mapa — una sola vez.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;

    function init() {
      const L = (window as any).L;
      if (!L || !mapContainerRef.current || mapRef.current) return;
      leafletRef.current = L;
      const map = L.map(mapContainerRef.current, { zoomControl: false, attributionControl: true })
        .setView([driverLat, driverLng], 14);
      L.tileLayer(DARK_TILES, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(map);
      groupRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      // El contenedor flex puede no tener tamaño en el primer tick.
      setTimeout(() => map.invalidateSize(), 0);
      if (!cancelled) setMapReady(true);
    }

    // Ya cargado (otra pantalla lo inyectó) → init directo.
    if ((window as any).L) {
      init();
      return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
    }

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
    const onLoad = () => setTimeout(init, 200);
    if ((window as any).L) init();
    else script.addEventListener('load', onLoad);

    return () => {
      cancelled = true;
      script?.removeEventListener('load', onLoad);
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) Markers + ruta — al estar listo o cambiar los datos.
  useEffect(() => {
    if (!mapReady) return;
    const L = leafletRef.current;
    const map = mapRef.current;
    const group = groupRef.current;
    if (!L || !map || !group) return;

    group.clearLayers();

    // Repartidor
    const driverIcon = L.divIcon({ html: driverMarkerHTML(), className: '', iconSize: [48, 48], iconAnchor: [24, 24] });
    L.marker([driverLat, driverLng], { icon: driverIcon }).addTo(group);

    // Pedidos
    orders.forEach((order, idx) => {
      if (order.lat == null || order.lng == null) return;
      const markerColor = order.status === 'ON_THE_WAY' ? '#FFB84D' : '#A78BFA';
      const icon = L.divIcon({ html: orderMarkerHTML(idx + 1, markerColor), className: '', iconSize: [36, 36], iconAnchor: [18, 18] });
      L.marker([order.lat, order.lng], { icon })
        .addTo(group)
        .bindPopup(popupHTML(order), { closeButton: false });
    });

    // Ruta (OSRM público, GeoJSON, sin key) → línea + ETA.
    const active = orders.find(o => o.status === 'ON_THE_WAY' && o.lat != null && o.lng != null);
    if (active?.lat != null && active?.lng != null) {
      const url =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${driverLng},${driverLat};${active.lng},${active.lat}` +
        `?overview=full&geometries=geojson`;
      fetch(url)
        .then(r => r.json())
        .then(data => {
          const route = data.routes?.[0];
          if (!route || !mapRef.current) return;
          setEtaMinutes(Math.round(route.duration / 60));
          // GeoJSON viene como [lng,lat]; Leaflet usa [lat,lng].
          const latlngs = route.geometry.coordinates.map((c: number[]) => [c[1], c[0]]);
          L.polyline(latlngs, { color: '#FFB84D', weight: 16, opacity: 0.12 }).addTo(group); // glow
          const main = L.polyline(latlngs, { color: '#FFB84D', weight: 4.5, opacity: 0.9 }).addTo(group);
          try { map.fitBounds(main.getBounds(), { padding: [60, 60], maxZoom: 15 }); } catch { /* noop */ }
        })
        .catch(() => { /* Sin ruta — modo sin conexión */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, orders, driverLat, driverLng]);

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
