"use client";
// DeliveryZoneMap.tsx — Editor de polígonos de zonas de entrega.
// Leaflet + OpenStreetMap por CDN (mismo patrón que MapLocationPicker/rastreo):
// gratis, sin token. Se dibuja tocando el mapa para agregar vértices; cada
// vértice es arrastrable. Las demás zonas guardadas se muestran de contexto.
//
// Controlado: recibe `value` (array de vértices) y emite `onChange`.

import { useEffect, useRef } from "react";

const LEAFLET_VER = "1.9.4";
const OSM_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTR = "© OpenStreetMap";

type LatLng = { lat: number; lng: number };

function loadLeaflet(): Promise<any> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return;
    const w = window as any;
    if (w.L) return resolve(w.L);

    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = `https://cdnjs.cloudflare.com/ajax/libs/leaflet/${LEAFLET_VER}/leaflet.min.css`;
      document.head.appendChild(link);
    }
    let script = document.getElementById("leaflet-js") as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = "leaflet-js";
      script.src = `https://cdnjs.cloudflare.com/ajax/libs/leaflet/${LEAFLET_VER}/leaflet.min.js`;
      document.head.appendChild(script);
    }
    const done = () => w.L && resolve(w.L);
    if (w.L) done();
    else script.addEventListener("load", done);
  });
}

export function DeliveryZoneMap({
  value,
  onChange,
  otherZones = [],
  color = "#22c55e",
  height = 380,
  center = { lat: 19.4326, lng: -99.1332 },
}: {
  value: LatLng[];
  onChange: (poly: LatLng[]) => void;
  otherZones?: { polygon: LatLng[]; color: string }[];
  color?: string;
  height?: number | string;
  center?: LatLng;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const draftLayerRef = useRef<any>(null);
  const vertexLayerRef = useRef<any>(null);
  const othersLayerRef = useRef<any>(null);

  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const colorRef = useRef(color);
  colorRef.current = color;

  function redrawDraft() {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || !vertexLayerRef.current) return;
    const poly = valueRef.current;
    const col = colorRef.current;
    if (draftLayerRef.current) { draftLayerRef.current.remove(); draftLayerRef.current = null; }
    vertexLayerRef.current.clearLayers();

    if (poly.length >= 2) {
      draftLayerRef.current = L.polygon(poly.map((p) => [p.lat, p.lng]), {
        color: col, weight: 2, fillColor: col, fillOpacity: 0.25,
      }).addTo(map);
    }
    poly.forEach((p, i) => {
      const icon = L.divIcon({
        html: `<div style="width:14px;height:14px;border-radius:50%;background:${col};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)"></div>`,
        className: "", iconSize: [14, 14], iconAnchor: [7, 7],
      });
      const mk = L.marker([p.lat, p.lng], { icon, draggable: true }).addTo(vertexLayerRef.current);
      mk.on("dragend", () => {
        const ll = mk.getLatLng();
        const next = valueRef.current.slice();
        next[i] = { lat: ll.lat, lng: ll.lng };
        onChangeRef.current(next);
      });
    });
  }

  function redrawOthers(zones: { polygon: LatLng[]; color: string }[]) {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || !othersLayerRef.current) return;
    othersLayerRef.current.clearLayers();
    zones.forEach((z) => {
      if (Array.isArray(z.polygon) && z.polygon.length >= 3) {
        L.polygon(z.polygon.map((p) => [p.lat, p.lng]), {
          color: z.color, weight: 1, fillColor: z.color, fillOpacity: 0.1, dashArray: "5",
        }).addTo(othersLayerRef.current);
      }
    });
  }

  // Init una sola vez.
  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      LRef.current = L;
      const start = valueRef.current[0] || center;
      const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true })
        .setView([start.lat, start.lng], 13);
      L.tileLayer(OSM_TILES, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(map);
      othersLayerRef.current = L.layerGroup().addTo(map);
      vertexLayerRef.current = L.layerGroup().addTo(map);
      map.on("click", (e: any) => {
        onChangeRef.current([...valueRef.current, { lat: e.latlng.lat, lng: e.latlng.lng }]);
      });
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 0);
      redrawOthers(otherZones);
      redrawDraft();
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      draftLayerRef.current = null;
      vertexLayerRef.current = null;
      othersLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redibujar el borrador cuando cambian los vértices o el color.
  useEffect(() => {
    redrawDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, color]);

  // Redibujar las zonas de contexto.
  useEffect(() => {
    redrawOthers(otherZones);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherZones]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height, borderRadius: 16, overflow: "hidden", border: "1px solid var(--bd-1)", background: "var(--surf-2)" }}
    />
  );
}
