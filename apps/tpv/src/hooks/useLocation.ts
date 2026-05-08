"use client";

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

export type BusinessType = "RESTAURANT" | "RETAIL" | "BAR" | "CAFE";

export interface Location {
  id: string;
  restaurantId: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  businessType: BusinessType;
}

interface UseLocationResult {
  location: Location | null;
  businessType: BusinessType;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const DEFAULT_BUSINESS_TYPE: BusinessType = "RESTAURANT";
const STORAGE_KEY = "locationId";

/**
 * Hook del "Cerebro Adaptativo": expone la sucursal activa y su `businessType`.
 * - Lee `locationId` desde localStorage.
 * - Hace fetch a GET /api/locations/:id.
 * - Mientras carga, expone el tipo por defecto (RESTAURANT) para evitar flicker.
 */
export function useLocation(): UseLocationResult {
  // Inicializa loading=true sólo si hay locationId; si no, error inmediato.
  // Lazy initializers leen localStorage en cliente (SSR cae a defaults).
  const hasLocationId = (): boolean => {
    if (typeof window === "undefined") return false;
    return Boolean(localStorage.getItem(STORAGE_KEY));
  };

  const [location, setLocation] = useState<Location | null>(null);
  const [loading, setLoading]   = useState<boolean>(() => hasLocationId());
  const [error, setError]       = useState<string | null>(() =>
    hasLocationId() ? null : (typeof window !== "undefined" ? "Sucursal no configurada" : null)
  );
  const [tick, setTick]         = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  // Reset de loading/error en render cuando cambia el tick (refresh manual).
  const [prevTick, setPrevTick] = useState(tick);
  if (prevTick !== tick) {
    setPrevTick(tick);
    if (hasLocationId()) {
      if (!loading) setLoading(true);
      if (error !== null) setError(null);
    } else {
      if (loading) setLoading(false);
      if (error !== "Sucursal no configurada") setError("Sucursal no configurada");
      if (location !== null) setLocation(null);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    const locationId = localStorage.getItem(STORAGE_KEY);
    if (!locationId) return;

    let cancelled = false;

    api
      .get<Location>(`/api/locations/${locationId}`)
      .then((res) => {
        if (cancelled) return;
        setLocation(res.data);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg =
          err?.response?.data?.error ||
          err?.message ||
          "Error al cargar la sucursal";
        setError(msg);
        setLocation(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tick]);

  return {
    location,
    businessType: location?.businessType ?? DEFAULT_BUSINESS_TYPE,
    loading,
    error,
    refresh,
  };
}

export default useLocation;
