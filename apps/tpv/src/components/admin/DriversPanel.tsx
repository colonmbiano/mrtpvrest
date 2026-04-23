"use client";
import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";

// Panel ligero de rastreo para el TPV: lista de repartidores activos con
// estado online, última actividad y ruta en curso. No incluye mapa (está en
// /admin/rastreo del backoffice). El objetivo aquí es glance-info para el
// cajero/gerente durante operación — no exploración cartográfica.

type DriverRow = {
  driver: { id: string; name: string; photo?: string | null };
  location: {
    lat: number;
    lng: number;
    createdAt: string;
  } | null;
  activeRoute: { id: string; startAt: string } | null;
  online: boolean;
};

type LiveResponse = {
  drivers: DriverRow[];
  origin: { lat: number; lng: number } | null;
};

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const la1 = rad(a.lat), la2 = rad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `hace ${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const hr = Math.round(min / 60);
  return `hace ${hr}h`;
}

function formatDistance(m: number) {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

type Props = {
  open: boolean;
  onClose: () => void;
  accent: string;
};

export default function DriversPanel({ open, onClose, accent }: Props) {
  const [data, setData] = useState<LiveResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchLive(silent = false) {
    try {
      if (!silent) setLoading(true);
      const { data } = await api.get<LiveResponse>("/api/gps/live");
      setData(data);
      setError("");
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 403) {
        setError("Tu rol no tiene acceso al rastreo de repartidores.");
      } else {
        setError(e?.response?.data?.error || "No se pudo cargar el rastreo");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    fetchLive(false);
    // Polling cada 10s mientras el panel esté abierto.
    intervalRef.current = setInterval(() => fetchLive(true), 10000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const drivers = data?.drivers || [];
  const origin = data?.origin || null;
  const onlineCount = drivers.filter(d => d.online).length;
  const onRouteCount = drivers.filter(d => d.activeRoute).length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="relative w-full sm:w-96 h-full flex flex-col shadow-2xl border-l"
        style={{ background: "var(--surf)", borderColor: "var(--border)" }}
      >
        {/* Header */}
        <div
          className="p-5 border-b flex items-center justify-between"
          style={{ borderColor: "var(--border)", background: "var(--bg)" }}
        >
          <div>
            <h2 className="text-lg font-black text-white">🚴 Repartidores</h2>
            <p className="text-[11px] font-bold" style={{ color: "var(--muted)" }}>
              {drivers.length} activos · {onlineCount} online · {onRouteCount} en ruta
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-2xl leading-none"
            style={{ color: "var(--muted)" }}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="p-6 text-sm" style={{ color: "var(--muted)" }}>
              Cargando...
            </div>
          )}

          {!loading && error && (
            <div className="m-4 p-4 rounded-xl text-sm bg-red-500/10 text-red-400 border border-red-500/20">
              {error}
            </div>
          )}

          {!loading && !error && drivers.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-4xl mb-2">🛵</p>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                No hay repartidores registrados.
              </p>
            </div>
          )}

          {!loading && !error && drivers.length > 0 && (
            <div className="flex flex-col divide-y" style={{ borderColor: "var(--border)" }}>
              {drivers.map(d => {
                const dist = d.location && origin
                  ? haversineMeters(d.location, origin)
                  : null;
                const last = d.location ? formatRelative(d.location.createdAt) : "sin señal";
                return (
                  <div
                    key={d.driver.id}
                    className="px-5 py-4 flex items-start gap-3"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 overflow-hidden"
                      style={{ background: "var(--surf2)", border: "1px solid var(--border)" }}
                    >
                      {d.driver.photo ? (
                        <img src={d.driver.photo} alt={d.driver.name} className="w-full h-full object-cover" />
                      ) : (
                        d.driver.name.split(" ").map(p => p[0]).slice(0, 2).join("")
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white truncate">{d.driver.name}</span>
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: d.online ? "#22c55e" : "#6b7280" }}
                          title={d.online ? "Online" : "Desconectado"}
                        />
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>
                        {d.activeRoute ? (
                          <span style={{ color: accent }}>● En ruta desde {formatRelative(d.activeRoute.startAt)}</span>
                        ) : (
                          <span>{d.online ? "Disponible" : "Desconectado"}</span>
                        )}
                      </div>
                      <div className="text-[11px] mt-0.5 flex gap-2" style={{ color: "var(--muted)" }}>
                        <span>Última señal {last}</span>
                        {dist !== null && (
                          <>
                            <span>·</span>
                            <span>{formatDistance(dist)} del local</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="p-3 text-[11px] border-t flex items-center justify-between"
          style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--muted)" }}
        >
          <span>Actualiza cada 10s</span>
          <button
            onClick={() => fetchLive(false)}
            className="font-bold"
            style={{ color: accent }}
          >
            Refrescar ahora
          </button>
        </div>
      </div>
    </div>
  );
}
