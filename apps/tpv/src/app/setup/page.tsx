"use client";

import axios from "axios";
import { useEffect, useState, type FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getApiUrl,
  getApiUrlOverride,
  setApiUrlOverride,
  fetchRemoteConfig,
  clearCachedRemoteConfig,
} from "@/lib/config";
import api from "@/lib/api";
import { usePOSStore } from "@/store/usePOSStore";
import type { Step, Restaurant, Location } from "./_lib/types";
import { Page, Card } from "./_components/primitives";
import AlreadyLinkedStep from "./_components/AlreadyLinkedStep";
import LoginStep from "./_components/LoginStep";
import PickStep from "./_components/PickStep";
import AppearanceStep from "./_components/AppearanceStep";
import ServerOverride from "./_components/ServerOverride";

function SetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const palette = usePOSStore((s) => s.palette);
  const mode = usePOSStore((s) => s.mode);
  const setPalette = usePOSStore((s) => s.setPalette);
  const setMode = usePOSStore((s) => s.setMode);
  const setThemeChosen = usePOSStore((s) => s.setThemeChosen);

  const [alreadyLinked, setAlreadyLinked] = useState<null | {
    restaurantName: string;
    locationName: string;
  }>(null);
  const [step, setStep] = useState<Step>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [serverUrl, setServerUrl] = useState("");

  useEffect(() => {
    const oldUrl = localStorage.getItem("apiBaseUrl");
    if (oldUrl && (oldUrl.includes("localhost") || oldUrl.includes("127.0.0.1"))) {
      localStorage.removeItem("apiBaseUrl");
    }
    setServerUrl(getApiUrlOverride() || getApiUrl());

    const restaurantId = localStorage.getItem("restaurantId");
    const locationId = localStorage.getItem("locationId");

    if (searchParams.get("step") === "appearance" && restaurantId && locationId) {
      setStep("appearance");
      return;
    }

    if (!restaurantId || !locationId) return;
    setAlreadyLinked({
      restaurantName: localStorage.getItem("restaurantName") || "Restaurante",
      locationName: localStorage.getItem("locationName") || "Sucursal",
    });
  }, [searchParams]);

  function applyServerOverride() {
    const trimmed = serverUrl.trim();
    if (!trimmed) {
      setApiUrlOverride(null);
      setServerUrl(getApiUrl());
      return;
    }
    if (!/^https?:\/\//i.test(trimmed)) {
      setError("El servidor debe comenzar con http:// o https://");
      return;
    }
    setApiUrlOverride(trimmed);
    setError("");
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const base = getApiUrl();
      const { data } = await axios.post(`${base}/api/auth/login`, { email, password });
      const authed = axios.create({
        baseURL: base,
        headers: { Authorization: `Bearer ${data.accessToken}` },
      });

      const role = data?.user?.role;
      const userRestaurantId = data?.user?.restaurantId;
      let tenantRestaurants: Restaurant[] = [];

      if (role === "SUPER_ADMIN") {
        const res = await authed.get("/api/saas/tpv-configs");
        const byRestaurant = new Map<string, Restaurant>();
        for (const row of res.data || []) {
          if (!byRestaurant.has(row.restaurantId)) {
            byRestaurant.set(row.restaurantId, {
              id:          row.restaurantId,
              name:        row.tenantName && row.tenantName !== row.restaurantName
                             ? `${row.restaurantName} · ${row.tenantName}`
                             : row.restaurantName,
              accentColor: null,
              locations:   [],
            });
          }
          byRestaurant.get(row.restaurantId)!.locations.push({
            id:      row.locationId,
            name:    row.locationName,
            address: null,
          });
        }
        tenantRestaurants = Array.from(byRestaurant.values()).filter(r => r.locations.length > 0);
      } else if (userRestaurantId) {
        const cfgRes = await authed.get("/api/admin/config")
          .catch((err: any) => {
            const status = err?.response?.status;
            const msg    = err?.response?.data?.error || err?.message || "request failed";
            throw new Error(`/api/admin/config → ${status || "?"} · ${msg}`);
          });
        const locRes = await authed.get("/api/admin/locations")
          .catch((err: any) => {
            const status = err?.response?.status;
            const msg    = err?.response?.data?.error || err?.message || "request failed";
            throw new Error(`/api/admin/locations → ${status || "?"} · ${msg}`);
          });
        tenantRestaurants = [{
          id:          userRestaurantId,
          name:        cfgRes.data?.name || "Mi marca",
          accentColor: cfgRes.data?.accentColor || null,
          locations:   (locRes.data || [])
            .filter((l: any) => l.isActive !== false)
            .map((l: any) => ({ id: l.id, name: l.name, address: l.address || null })),
        }];
      } else {
        throw new Error(`Tu sesión no trae restaurantId. user.role=${role || "?"}, user.id=${data?.user?.id || "?"}.`);
      }

      if (tenantRestaurants.length === 0 || tenantRestaurants.every((r) => r.locations.length === 0)) {
        throw new Error("No encontramos sucursales activas para esta cuenta.");
      }
      setRestaurants(tenantRestaurants);
      setStep("pick");
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || "No se pudo iniciar sesión.");
    } finally {
      setLoading(false);
    }
  }

  async function pickLocation(restaurant: Restaurant, location: Location) {
    localStorage.setItem("restaurantId", restaurant.id);
    localStorage.setItem("restaurantName", restaurant.name);
    localStorage.setItem("locationId", location.id);
    localStorage.setItem("locationName", location.name);
    if (restaurant.accentColor) {
      localStorage.setItem("mb-accent", restaurant.accentColor);
    }

    clearCachedRemoteConfig();
    await fetchRemoteConfig(api).catch(() => null);

    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");

    setStep("appearance");
  }

  function finishAppearance() {
    setThemeChosen(true);
    setStep("saving");
    router.replace("/");
  }

  function unlink() {
    if (!confirm("¿Desvincular este TPV? Tendrás que volver a configurarlo.")) return;
    try { localStorage.clear(); } catch {}
    ["mb-role", "accessToken", "refreshToken"].forEach((c) => {
      document.cookie = `${c}=; path=/; max-age=0; SameSite=Lax`;
    });
    window.location.replace("/setup");
  }

  if (alreadyLinked && step === "login") {
    return (
      <Page>
        <Card>
          <AlreadyLinkedStep
            restaurantName={alreadyLinked.restaurantName}
            locationName={alreadyLinked.locationName}
            onGoToTPV={() => router.replace("/")}
            onChangeAppearance={() => setStep("appearance")}
            onUnlink={unlink}
          />
        </Card>
      </Page>
    );
  }

  return (
    <Page>
      <Card>
        {step === "login" && (
          <LoginStep
            email={email}
            password={password}
            error={error}
            loading={loading}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onSubmit={login}
          />
        )}

        {step === "pick" && (
          <PickStep
            restaurants={restaurants}
            onPick={pickLocation}
            onBack={() => { setStep("login"); setRestaurants([]); }}
          />
        )}

        {step === "appearance" && (
          <AppearanceStep
            palette={palette}
            mode={mode}
            onPaletteChange={setPalette}
            onModeChange={setMode}
            onContinue={finishAppearance}
          />
        )}

        {step === "saving" && (
          <div className="text-center py-10">
            <h1 className="text-xl font-black tracking-tight" style={{ color: "var(--text-primary)" }}>
              Guardando…
            </h1>
          </div>
        )}
      </Card>

      {step === "login" && (
        <ServerOverride
          serverUrl={serverUrl}
          onChange={setServerUrl}
          onApply={applyServerOverride}
        />
      )}
    </Page>
  );
}

export default function SetupPage() {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="text-center">
          <h1 className="text-xl font-black italic animate-pulse" style={{ color: "var(--brand)" }}>MRTPVREST</h1>
          <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>Cargando configuración...</p>
        </div>
      </div>
    }>
      <SetupContent />
    </Suspense>
  );
}
