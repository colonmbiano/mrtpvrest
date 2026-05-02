// GPSTracker.tsx — Componente de tracking para app repartidor
"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import api from "@/lib/api";

const TRACK_INTERVAL   = 60000; // 1 minuto

interface Props {
  driverId: string;
  activeOrderId?: string;
  onRouteStart?: () => void;
  onRouteEnd?: () => void;
}

export default function GPSTracker({ driverId, activeOrderId, onRouteStart, onRouteEnd }: Props) {
  const [tracking, setTracking]       = useState(false);
  const [, setRouteId]                = useState<string|null>(null);
  const [distFromOrigin, setDistFromOrigin] = useState<number|null>(null);
  const [accuracy, setAccuracy]       = useState<number|null>(null);
  const [permDenied, setPermDenied]   = useState(false);
  const [pointsSent, setPointsSent]   = useState(0);
  const watchRef  = useRef<number|null>(null);
  const timerRef  = useRef<any>(null);
  const lastPosRef = useRef<{lat:number,lng:number}|null>(null);

  const startRoute = useCallback(async (lat: number, lng: number, trigger = "MANUAL") => {
    try {
      const { data } = await api.post(`/api/gps/${driverId}/route/start`, {
        lat, lng, orderId: activeOrderId || null, trigger
      });
      setRouteId(data.id);
      setTracking(true);
      onRouteStart?.();
    } catch {}
  }, [driverId, activeOrderId, onRouteStart]);

  const sendLocation = useCallback(async (pos: GeolocationPosition) => {
    const { latitude: lat, longitude: lng, accuracy, speed, heading } = pos.coords;
    lastPosRef.current = { lat, lng };
    setAccuracy(Math.round(accuracy));
    try {
      const { data } = await api.post(`/api/gps/${driverId}/location`, {
        lat, lng, accuracy, speed, heading, orderId: activeOrderId || null
      });
      setDistFromOrigin(data.distFromOrigin);
      setPointsSent(p => p + 1);
    } catch {}
  }, [driverId, activeOrderId]);

  // Iniciar tracking manual
  async function handleStartTracking() {
    if (!navigator.geolocation) { alert("Tu dispositivo no soporta GPS"); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await startRoute(pos.coords.latitude, pos.coords.longitude, "MANUAL");
        startWatching();
      },
      () => setPermDenied(true),
      { enableHighAccuracy: true }
    );
  }

  function startWatching() {
    // Watch position cada minuto
    timerRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(sendLocation, () => {}, { enableHighAccuracy: true });
    }, TRACK_INTERVAL);
    // También watch continuo para detectar salida de origen
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => { sendLocation(pos); },
      () => {},
      { enableHighAccuracy: true, maximumAge: 30000 }
    );
  }

  async function handleStopTracking() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    try { await api.post(`/api/gps/${driverId}/route/end`); } catch {}
    setTracking(false); setRouteId(null); setPointsSent(0);
    onRouteEnd?.();
  }

  // Auto-iniciar cuando se asigna un pedido
  useEffect(() => {
    if (activeOrderId && !tracking) {
      navigator.geolocation?.getCurrentPosition(
        async (pos) => {
          await startRoute(pos.coords.latitude, pos.coords.longitude, "ORDER_ASSIGNED");
          startWatching();
        },
        () => {},
        { enableHighAccuracy: true }
      );
    }
  }, [activeOrderId]);

  // Cleanup
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (watchRef.current !== null) navigator.geolocation?.clearWatch(watchRef.current);
  }, []);

  if (permDenied) return (
    <div className="mx-5 mb-3 px-4 py-3 rounded-xl text-xs"
      style={{background:"rgba(239,68,68,0.1)",color:"#ef4444",border:"1px solid rgba(239,68,68,0.2)"}}>
      ⚠️ Sin permiso de ubicación — actívalo en la configuración del navegador
    </div>
  );

  return (
    <div className="mx-5 mb-3">
      {tracking ? (
        <div className="px-4 py-3 rounded-xl flex items-center gap-3"
          style={{background:"rgba(34,197,94,0.1)",border:"1px solid rgba(34,197,94,0.2)"}}>
          <div className="w-2 h-2 rounded-full animate-pulse flex-shrink-0" style={{background:"#22c55e"}} />
          <div className="flex-1">
            <div className="text-xs font-bold" style={{color:"#22c55e"}}>GPS activo · {pointsSent} puntos enviados</div>
            {distFromOrigin !== null && (
              <div className="text-xs" style={{color:"#22c55e"}}>{distFromOrigin}m del restaurante · ±{accuracy}m</div>
            )}
          </div>
          <button onClick={handleStopTracking}
            className="px-3 py-1.5 rounded-lg text-xs font-bold flex-shrink-0"
            style={{background:"rgba(239,68,68,0.15)",color:"#ef4444"}}>
            ⏹ Detener
          </button>
        </div>
      ) : (
        <button onClick={handleStartTracking}
          className="w-full px-4 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2"
          style={{background:"rgba(59,130,246,0.1)",color:"#3b82f6",border:"1px solid rgba(59,130,246,0.2)"}}>
          📍 Iniciar seguimiento GPS
        </button>
      )}
    </div>
  );
}
