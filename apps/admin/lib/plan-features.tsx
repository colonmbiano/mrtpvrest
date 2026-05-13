"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";

// Hook que carga el plan del tenant actual y expone helpers para gate
// granular de UI. Cachea en sessionStorage para no pegarle al backend
// en cada render del sidebar.

export interface PlanFeatures {
  hasKDS: boolean;
  hasLoyalty: boolean;
  hasInventory: boolean;
  hasReports: boolean;
  hasAPIAccess: boolean;
  allowedModules: string[];
  maxLocations: number;
  maxEmployees: number;
  planName: string | null;
  loaded: boolean;
}

const EMPTY: PlanFeatures = {
  hasKDS: false, hasLoyalty: false, hasInventory: false,
  hasReports: false, hasAPIAccess: false,
  allowedModules: [], maxLocations: 0, maxEmployees: 0,
  planName: null, loaded: false,
};

const CACHE_KEY = "admin-plan-features";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

export function usePlanFeatures(): PlanFeatures {
  const [features, setFeatures] = useState<PlanFeatures>(() => {
    if (typeof window === "undefined") return EMPTY;
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const { data, at } = JSON.parse(raw);
        if (Date.now() - at < CACHE_TTL_MS) return { ...data, loaded: true };
      }
    } catch {}
    return EMPTY;
  });

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const { data } = await api.get("/api/tenant/me");
        const plan = data?.subscription?.plan || data?.subscription || null;
        // El endpoint actual /api/tenant/me devuelve plan como displayName string.
        // Para feature flags reales, consumimos /api/saas/plans (público) y matcheamos.
        const planName = data?.subscription?.planName || null;
        let planData = null;
        if (planName) {
          try {
            const r = await api.get<any[]>("/api/saas/plans");
            planData = (r.data || []).find((p) => p.name === planName) || null;
          } catch {}
        }
        if (!alive) return;
        const result: PlanFeatures = {
          hasKDS:       Boolean(planData?.hasKDS),
          hasLoyalty:   Boolean(planData?.hasLoyalty),
          hasInventory: Boolean(planData?.hasInventory),
          hasReports:   Boolean(planData?.hasReports),
          hasAPIAccess: Boolean(planData?.hasAPIAccess),
          allowedModules: planData?.allowedModules || [],
          maxLocations: planData?.maxLocations || 0,
          maxEmployees: planData?.maxEmployees || 0,
          planName,
          loaded: true,
        };
        setFeatures(result);
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: result, at: Date.now() }));
        } catch {}
      } catch {
        // Sin tenant/me: estado vacío con loaded=true para no bloquear UI.
        if (alive) setFeatures({ ...EMPTY, loaded: true });
      }
    }
    load();
    return () => { alive = false; };
  }, []);

  return features;
}

// Helper para componentes condicionales:
//   <FeatureGate flag="hasInventory" fallback={<Locked />}>
//     <RecetasButton />
//   </FeatureGate>
export function FeatureGate({
  flag,
  module: moduleKey,
  children,
  fallback = null,
}: {
  flag?: keyof Omit<PlanFeatures, "allowedModules" | "maxLocations" | "maxEmployees" | "planName" | "loaded">;
  module?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const features = usePlanFeatures();
  if (!features.loaded) return null; // sin parpadeo: render nada hasta que cargue

  const hasFlag = flag ? Boolean(features[flag]) : true;
  const hasModule = moduleKey ? features.allowedModules.includes(moduleKey) : true;

  return hasFlag && hasModule ? <>{children}</> : <>{fallback}</>;
}
