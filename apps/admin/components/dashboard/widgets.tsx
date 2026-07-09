"use client";
// Widgets "en vivo" del dashboard (Mi Negocio):
//  - AgentHealthCard: el "cerebro" del agente IA — conexión, conversaciones,
//    pedidos/ventas del bot y lo generado por sugerencias.
//  - PeakHoursHeatmap: mapa de calor de horas pico (día × hora, 28 días).
//  - LiveDeliveryMap: mini-mapa con los repartidores en vivo (GPS real).
// Todos hacen polling propio y fallan en silencio: el dashboard nunca se rompe
// por un widget.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Bot, ChevronRight, Flame, MapPin } from "lucide-react";
import api from "@/lib/api";

const money = (value: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(value || 0);

// ── Salud del agente IA ───────────────────────────────────────────────────────
type AgentHealth = {
  connection: { configured: boolean; enabled: boolean; provider: string | null };
  conversations: { open: number; needsHuman: number; resolved: number; unread: number; inbound24h: number };
  botOrders7d: { count: number; revenue: number };
  upsell: { accepts: number; revenue: number };
};

export function AgentHealthCard() {
  const [health, setHealth] = useState<AgentHealth | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<AgentHealth>("/api/dashboard/agent-health");
      setHealth(data);
    } catch {
      /* silencioso: widget opcional */
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [load]);

  const online = !!health?.connection.enabled;
  const needsHuman = health?.conversations.needsHuman || 0;

  return (
    <section className="warmtech-card flex flex-col p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="relative grid h-10 w-10 place-items-center rounded-[12px] text-primary" style={{ background: "var(--iris-soft)" }}>
            <Bot size={19} />
            {online && (
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full" style={{ background: "var(--ok)", boxShadow: "0 0 0 2px var(--surf-1)" }} />
            )}
          </span>
          <div>
            <div className="font-display text-[15px] font-extrabold text-tx-hi">Salud del agente</div>
            <div className="font-mono text-[9.5px] uppercase tracking-[.12em]" style={{ color: online ? "var(--ok)" : "var(--warn)" }}>
              {!health ? "Consultando…" : online ? `En línea · ${health.connection.provider === "META" ? "Meta" : "Whapi"}` : health.connection.configured ? "Pausado" : "Sin conectar"}
            </div>
          </div>
        </div>
        <Link href="/admin/whatsapp" className="flex min-h-9 items-center gap-1 text-xs font-bold text-primary">
          Configurar <ChevronRight size={14} />
        </Link>
      </div>

      {needsHuman > 0 && (
        <Link
          href="/admin/inbox"
          className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold"
          style={{ background: "var(--err-soft)", color: "var(--err)" }}
        >
          <AlertTriangle size={14} className="shrink-0" />
          {needsHuman === 1 ? "1 conversación necesita tu atención" : `${needsHuman} conversaciones necesitan tu atención`}
          <ChevronRight size={14} className="ml-auto shrink-0" />
        </Link>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link href="/admin/inbox" className="rounded-xl px-3 py-2.5" style={{ background: "var(--surf-2)" }}>
          <div className="font-mono text-[9px] uppercase tracking-[.1em] text-tx-dim">Mensajes 24h</div>
          <div className="font-display text-lg font-extrabold text-tx-hi">
            {health?.conversations.inbound24h ?? "—"}
            {(health?.conversations.unread || 0) > 0 && (
              <span className="ml-1.5 text-xs font-bold" style={{ color: "var(--brand-primary)" }}>{health?.conversations.unread} sin leer</span>
            )}
          </div>
        </Link>
        <div className="rounded-xl px-3 py-2.5" style={{ background: "var(--surf-2)" }}>
          <div className="font-mono text-[9px] uppercase tracking-[.1em] text-tx-dim">Pedidos del bot · 7d</div>
          <div className="font-display text-lg font-extrabold text-tx-hi">{health?.botOrders7d.count ?? "—"}</div>
        </div>
        <div className="rounded-xl px-3 py-2.5" style={{ background: "var(--surf-2)" }}>
          <div className="font-mono text-[9px] uppercase tracking-[.1em] text-tx-dim">Vendido por el bot · 7d</div>
          <div className="font-display text-lg font-extrabold" style={{ color: "var(--ok)" }}>{health ? money(health.botOrders7d.revenue) : "—"}</div>
        </div>
        <Link href="/admin/whatsapp" className="rounded-xl px-3 py-2.5" style={{ background: "var(--surf-2)" }}>
          <div className="font-mono text-[9px] uppercase tracking-[.1em] text-tx-dim">Sugerencias (upsell)</div>
          <div className="font-display text-lg font-extrabold" style={{ color: "var(--brand-primary)" }}>
            {health ? money(health.upsell.revenue) : "—"}
            {(health?.upsell.accepts || 0) > 0 && <span className="ml-1.5 text-xs font-bold text-tx-mut">{health?.upsell.accepts} aceptadas</span>}
          </div>
        </Link>
      </div>
    </section>
  );
}

// ── Mapa de calor de horas pico ───────────────────────────────────────────────
type Heatmap = { grid: number[][]; max: number; total: number; days: number };
const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function PeakHoursHeatmap() {
  const [heatmap, setHeatmap] = useState<Heatmap | null>(null);

  useEffect(() => {
    api
      .get<Heatmap>("/api/dashboard/peak-heatmap")
      .then(({ data }) => setHeatmap(data))
      .catch(() => {});
  }, []);

  return (
    <section className="warmtech-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-[12px] text-primary" style={{ background: "var(--iris-soft)" }}>
            <Flame size={18} />
          </span>
          <div>
            <div className="font-display text-[15px] font-extrabold text-tx-hi">Horas pico</div>
            <div className="font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">Pedidos por día y hora · últimos 28 días</div>
          </div>
        </div>
      </div>

      {!heatmap ? (
        <div className="mt-4 h-32 animate-pulse rounded-xl bg-surf-2" />
      ) : heatmap.total === 0 ? (
        <p className="mt-4 py-4 text-center text-sm text-tx-mut">Aún no hay pedidos suficientes para dibujar tus horas pico.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <div className="min-w-[560px]">
            {heatmap.grid.map((row, dayIndex) => (
              <div key={dayIndex} className="mb-1 flex items-center gap-1">
                <span className="w-8 shrink-0 font-mono text-[9px] font-bold text-tx-dim">{DAY_LABELS[dayIndex]}</span>
                {row.map((count, hour) => {
                  const intensity = heatmap.max > 0 ? count / heatmap.max : 0;
                  return (
                    <span
                      key={hour}
                      title={`${DAY_LABELS[dayIndex]} ${hour}:00 — ${count} pedidos`}
                      className="h-4 flex-1 rounded-[4px]"
                      style={{
                        background:
                          intensity === 0
                            ? "var(--surf-2)"
                            : `color-mix(in srgb, var(--brand-primary) ${Math.max(14, Math.round(intensity * 100))}%, var(--surf-2))`,
                      }}
                    />
                  );
                })}
              </div>
            ))}
            <div className="mt-1 flex items-center gap-1">
              <span className="w-8 shrink-0" />
              {Array.from({ length: 24 }, (_, hour) => (
                <span key={hour} className="flex-1 text-center font-mono text-[8px] text-tx-dim">
                  {hour % 6 === 0 ? `${hour}h` : ""}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-2 flex items-center justify-end gap-1.5 font-mono text-[9px] text-tx-dim">
            menos
            {[0.15, 0.4, 0.7, 1].map((intensity) => (
              <span key={intensity} className="h-3 w-3 rounded-[3px]" style={{ background: `color-mix(in srgb, var(--brand-primary) ${Math.round(intensity * 100)}%, var(--surf-2))` }} />
            ))}
            más
          </div>
        </div>
      )}
    </section>
  );
}

// ── Mapa en vivo de entregas ──────────────────────────────────────────────────
type LiveDriver = {
  driver: { id: string; name: string };
  location: { lat: number; lng: number; createdAt: string } | null;
  online: boolean;
};
type LiveResponse = { drivers: LiveDriver[]; origin: { lat: number; lng: number } };

const LEAFLET_CSS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
const LEAFLET_JS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";

export function LiveDeliveryMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const mapRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const [ready, setReady] = useState(false);
  const [onlineCount, setOnlineCount] = useState<number | null>(null);

  // Carga perezosa de Leaflet desde CDN (mismo enfoque que /admin/rastreo).
  useEffect(() => {
    if ((window as unknown as { L?: unknown }).L) {
      leafletRef.current = (window as unknown as { L: unknown }).L;
      setReady(true);
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = LEAFLET_CSS;
    document.head.appendChild(link);
    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.onload = () => {
      leafletRef.current = (window as unknown as { L: unknown }).L;
      setReady(true);
    };
    document.body.appendChild(script);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get<LiveResponse>("/api/gps/live");
      const drivers = (data.drivers || []).filter((d) => d.location);
      setOnlineCount(drivers.filter((d) => d.online).length);

      const L = leafletRef.current;
      if (!L || !containerRef.current) return;

      if (!mapRef.current) {
        const center = drivers[0]?.location || data.origin || { lat: 19.4326, lng: -99.1332 };
        mapRef.current = L.map(containerRef.current, { zoomControl: false, attributionControl: false }).setView(
          [center.lat, center.lng],
          13
        );
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(mapRef.current);
      }

      markersRef.current.forEach((m) => m.remove());
      markersRef.current = drivers.map((d) =>
        L.circleMarker([d.location!.lat, d.location!.lng], {
          radius: 8,
          color: "#ffffff",
          weight: 2,
          fillColor: d.online ? "#22c55e" : "#94a3b8",
          fillOpacity: 1,
        })
          .bindTooltip(`${d.driver.name}${d.online ? "" : " (sin señal)"}`)
          .addTo(mapRef.current)
      );
      if (drivers.length > 0) {
        mapRef.current.fitBounds(
          L.latLngBounds(drivers.map((d) => [d.location!.lat, d.location!.lng])),
          { padding: [24, 24], maxZoom: 15 }
        );
      }
    } catch {
      /* silencioso */
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [ready, refresh]);

  return (
    <section className="warmtech-card overflow-hidden p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-[12px] text-primary" style={{ background: "var(--iris-soft)" }}>
            <MapPin size={18} />
          </span>
          <div>
            <div className="font-display text-[15px] font-extrabold text-tx-hi">Entregas en vivo</div>
            <div className="font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">
              {onlineCount === null ? "Buscando repartidores…" : onlineCount === 0 ? "Sin repartidores en línea" : `${onlineCount} repartidor${onlineCount === 1 ? "" : "es"} en línea`}
            </div>
          </div>
        </div>
        <Link href="/admin/rastreo" className="flex min-h-9 items-center gap-1 text-xs font-bold text-primary">
          Abrir rastreo <ChevronRight size={14} />
        </Link>
      </div>
      <div ref={containerRef} className="mt-3 h-52 w-full rounded-xl" style={{ background: "var(--surf-2)" }} />
    </section>
  );
}
