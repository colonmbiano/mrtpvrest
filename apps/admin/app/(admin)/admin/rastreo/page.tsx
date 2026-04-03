"use client";
import { useEffect, useState, useRef } from "react";
import api from "@/lib/api";

export default function RastreoPage() {
  const [liveData, setLiveData]       = useState<any>(null);
  const [selected, setSelected]       = useState<any>(null);
  const [routes, setRoutes]           = useState<any[]>([]);
  const [routePoints, setRoutePoints] = useState<any[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<any>(null);
  const [loading, setLoading]         = useState(true);
  const [mapReady, setMapReady]       = useState(false);
  const [origin, setOrigin]           = useState<{lat:number,lng:number}|null>(null);
  const [savingOrigin, setSavingOrigin] = useState(false);
  const [showOriginPanel, setShowOriginPanel] = useState(false);
  const [manualLat, setManualLat]     = useState("");
  const [manualLng, setManualLng]     = useState("");

  const mapRef     = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const polyRef    = useRef<any>(null);
  const originMarkRef = useRef<any>(null);

  async function fetchLive() {
    try {
      const { data } = await api.get("/api/gps/live");
      setLiveData(data);
      if (data.origin && !origin) {
        setOrigin(data.origin);
        setManualLat(String(data.origin.lat));
        setManualLng(String(data.origin.lng));
      }
    } catch {} finally { setLoading(false); }
  }

  async function fetchRoutes(driverId: string) {
    try {
      const { data } = await api.get(`/api/gps/${driverId}/routes`);
      setRoutes(data);
    } catch {}
  }

  async function fetchRoutePoints(driverId: string, routeId: string) {
    try {
      const { data } = await api.get(`/api/gps/${driverId}/route/${routeId}/points`);
      setSelectedRoute(data.route);
      setRoutePoints(data.points);
      drawRoute(data.points);
    } catch {}
  }

  // Capturar ubicación actual del admin (TPV principal)
  async function captureCurrentLocation() {
    if (!navigator.geolocation) { alert("Tu navegador no soporta geolocalización"); return; }
    setSavingOrigin(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        try {
          await api.put("/api/gps/origin", { lat, lng });
          setOrigin({ lat, lng });
          setManualLat(String(lat));
          setManualLng(String(lng));
          updateOriginMarker(lat, lng);
          alert(`✅ Origen guardado: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
        } catch { alert("Error al guardar"); }
        finally { setSavingOrigin(false); }
      },
      () => { alert("No se pudo obtener la ubicación. Verifica los permisos."); setSavingOrigin(false); },
      { enableHighAccuracy: true }
    );
  }

  async function saveManualOrigin() {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (isNaN(lat) || isNaN(lng)) { alert("Coordenadas inválidas"); return; }
    setSavingOrigin(true);
    try {
      await api.put("/api/gps/origin", { lat, lng });
      setOrigin({ lat, lng });
      updateOriginMarker(lat, lng);
      if (mapRef.current) mapRef.current.setView([lat, lng], 15);
      alert("✅ Origen actualizado");
    } catch { alert("Error al guardar"); }
    finally { setSavingOrigin(false); }
  }

  function updateOriginMarker(lat: number, lng: number) {
    if (!mapRef.current || !leafletRef.current) return;
    const L = leafletRef.current;
    if (originMarkRef.current) originMarkRef.current.remove();
    const icon = L.divIcon({
      html: `<div style="background:#f5a623;border:3px solid #000;border-radius:8px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.5);">🏠</div>`,
      className: "", iconSize:[28,28], iconAnchor:[14,14]
    });
    originMarkRef.current = L.marker([lat, lng], { icon })
      .addTo(mapRef.current)
      .bindPopup("<b>🏠 Restaurante (Origen)</b><br/>Punto de partida de repartidores");
  }

  // Inicializar mapa Leaflet
  useEffect(() => {
    if (typeof window === "undefined") return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    script.onload = () => {
      setTimeout(() => {
        const L = (window as any).L;
        leafletRef.current = L;
        const map = L.map("driver-map").setView([19.2826, -99.6557], 13);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap"
        }).addTo(map);
        mapRef.current = map;
        setMapReady(true);
      }, 300);
    };
    document.head.appendChild(script);
    return () => { mapRef.current?.remove(); };
  }, []);

  // Actualizar marcadores de repartidores
  useEffect(() => {
    if (!mapReady || !liveData || !mapRef.current) return;
    const L = leafletRef.current;

    // Limpiar solo marcadores de repartidores
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // Origen
    if (liveData.origin) updateOriginMarker(liveData.origin.lat, liveData.origin.lng);

    // Repartidores
    liveData.drivers?.forEach((d: any) => {
      if (!d.location) return;
      const color = d.online ? "#22c55e" : "#6b7280";
      const icon = L.divIcon({
        html: `<div style="background:${color};border:3px solid white;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 8px rgba(0,0,0,0.4);">🛵</div>`,
        className: "", iconSize:[36,36], iconAnchor:[18,18]
      });
      const age = Math.round((Date.now() - new Date(d.location.createdAt).getTime()) / 60000);
      const m = L.marker([d.location.lat, d.location.lng], { icon })
        .addTo(mapRef.current)
        .bindPopup(`<b>${d.driver.name}</b><br/>${d.online ? "🟢 En línea" : "⚫ Sin señal"}<br/>Última señal: hace ${age} min${d.activeRoute ? "<br/>📍 Ruta activa" : ""}`);
      markersRef.current.push(m);
    });
  }, [liveData, mapReady]);

  function drawRoute(points: any[]) {
    if (!mapReady || !mapRef.current || points.length === 0) return;
    const L = leafletRef.current;
    if (polyRef.current) polyRef.current.remove();
    const latlngs = points.map(p => [p.lat, p.lng]);
    polyRef.current = L.polyline(latlngs, { color:"#f5a623", weight:4, opacity:0.85 }).addTo(mapRef.current);
    mapRef.current.fitBounds(polyRef.current.getBounds(), { padding:[50,50] });
    if (latlngs.length > 0) {
      const startIcon = L.divIcon({ html:'<div style="background:#22c55e;border-radius:50%;width:14px;height:14px;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>', className:"", iconSize:[14,14], iconAnchor:[7,7]});
      const endIcon   = L.divIcon({ html:'<div style="background:#ef4444;border-radius:50%;width:14px;height:14px;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>', className:"", iconSize:[14,14], iconAnchor:[7,7]});
      L.marker(latlngs[0], { icon: startIcon }).addTo(mapRef.current).bindPopup("🟢 Inicio de ruta");
      L.marker(latlngs[latlngs.length-1], { icon: endIcon }).addTo(mapRef.current).bindPopup("🔴 Fin de ruta");
    }
  }

  useEffect(() => {
    fetchLive();
    const t = setInterval(fetchLive, 30000);
    return () => clearInterval(t);
  }, []);

  function formatDur(start: string, end: string|null) {
    if (!end) return "En curso";
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const h = Math.floor(ms/3600000); const m = Math.floor((ms%3600000)/60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden"
      style={{marginLeft:"-2rem",marginRight:"-2rem",marginTop:"-2rem"}}>

      {/* Header */}
      <div className="px-6 py-3 flex items-center justify-between border-b flex-shrink-0"
        style={{background:"var(--surf)",borderColor:"var(--border)"}}>
        <div>
          <h1 className="font-syne text-xl font-black">📍 Rastreo GPS</h1>
          <p className="text-xs" style={{color:"var(--muted)"}}>
            {liveData?.drivers?.filter((d:any) => d.online).length || 0} en línea · actualiza cada 30s
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowOriginPanel(p => !p)}
            className="px-3 py-2 rounded-xl text-xs font-bold"
            style={{
              background: showOriginPanel ? "var(--gold)" : "rgba(245,166,35,0.1)",
              color: showOriginPanel ? "#000" : "var(--gold)",
              border:"1px solid rgba(245,166,35,0.3)"
            }}>
            🏠 Configurar origen
          </button>
          <button onClick={fetchLive} className="px-3 py-2 rounded-xl text-xs font-bold border"
            style={{borderColor:"var(--border)",color:"var(--muted)"}}>🔄</button>
        </div>
      </div>

      {/* Panel configurar origen */}
      {showOriginPanel && (
        <div className="px-6 py-4 border-b flex-shrink-0"
          style={{background:"rgba(245,166,35,0.05)",borderColor:"rgba(245,166,35,0.2)"}}>
          <div className="flex items-start gap-6 flex-wrap">
            {/* Botón capturar ubicación actual */}
            <div>
              <div className="text-xs font-black uppercase tracking-wider mb-2" style={{color:"var(--gold)"}}>
                Desde este dispositivo (TPV)
              </div>
              <button onClick={captureCurrentLocation} disabled={savingOrigin}
                className="px-5 py-3 rounded-xl text-sm font-bold flex items-center gap-2"
                style={{background:"var(--gold)",color:"#000"}}>
                {savingOrigin ? "Obteniendo..." : "📍 Usar mi ubicación actual"}
              </button>
              <p className="text-xs mt-1" style={{color:"var(--muted)"}}>
                Abre desde el dispositivo del TPV para mayor precisión
              </p>
            </div>

            {/* O ingresar manualmente */}
            <div className="flex-1" style={{minWidth:"280px"}}>
              <div className="text-xs font-black uppercase tracking-wider mb-2" style={{color:"var(--muted)"}}>
                O ingresar coordenadas manualmente
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="text-xs mb-1 block" style={{color:"var(--muted)"}}>Latitud</label>
                  <input value={manualLat} onChange={e => setManualLat(e.target.value)}
                    placeholder="19.2826"
                    className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                    style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
                </div>
                <div className="flex-1">
                  <label className="text-xs mb-1 block" style={{color:"var(--muted)"}}>Longitud</label>
                  <input value={manualLng} onChange={e => setManualLng(e.target.value)}
                    placeholder="-99.6557"
                    className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                    style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
                </div>
                <button onClick={saveManualOrigin} disabled={savingOrigin}
                  className="px-4 py-2 rounded-xl text-sm font-bold"
                  style={{background:"var(--surf2)",color:"var(--muted)",border:"1px solid var(--border)"}}>
                  {savingOrigin ? "..." : "Guardar"}
                </button>
              </div>
            </div>

            {/* Origen actual */}
            {origin && (
              <div className="rounded-xl px-4 py-3" style={{background:"var(--surf2)"}}>
                <div className="text-xs font-bold mb-1" style={{color:"var(--muted)"}}>Origen actual</div>
                <div className="font-mono text-xs">{origin.lat.toFixed(6)}</div>
                <div className="font-mono text-xs">{origin.lng.toFixed(6)}</div>
                <button onClick={() => { if(mapRef.current && origin) mapRef.current.setView([origin.lat, origin.lng], 17); }}
                  className="text-xs mt-1" style={{color:"var(--gold)"}}>
                  Ver en mapa →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Panel izquierdo */}
        <div className="w-72 flex-shrink-0 border-r flex flex-col overflow-hidden"
          style={{borderColor:"var(--border)",background:"var(--surf)"}}>

          <div className="p-3 border-b flex-shrink-0" style={{borderColor:"var(--border)"}}>
            <div className="text-xs font-black uppercase tracking-wider mb-2" style={{color:"var(--muted)"}}>Repartidores</div>
            {loading ? (
              <div className="text-xs text-center py-4" style={{color:"var(--muted)"}}>Cargando...</div>
            ) : !liveData?.drivers?.length ? (
              <div className="text-xs text-center py-4" style={{color:"var(--muted)"}}>Sin repartidores activos</div>
            ) : liveData.drivers.map((d: any) => (
              <button key={d.driver.id}
                onClick={async () => {
                  setSelected(d); setRoutePoints([]); setSelectedRoute(null);
                  if (polyRef.current) { polyRef.current.remove(); polyRef.current = null; }
                  await fetchRoutes(d.driver.id);
                  if (d.location && mapRef.current) mapRef.current.setView([d.location.lat, d.location.lng], 15);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl mb-1 text-left"
                style={{
                  background: selected?.driver?.id===d.driver.id ? "rgba(245,166,35,0.1)" : "var(--surf2)",
                  border:`1px solid ${selected?.driver?.id===d.driver.id ? "var(--gold)" : "var(--border)"}`
                }}>
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background: d.online ? "#22c55e" : "#6b7280"}} />
                {d.driver.photo
                  ? <img src={d.driver.photo} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                  : <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{background:"var(--surf)"}}>🛵</div>
                }
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate">{d.driver.name}</div>
                  <div className="text-xs" style={{color:"var(--muted)"}}>
                    {d.online ? "🟢 En línea" : "⚫ Sin señal"}
                    {d.activeRoute ? " · Ruta activa" : ""}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Rutas del repartidor seleccionado */}
          {selected && (
            <div className="flex-1 overflow-y-auto p-3">
              <div className="text-xs font-black uppercase tracking-wider mb-2" style={{color:"var(--muted)"}}>
                Rutas — {selected.driver.name}
              </div>
              {routes.length === 0 ? (
                <div className="text-xs text-center py-4" style={{color:"var(--muted)"}}>Sin rutas registradas</div>
              ) : routes.map((route: any) => (
                <button key={route.id}
                  onClick={() => fetchRoutePoints(selected.driver.id, route.id)}
                  className="w-full text-left px-3 py-2 rounded-xl mb-1 border"
                  style={{
                    background: selectedRoute?.id===route.id ? "rgba(245,166,35,0.1)" : "var(--surf2)",
                    borderColor: selectedRoute?.id===route.id ? "var(--gold)" : "var(--border)"
                  }}>
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="text-xs font-bold">
                      {route.trigger==="ORDER_ASSIGNED" ? "📦 Pedido" : "📍 Manual"}
                    </div>
                    <div className="text-xs" style={{color:"var(--muted)"}}>{formatDur(route.startAt, route.endAt)}</div>
                  </div>
                  <div className="text-xs" style={{color:"var(--muted)"}}>
                    {new Date(route.startAt).toLocaleDateString('es-MX',{day:'numeric',month:'short'})}
                    {" "}
                    {new Date(route.startAt).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}
                    {" · "}{route.points} pts
                  </div>
                  {!route.endAt && (
                    <div className="text-xs font-bold mt-0.5" style={{color:"#22c55e"}}>● En curso</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Mapa */}
        <div className="flex-1 relative">
          <div id="driver-map" className="w-full h-full" />
          {!mapReady && (
            <div className="absolute inset-0 flex items-center justify-center" style={{background:"var(--bg)"}}>
              <div className="text-center">
                <div className="text-4xl mb-3 animate-pulse">🗺️</div>
                <div className="text-sm" style={{color:"var(--muted)"}}>Cargando mapa...</div>
              </div>
            </div>
          )}
          {selectedRoute && routePoints.length > 0 && (
            <div className="absolute top-4 right-4 rounded-xl border p-3 text-xs z-10"
              style={{background:"var(--surf)",borderColor:"var(--border)"}}>
              <div className="font-bold mb-1">📍 {selectedRoute.trigger==="ORDER_ASSIGNED" ? "Ruta de pedido" : "Ruta manual"}</div>
              <div style={{color:"var(--muted)"}}>
                {new Date(selectedRoute.startAt).toLocaleString('es-MX',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}
              </div>
              <div style={{color:"var(--muted)"}}>{routePoints.length} puntos GPS</div>
              <div style={{color:"var(--gold)"}}>{formatDur(selectedRoute.startAt, selectedRoute.endAt)}</div>
              <div className="flex gap-3 mt-1">
                <span style={{color:"#22c55e"}}>🟢 Inicio</span>
                <span style={{color:"#ef4444"}}>🔴 Fin</span>
              </div>
              <button onClick={() => { if(polyRef.current && mapRef.current) mapRef.current.fitBounds(polyRef.current.getBounds(),{padding:[50,50]}); }}
                className="mt-2 text-xs font-bold" style={{color:"var(--gold)"}}>
                Centrar ruta →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}