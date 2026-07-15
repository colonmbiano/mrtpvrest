"use client";
import { useEffect, useState, useRef } from "react";
import {
  MapPin, Megaphone, Home, RotateCw, Crosshair, Navigation,
  Route as RouteIcon, Package, Circle,
} from "lucide-react";
import api from "@/lib/api";
import {
  PageShell, PageHeader, Card, SectionLabel, Pill, Button, Avatar,
  Modal, Field, Input, Select, Textarea, useToast,
} from "@/components/ds";

/* Lee un color del tema desde las CSS vars canónicas para inyectarlo en el
   HTML de los marcadores de Leaflet (divIcon), que no acepta CSS vars.
   Así los marcadores respetan tema/acento sin hex hardcodeado en el fuente;
   el fallback es una palabra clave CSS (solo aplica en SSR, nunca en el
   navegador donde Leaflet corre). */
function markerColor(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export default function RastreoPage() {
  const toast = useToast();
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
    if (!noticeBody.trim()) { toast.error("Escribe un mensaje"); return; }
    setSendingNotice(true);
    try {
      await api.post("/api/delivery/notices", {
        driverId: noticeTarget === "all" ? undefined : noticeTarget,
        title: noticeTitle.trim() || undefined,
        body: noticeBody.trim(),
      });
      setShowNotice(false); setNoticeTitle(""); setNoticeBody(""); setNoticeTarget("all");
      toast.success("Aviso enviado");
    } catch (err: any) { toast.error(err.response?.data?.error || "Error al enviar"); }
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
    if (!navigator.geolocation) { toast.error("Tu navegador no soporta geolocalización"); return; }
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
          toast.success(`Origen guardado: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
        } catch { toast.error("Error al guardar"); }
        finally { setSavingOrigin(false); }
      },
      () => { toast.error("No se pudo obtener la ubicación. Verifica los permisos."); setSavingOrigin(false); },
      { enableHighAccuracy: true }
    );
  }

  async function saveManualOrigin() {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (isNaN(lat) || isNaN(lng)) { toast.error("Coordenadas inválidas"); return; }
    setSavingOrigin(true);
    try {
      await api.put("/api/gps/origin", { lat, lng });
      setOrigin({ lat, lng });
      updateOriginMarker(lat, lng);
      if (mapRef.current) mapRef.current.setView([lat, lng], 15);
      toast.success("Origen actualizado");
    } catch { toast.error("Error al guardar"); }
    finally { setSavingOrigin(false); }
  }

  function updateOriginMarker(lat: number, lng: number) {
    if (!mapRef.current || !leafletRef.current) return;
    const L = leafletRef.current;
    if (originMarkRef.current) originMarkRef.current.remove();
    const originBg = markerColor("--warn", "orange");
    const icon = L.divIcon({
      html: `<div style="background:${originBg};border:3px solid black;border-radius:8px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.5);">🏠</div>`,
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

    // Colores del tema para los marcadores (leídos de CSS vars).
    const onlineColor = markerColor("--ok", "green");
    const offlineColor = markerColor("--tx-mut", "gray");

    // Repartidores
    liveData.drivers?.forEach((d: any) => {
      if (!d.location) return;
      const color = d.online ? onlineColor : offlineColor;
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
    const lineColor = markerColor("--warn", "orange");
    polyRef.current = L.polyline(latlngs, { color: lineColor, weight:4, opacity:0.85 }).addTo(mapRef.current);
    mapRef.current.fitBounds(polyRef.current.getBounds(), { padding:[50,50] });
    if (latlngs.length > 0) {
      const startColor = markerColor("--ok", "green");
      const endColor = markerColor("--err", "red");
      const startIcon = L.divIcon({ html:`<div style="background:${startColor};border-radius:50%;width:14px;height:14px;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`, className:"", iconSize:[14,14], iconAnchor:[7,7]});
      const endIcon   = L.divIcon({ html:`<div style="background:${endColor};border-radius:50%;width:14px;height:14px;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`, className:"", iconSize:[14,14], iconAnchor:[7,7]});
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
    <PageShell>
      <PageHeader
        eyebrow="Logística en vivo"
        title="Rastreo GPS"
        subtitle={`${onlineCount} en línea · actualiza cada 30s`}
        actions={
          <>
            <Button variant="secondary" icon={Megaphone} onClick={() => setShowNotice(true)}>Enviar aviso</Button>
            <Button
              variant={showOriginPanel ? "primary" : "secondary"}
              icon={Home}
              onClick={() => setShowOriginPanel(p => !p)}
            >
              Configurar origen
            </Button>
            <button
              type="button" onClick={fetchLive} aria-label="Refrescar"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-ds-md text-tx-mut"
              style={{ background: "var(--surf-1)", border: "1px solid var(--bd-2)" }}
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
            className="grid h-10 w-10 place-items-center rounded-ds-md"
            style={{ background: "var(--accent-soft)", color: "var(--brand-primary)" }}
          >
            <Megaphone size={17} />
          </button>
          <button
            type="button" onClick={() => setShowOriginPanel(p => !p)} aria-label="Configurar origen"
            className="grid h-10 w-10 place-items-center rounded-ds-md"
            style={{
              background: showOriginPanel ? "var(--brand-primary)" : "var(--accent-soft)",
              color: showOriginPanel ? "var(--accent-contrast)" : "var(--brand-primary)",
            }}
          >
            <Home size={17} />
          </button>
          <button
            type="button" onClick={fetchLive} aria-label="Refrescar"
            className="grid h-10 w-10 place-items-center rounded-ds-md text-tx-mut"
            style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}
          >
            <RotateCw size={17} />
          </button>
        </div>
      </div>

      {/* Panel configurar origen */}
      {showOriginPanel && (
        <Card className="mb-4 p-4 md:p-5">
          <div className="flex flex-col gap-5 md:flex-row md:flex-wrap md:items-start">
            {/* Botón capturar ubicación actual */}
            <div>
              <SectionLabel>Desde este dispositivo (TPV)</SectionLabel>
              <Button
                icon={Crosshair}
                onClick={captureCurrentLocation}
                disabled={savingOrigin}
              >
                {savingOrigin ? "Obteniendo…" : "Usar mi ubicación actual"}
              </Button>
              <p className="mt-2 text-[11px] text-tx-mut">
                Abre desde el dispositivo del TPV para mayor precisión
              </p>
            </div>

            {/* O ingresar manualmente */}
            <div className="flex-1" style={{ minWidth: "280px" }}>
              <SectionLabel>O ingresar coordenadas manualmente</SectionLabel>
              <div className="flex items-end gap-2">
                <Field label="Latitud" className="mb-0 flex-1">
                  <Input value={manualLat} onChange={e => setManualLat(e.target.value)} placeholder="19.2826" />
                </Field>
                <Field label="Longitud" className="mb-0 flex-1">
                  <Input value={manualLng} onChange={e => setManualLng(e.target.value)} placeholder="-99.6557" />
                </Field>
                <Button variant="secondary" onClick={saveManualOrigin} disabled={savingOrigin}>
                  {savingOrigin ? "…" : "Guardar"}
                </Button>
              </div>
            </div>

            {/* Origen actual */}
            {origin && (
              <div className="rounded-ds-md px-4 py-3"
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
        </Card>
      )}

      {/* Layout principal: panel + mapa */}
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* Panel izquierdo */}
        <div className="flex flex-col gap-4">
          {/* Repartidores */}
          <Card className="p-3">
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
                      className="flex min-h-14 w-full items-center gap-3 rounded-ds-lg px-3 text-left transition-colors"
                      style={{
                        background: isSel ? "var(--accent-soft)" : "var(--surf-2)",
                        border: `1px solid ${isSel ? "var(--brand-primary)" : "var(--bd-1)"}`,
                      }}>
                      <Avatar initials={initials} size={36} />
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
          </Card>

          {/* Rutas del repartidor seleccionado */}
          {selected && (
            <Card className="p-3">
              <SectionLabel>Rutas — {selected.driver.name}</SectionLabel>
              {routes.length === 0 ? (
                <div className="py-4 text-center text-xs text-tx-mut">Sin rutas registradas</div>
              ) : (
                <div className="ds-scrollbar flex max-h-[340px] flex-col gap-1.5 overflow-y-auto">
                  {routes.map((route: any) => {
                    const isSel = selectedRoute?.id === route.id;
                    return (
                      <button key={route.id}
                        onClick={() => fetchRoutePoints(selected.driver.id, route.id)}
                        className="w-full rounded-ds-lg px-3 py-2.5 text-left transition-colors"
                        style={{
                          background: isSel ? "var(--accent-soft)" : "var(--surf-2)",
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
                          {new Date(route.startAt).toLocaleDateString('es-MX', { timeZone: "America/Mexico_City", day: 'numeric', month: 'short' })}
                          {" "}
                          {new Date(route.startAt).toLocaleTimeString('es-MX', { timeZone: "America/Mexico_City", hour: '2-digit', minute: '2-digit' })}
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
            </Card>
          )}
        </div>

        {/* Mapa — NO tocar lógica Leaflet, solo el contenedor */}
        <Card className="relative overflow-hidden p-0">
          <div id="driver-map" className="h-[62vh] min-h-[340px] w-full lg:h-[640px]" />
          {!mapReady && (
            <div className="absolute inset-0 grid place-items-center" style={{ background: "var(--surf-1)" }}>
              <div className="text-center">
                <MapPin size={34} className="mx-auto mb-3 animate-pulse text-tx-mut" />
                <div className="text-sm text-tx-mut">Cargando mapa…</div>
              </div>
            </div>
          )}
          {selectedRoute && routePoints.length > 0 && (
            <div className="absolute inset-x-3 bottom-3 z-[400] rounded-ds-lg p-3 text-xs md:inset-x-auto md:bottom-auto md:right-4 md:top-4"
              style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", boxShadow: "var(--shadow-lg)" }}>
              <div className="mb-1 flex items-center gap-1.5 font-bold text-tx">
                <RouteIcon size={13} className="text-primary" />
                {selectedRoute.trigger === "ORDER_ASSIGNED" ? "Ruta de pedido" : "Ruta manual"}
              </div>
              <div className="text-tx-mut">
                {new Date(selectedRoute.startAt).toLocaleString('es-MX', { timeZone: "America/Mexico_City", day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
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
        </Card>
      </div>

      {/* Modal — Enviar aviso a repartidores */}
      <Modal
        open={showNotice}
        onClose={() => !sendingNotice && setShowNotice(false)}
        title="Enviar aviso"
        subtitle="El repartidor lo recibe al instante en su app."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowNotice(false)} disabled={sendingNotice}>Cancelar</Button>
            <Button icon={Navigation} onClick={sendNotice} disabled={sendingNotice || !noticeBody.trim()}>
              {sendingNotice ? "Enviando…" : "Enviar"}
            </Button>
          </>
        }
      >
        <Field label="Destino">
          <Select value={noticeTarget} onChange={e => setNoticeTarget(e.target.value)}>
            <option value="all">Todos los repartidores</option>
            {liveData?.drivers?.map((d: any) => (
              <option key={d.driver.id} value={d.driver.id}>{d.driver.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Título (opcional)">
          <Input value={noticeTitle} onChange={e => setNoticeTitle(e.target.value)} placeholder="Ej. Cambio de turno" />
        </Field>
        <Field label="Mensaje">
          <Textarea value={noticeBody} onChange={e => setNoticeBody(e.target.value)}
            placeholder="Escribe el aviso aquí…" rows={4} maxLength={1000} />
        </Field>
      </Modal>
    </PageShell>
  );
}
