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
  const [location, setLocation] = useState<Location | null>(null);
  const [loading, setLoading]   = useState<boolean>(true);
  const [error, setError]       = useState<string | null>(null);
  const [tick, setTick]         = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const locationId = localStorage.getItem(STORAGE_KEY);
    if (!locationId) {
      setLoading(false);
      setError("Sucursal no configurada");
      setLocation(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

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
