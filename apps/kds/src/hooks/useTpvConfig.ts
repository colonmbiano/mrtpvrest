"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import {
  DEFAULT_CONFIG,
  REMOTE_CONFIG_CHANGED,
  fetchRemoteConfig,
  getEffectiveConfig,
  isRemoteConfigFresh,
  maybeRefreshRemoteConfig,
  type TpvRemoteConfig,
} from "@/lib/config";

/**
 * Hook de suscripción a la TpvRemoteConfig.
 *
 * - Monta → lee cache local si existe, intenta refrescar si está stale.
 * - focus/visibilitychange → revalida si pasó el TTL.
 * - Escucha el evento local REMOTE_CONFIG_CHANGED (cuando otro flujo guarda o
 *   limpia la cache) para reaplicar UI inmediatamente.
 *
 * Seguro de llamar antes/después del PIN del empleado: si no hay
 * `x-location-id` en localStorage el fetch devuelve 400 y este hook deja los
 * defaults sin romper nada.
 */
export function useTpvConfig(): TpvRemoteConfig {
  const [cfg, setCfg] = useState<TpvRemoteConfig>(() => getEffectiveConfig());

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;
    const apply = () => { if (!cancelled) setCfg(getEffectiveConfig()); };

    // 1. Primer render: si no hay cache o está stale, intenta refrescar.
    if (!isRemoteConfigFresh()) {
      fetchRemoteConfig(api).catch(() => null).finally(apply);
    } else {
      apply();
    }

    // 2. Eventos de foco / visibilidad → revalida con TTL.
    const onFocus = () => {
      maybeRefreshRemoteConfig(api).catch(() => null).finally(apply);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") onFocus();
    };
    const onChanged = () => apply();

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener(REMOTE_CONFIG_CHANGED, onChanged);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(REMOTE_CONFIG_CHANGED, onChanged);
    };
  }, []);

  return cfg ?? DEFAULT_CONFIG;
}

export default useTpvConfig;
