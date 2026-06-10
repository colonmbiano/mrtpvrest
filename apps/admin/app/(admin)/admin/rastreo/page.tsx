"use client";
import { useEffect, useState, useRef } from "react";
import {
  MapPin, Megaphone, Home, RotateCw, X, Crosshair, Navigation,
  Bike, Route as RouteIcon, Package, Circle,
} from "lucide-react";
import api from "@/lib/api";
import {
  WtScreen, PageHeader, WtCard, SectionLabel, Pill, PrimaryBtn, Avatar,
} from "@/components/warmtech";

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

  // Compositor de avisos a repartidores
  const [showNotice, setShowNotice]     = useState(false);
  const [noticeTarget, setNoticeTarget] = useState<string>("all");
  const [noticeTitle, setNoticeTitle]   = useState("");
  const [noticeBody, setNoticeBody]     = useState("");
  const [sendingNotice, setSendingNotice] = useState(false);

  async function sendNotice() {
    if (!noticeBody.trim()) { alert("Escribe un mensaje"); return; }
    setSendingNotice(true);
    try {
      await api.post("/api/delivery/notices", {
        driverId: noticeTarget === "all" ? undefined : noticeTarget,
        title: noticeTitle.trim() || undefined,
        body: noticeBody.trim(),
      });
      setShowNotice(false); setNoticeTitle(""); setNoticeBody(""); setNoticeTarget("all");
      alert("Aviso enviado");
    } catch (err: any) { alert(err.response?.data?.error || "Error al enviar"); }
    finally { setSendingNotice(false); }
  }

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
          alert(`Origen guardado: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
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
      alert("Origen actualizado");
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

  const onlineCount = liveData?.drivers?.filter((d:any) => d.online).length || 0;

  return (
    <WtScreen>
      <PageHeader
        eyebrow="Logística en vivo"
        title="Rastreo GPS"
        subtitle={`${onlineCount} en línea · actualiza cada 30s`}
        actions={
          <>
            <PrimaryBtn full={false} ghost icon={Megaphone} onClick={() => setShowNotice(true)}>
              Enviar aviso
            </PrimaryBtn>
            <PrimaryBtn
              full={false}
              ghost={!showOriginPanel}
              icon={Home}
              onClick={() => setShowOriginPanel(p => !p)}
            >
              Configurar origen
            </PrimaryBtn>
            <button
              type="button" onClick={fetchLive} aria-label="Refrescar"
              className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-tx-mut"
              style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}
            >
              <RotateCw size={17} />
            </button>
          </>
        }
      />

      {/* mobile live indicator + acciones */}
      <div className="mb-3 flex flex-wrap items-center gap-2 md:hidden">
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "var(--ok)" }} />
          <span className="text-[11px] text-tx-mut">{onlineCount} en línea · cada 30s</span>
        </span>
        <div className="ml-auto flex gap-2">
          <button
            type="button" onClick={() => setShowNotice(true)} aria-label="Enviar aviso"
            className="grid h-10 w-10 place-items-center rounded-xl"
            style={{ background: "var(--iris-soft)", color: "var(--brand-primary)" }}
          >
            <Megaphone size={17} />
          </button>
          <button
            type="button" onClick={() => setShowOriginPanel(p => !p)} aria-label="Configurar origen"
            className="grid h-10 w-10 place-items-center rounded-xl"
            style={{
              background: showOriginPanel ? "var(--brand-primary)" : "var(--iris-soft)",
              color: showOriginPanel ? "#fffaf4" : "var(--brand-primary)",
            }}
          >
            <Home size={17} />
          </button>
          <button
            type="button" onClick={fetchLive} aria-label="Refrescar"
            className="grid h-10 w-10 place-items-center rounded-xl text-tx-mut"
            style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}
          >
            <RotateCw size={17} />
          </button>
        </div>
      </div>

      {/* Panel configurar origen */}
      {showOriginPanel && (
        <WtCard className="mb-4 p-4 md:p-5">
          <div className="flex flex-col gap-5 md:flex-row md:flex-wrap md:items-start">
            {/* Botón capturar ubicación actual */}
            <div>
              <SectionLabel>Desde este dispositivo (TPV)</SectionLabel>
              <PrimaryBtn
                full={false}
                icon={Crosshair}
                onClick={captureCurrentLocation}
                disabled={savingOrigin}
              >
                {savingOrigin ? "Obteniendo…" : "Usar mi ubicación actual"}
              </PrimaryBtn>
              <p className="mt-2 text-[11px] text-tx-mut">
                Abre desde el dispositivo del TPV para mayor precisión
              </p>
            </div>

            {/* O ingresar manualmente */}
            <div className="flex-1" style={{ minWidth: "280px" }}>
              <SectionLabel>O ingresar coordenadas manualmente</SectionLabel>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-[11px] text-tx-mut">Latitud</label>
                  <input value={manualLat} onChange={e => setManualLat(e.target.value)}
                    placeholder="19.2826"
                    className="min-h-11 w-full rounded-xl px-3 text-sm outline-none"
                    style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }} />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-[11px] text-tx-mut">Longitud</label>
                  <input value={manualLng} onChange={e => setManualLng(e.target.value)}
                    placeholder="-99.6557"
                    className="min-h-11 w-full rounded-xl px-3 text-sm outline-none"
                    style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }} />
                </div>
                <PrimaryBtn full={false} ghost onClick={saveManualOrigin} disabled={savingOrigin}>
                  {savingOrigin ? "…" : "Guardar"}
                </PrimaryBtn>
              </div>
            </div>

            {/* Origen actual */}
            {origin && (
              <div className="rounded-xl px-4 py-3"
                style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
                <div className="mb-1 font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">Origen actual</div>
                <div className="font-mono text-xs text-tx">{origin.lat.toFixed(6)}</div>
                <div className="font-mono text-xs text-tx">{origin.lng.toFixed(6)}</div>
                <button
                  type="button"
                  onClick={() => { if (mapRef.current && origin) mapRef.current.setView([origin.lat, origin.lng], 17); }}
                  className="mt-1.5 flex min-h-9 items-center gap-1 text-xs font-bold text-primary">
                  Ver en mapa →
                </button>
              </div>
            )}
          </div>
        </WtCard>
      )}

      {/* Layout principal: panel + mapa */}
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* Panel izquierdo */}
        <div className="flex flex-col gap-4">
          {/* Repartidores */}
          <WtCard className="p-3">
            <SectionLabel>Repartidores</SectionLabel>
            {loading ? (
              <div className="py-4 text-center text-xs text-tx-mut">Cargando…</div>
            ) : !liveData?.drivers?.length ? (
              <div className="py-4 text-center text-xs text-tx-mut">Sin repartidores activos</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {liveData.drivers.map((d: any) => {
                  const isSel = selected?.driver?.id === d.driver.id;
                  const initials = (d.driver.name || "?").split(" ").map((s: string) => s[0]).slice(0, 2).join("").toUpperCase();
                  return (
                    <button key={d.driver.id}
                      onClick={async () => {
                        setSelected(d); setRoutePoints([]); setSelectedRoute(null);
                        if (polyRef.current) { polyRef.current.remove(); polyRef.current = null; }
                        await fetchRoutes(d.driver.id);
                        if (d.location && mapRef.current) mapRef.current.setView([d.location.lat, d.location.lng], 15);
                      }}
                      className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left transition-colors"
                      style={{
                        background: isSel ? "var(--iris-soft)" : "var(--surf-2)",
                        border: `1px solid ${isSel ? "var(--brand-primary)" : "var(--bd-1)"}`,
                      }}>
                      <Avatar initials={initials} size={36} gradient="linear-gradient(140deg,#5b9ddb,#3f6fb0)" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-bold text-tx">{d.driver.name}</div>
                        <div className="mt-0.5">
                          {d.online ? (
                            <Pill tone="ok" live>{d.activeRoute ? "En ruta" : "En línea"}</Pill>
                          ) : (
                            <Pill tone="neutral">Sin señal</Pill>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </WtCard>

          {/* Rutas del repartidor seleccionado */}
          {selected && (
            <WtCard className="p-3">
              <SectionLabel>Rutas — {selected.driver.name}</SectionLabel>
              {routes.length === 0 ? (
                <div className="py-4 text-center text-xs text-tx-mut">Sin rutas registradas</div>
              ) : (
                <div className="flex max-h-[340px] flex-col gap-1.5 overflow-y-auto warmtech-scrollbar">
                  {routes.map((route: any) => {
                    const isSel = selectedRoute?.id === route.id;
                    return (
                      <button key={route.id}
                        onClick={() => fetchRoutePoints(selected.driver.id, route.id)}
                        className="w-full rounded-2xl px-3 py-2.5 text-left transition-colors"
                        style={{
                          background: isSel ? "var(--iris-soft)" : "var(--surf-2)",
                          border: `1px solid ${isSel ? "var(--brand-primary)" : "var(--bd-1)"}`,
                        }}>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-xs font-bold text-tx">
                            {route.trigger === "ORDER_ASSIGNED"
                              ? <><Package size={13} /> Pedido</>
                              : <><MapPin size={13} /> Manual</>}
                          </span>
                          <span className="font-mono text-[11px] text-tx-mut">{formatDur(route.startAt, route.endAt)}</span>
                        </div>
                        <div className="text-[11px] text-tx-mut">
                          {new Date(route.startAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                          {" "}
                          {new Date(route.startAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                          {" · "}{route.points} pts
                        </div>
                        {!route.endAt && (
                          <div className="mt-1">
                            <Pill tone="ok" live>En curso</Pill>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </WtCard>
          )}
        </div>

        {/* Mapa — NO tocar lógica Leaflet, solo el contenedor */}
        <WtCard className="relative overflow-hidden p-0">
          <div id="driver-map" className="h-[520px] w-full lg:h-[640px]" />
          {!mapReady && (
            <div className="absolute inset-0 grid place-items-center" style={{ background: "var(--surf-1)" }}>
              <div className="text-center">
                <MapPin size={34} className="mx-auto mb-3 animate-pulse text-tx-mut" />
                <div className="text-sm text-tx-mut">Cargando mapa…</div>
              </div>
            </div>
          )}
          {selectedRoute && routePoints.length > 0 && (
            <div className="absolute right-4 top-4 z-[400] rounded-2xl p-3 text-xs"
              style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", boxShadow: "0 8px 24px rgba(0,0,0,.25)" }}>
              <div className="mb-1 flex items-center gap-1.5 font-bold text-tx">
                <RouteIcon size={13} className="text-primary" />
                {selectedRoute.trigger === "ORDER_ASSIGNED" ? "Ruta de pedido" : "Ruta manual"}
              </div>
              <div className="text-tx-mut">
                {new Date(selectedRoute.startAt).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="text-tx-mut">{routePoints.length} puntos GPS</div>
              <div className="font-mono text-primary">{formatDur(selectedRoute.startAt, selectedRoute.endAt)}</div>
              <div className="mt-1.5 flex gap-3">
                <span className="flex items-center gap-1" style={{ color: "var(--ok)" }}><Circle size={9} fill="currentColor" /> Inicio</span>
                <span className="flex items-center gap-1" style={{ color: "var(--err)" }}><Circle size={9} fill="currentColor" /> Fin</span>
              </div>
              <button
                type="button"
                onClick={() => { if (polyRef.current && mapRef.current) mapRef.current.fitBounds(polyRef.current.getBounds(), { padding: [50, 50] }); }}
                className="mt-2 flex min-h-9 items-center gap-1 text-xs font-bold text-primary">
                Centrar ruta →
              </button>
            </div>
          )}
        </WtCard>
      </div>

      {/* Modal — Enviar aviso a repartidores */}
      {showNotice && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.8)" }} onClick={() => !sendingNotice && setShowNotice(false)}>
          <WtCard className="w-full max-w-md p-6">
            <div onClick={e => e.stopPropagation()}>
              <div className="mb-1 flex items-center gap-2">
                <Megaphone size={20} className="text-primary" />
                <h3 className="font-display text-xl font-extrabold text-tx-hi">Enviar aviso</h3>
              </div>
              <p className="mb-4 text-xs text-tx-mut">
                El repartidor lo recibe al instante en su app.
              </p>

              <label className="mb-1 block font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">Destino</label>
              <select value={noticeTarget} onChange={e => setNoticeTarget(e.target.value)}
                className="mb-3 min-h-11 w-full rounded-xl px-3 text-sm outline-none"
                style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}>
                <option value="all">Todos los repartidores</option>
                {liveData?.drivers?.map((d: any) => (
                  <option key={d.driver.id} value={d.driver.id}>{d.driver.name}</option>
                ))}
              </select>

              <label className="mb-1 block font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">Título (opcional)</label>
              <input value={noticeTitle} onChange={e => setNoticeTitle(e.target.value)}
                placeholder="Ej. Cambio de turno"
                className="mb-3 min-h-11 w-full rounded-xl px-3 text-sm outline-none"
                style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }} />

              <label className="mb-1 block font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">Mensaje</label>
              <textarea value={noticeBody} onChange={e => setNoticeBody(e.target.value)}
                placeholder="Escribe el aviso aquí…" rows={4} maxLength={1000}
                className="mb-4 w-full resize-none rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }} />

              <div className="flex gap-3">
                <PrimaryBtn ghost onClick={() => setShowNotice(false)} disabled={sendingNotice}>
                  Cancelar
                </PrimaryBtn>
                <PrimaryBtn icon={Navigation} onClick={sendNotice} disabled={sendingNotice || !noticeBody.trim()}>
                  {sendingNotice ? "Enviando…" : "Enviar"}
                </PrimaryBtn>
              </div>
            </div>
          </WtCard>
        </div>
      )}
    </WtScreen>
  );
}
