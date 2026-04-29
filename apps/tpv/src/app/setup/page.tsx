"use client";

import axios from "axios";
import { useEffect, useState, type FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sun, Moon, Check, ArrowLeft, Lock, Sparkles } from "lucide-react";
import {
  getApiUrl,
  getApiUrlOverride,
  setApiUrlOverride,
  fetchRemoteConfig,
  clearCachedRemoteConfig,
} from "@/lib/config";
import api from "@/lib/api";
import { usePOSStore, type Palette, type Mode } from "@/store/usePOSStore";

type Location = {
  id: string;
  name: string;
  address: string | null;
};

type Restaurant = {
  id: string;
  name: string;
  accentColor: string | null;
  locations: Location[];
};

type Step = "login" | "pick" | "appearance" | "saving";

const PALETTES: { id: Palette; label: string; color: string; sub: string }[] = [
  { id: "green",  label: "Verde Esmeralda", color: "#10b981", sub: "Energía · Frescura" },
  { id: "purple", label: "Morado Real",     color: "#7c3aed", sub: "Premium · Creativo"  },
  { id: "orange", label: "Naranja Brand",   color: "#ff5c35", sub: "Cálido · Dinámico"   },
];

function SetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const palette = usePOSStore((s) => s.palette);
  const mode = usePOSStore((s) => s.mode);
  const setPalette = usePOSStore((s) => s.setPalette);
  const setMode = usePOSStore((s) => s.setMode);
  const setThemeChosen = usePOSStore((s) => s.setThemeChosen);
  const themeChosen = usePOSStore((s) => s.themeChosen);

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
  const [picked, setPicked] = useState<{ restaurant: Restaurant; location: Location } | null>(null);
  const [serverUrl, setServerUrl] = useState("");

  useEffect(() => {
    const oldUrl = localStorage.getItem("apiBaseUrl");
    if (oldUrl && (oldUrl.includes("localhost") || oldUrl.includes("127.0.0.1"))) {
      localStorage.removeItem("apiBaseUrl");
    }
    setServerUrl(getApiUrlOverride() || getApiUrl());

    const restaurantId = localStorage.getItem("restaurantId");
    const locationId = localStorage.getItem("locationId");

    // Deep-link from any POS screen: /setup?step=appearance
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
    setPicked({ restaurant, location });

    localStorage.setItem("restaurantId", restaurant.id);
    localStorage.setItem("restaurantName", restaurant.name);
    localStorage.setItem("locationId", location.id);
    localStorage.setItem("locationName", location.name);
    if (location.address) {
      localStorage.setItem("locationAddress", location.address);
    } else {
      localStorage.removeItem("locationAddress");
    }
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

  // ── Already linked landing ────────────────────────────────────
  if (alreadyLinked && step === "login") {
    return (
      <Page>
        <Card>
          <Heading icon={<Check />}>Dispositivo vinculado</Heading>
          <p className="mt-1 mb-6 text-sm" style={{ color: "var(--text-secondary)" }}>
            <b style={{ color: "var(--text-primary)" }}>{alreadyLinked.restaurantName}</b>
            {" — "}{alreadyLinked.locationName}
          </p>

          <PrimaryButton onClick={() => router.replace("/")}>
            Ir al TPV
          </PrimaryButton>

          <button
            onClick={() => setStep("appearance")}
            className="w-full mt-3 py-3 rounded-2xl text-sm font-bold transition-colors"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            <span className="inline-flex items-center gap-2">
              <Sparkles size={14} /> Cambiar apariencia
            </span>
          </button>

          <button
            onClick={unlink}
            className="w-full mt-3 py-3 rounded-2xl text-sm font-bold transition-colors"
            style={{
              background: "var(--danger-soft)",
              border: "1px solid var(--danger)",
              color: "var(--danger)",
              cursor: "pointer",
            }}
          >
            Desvincular y re-configurar
          </button>
        </Card>
      </Page>
    );
  }

  return (
    <Page>
      <Card>
        {step === "login" && (
          <form onSubmit={login}>
            <Heading icon={<Lock />}>Vincular TPV</Heading>
            <p className="mt-1 mb-6 text-sm" style={{ color: "var(--text-secondary)" }}>
              Inicia sesión como administrador para asignar este dispositivo a una sucursal.
            </p>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" name="password" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            {error && (
              <div
                className="mt-3 p-3 rounded-xl text-sm"
                style={{ background: "var(--danger-soft)", color: "var(--danger)", border: "1px solid var(--danger)" }}
              >
                {error}
              </div>
            )}
            <PrimaryButton disabled={loading} type="submit">
              {loading ? "Entrando…" : "Entrar"}
            </PrimaryButton>
          </form>
        )}

        {step === "pick" && (
          <>
            <Heading>Elige la sucursal</Heading>
            <p className="mt-1 mb-6 text-sm" style={{ color: "var(--text-secondary)" }}>
              ¿En qué sucursal está físicamente este TPV?
            </p>
            <div className="flex flex-col gap-2">
              {restaurants.map((r) =>
                (r.locations || []).length === 0 ? (
                  <div key={r.id} className="text-sm" style={{ color: "var(--text-muted)" }}>
                    {r.name}: sin sucursales activas
                  </div>
                ) : (
                  r.locations.map((loc) => (
                    <button
                      key={loc.id}
                      onClick={() => pickLocation(r, loc)}
                      className="w-full text-left p-4 rounded-2xl transition-all hover:brightness-110"
                      style={{
                        background: "var(--surface-2)",
                        border: "1px solid var(--border)",
                        cursor: "pointer",
                      }}
                    >
                      <div className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
                        {loc.name}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {r.name} · {loc.address || "sin dirección"}
                      </div>
                    </button>
                  ))
                ),
              )}
            </div>
            <button
              onClick={() => { setStep("login"); setRestaurants([]); }}
              className="mt-4 text-sm inline-flex items-center gap-1.5"
              style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
            >
              <ArrowLeft size={14} /> Volver
            </button>
          </>
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
            <Heading>Guardando…</Heading>
          </div>
        )}
      </Card>

      {/* Server URL editor (always available, footer) */}
      {step === "login" && (
        <div className="mt-6 text-center">
          <details>
            <summary
              className="text-[11px] font-bold uppercase tracking-widest cursor-pointer inline-block"
              style={{ color: "var(--text-muted)" }}
            >
              Servidor avanzado
            </summary>
            <div className="mt-3 flex items-center gap-2">
              <input
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="https://api.example.com"
                className="flex-1 px-3 py-2 rounded-lg text-xs outline-none"
                style={{
                  background: "var(--surface-2)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                }}
              />
              <button
                onClick={applyServerOverride}
                className="px-4 py-2 rounded-lg text-xs font-bold"
                style={{
                  background: "var(--surface-3)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                }}
              >
                Aplicar
              </button>
            </div>
          </details>
        </div>
      )}
    </Page>
  );
}

export default function SetupPage() {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 flex items-center justify-center bg-bg" style={{ background: "var(--bg)" }}>
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


/* ── Appearance step (palette + mode picker) ─────────────────── */

function AppearanceStep({
  palette,
  mode,
  onPaletteChange,
  onModeChange,
  onContinue,
}: {
  palette: Palette;
  mode: Mode;
  onPaletteChange: (p: Palette) => void;
  onModeChange: (m: Mode) => void;
  onContinue: () => void;
}) {
  return (
    <>
      <Heading icon={<Sparkles />}>Personaliza tu TPV</Heading>
      <p className="mt-1 mb-6 text-sm" style={{ color: "var(--text-secondary)" }}>
        Elige el color de marca y el modo de pantalla. Podrás cambiarlo después desde el rail lateral.
      </p>

      {/* Palette section */}
      <SectionLabel>Color de marca</SectionLabel>
      <div className="grid grid-cols-3 gap-3 mb-6">
        {PALETTES.map((p) => {
          const active = palette === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onPaletteChange(p.id)}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl transition-all hover:scale-[1.02] active:scale-95"
              style={{
                background: active ? "var(--brand-soft)" : "var(--surface-2)",
                border: active ? "2px solid var(--brand)" : "2px solid var(--border)",
                cursor: "pointer",
              }}
            >
              <div
                className="w-14 h-14 rounded-full"
                style={{
                  background: p.color,
                  boxShadow: active ? `0 8px 24px -4px ${p.color}99` : "none",
                }}
              />
              <span
                className="text-xs font-bold"
                style={{ color: active ? "var(--brand)" : "var(--text-primary)" }}
              >
                {p.label}
              </span>
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                {p.sub}
              </span>
              {active && (
                <span
                  className="absolute mt-1"
                  style={{ color: "var(--brand)" }}
                  aria-hidden="true"
                >
                  <Check size={14} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Mode section */}
      <SectionLabel>Modo de pantalla</SectionLabel>
      <div className="grid grid-cols-2 gap-3 mb-6">
        <ModeCard
          active={mode === "dark"}
          onClick={() => onModeChange("dark")}
          icon={<Moon size={20} />}
          label="Oscuro"
          sub="Recomendado · OLED"
          previewBg="#0a0a0a"
          previewSurface="#1f1f1f"
          previewText="#ffffff"
        />
        <ModeCard
          active={mode === "light"}
          onClick={() => onModeChange("light")}
          icon={<Sun size={20} />}
          label="Claro"
          sub="Mostrador · Día"
          previewBg="#f8fafc"
          previewSurface="#ffffff"
          previewText="#0f172a"
        />
      </div>

      {/* Live preview */}
      <SectionLabel>Vista previa</SectionLabel>
      <PreviewBlock />

      <PrimaryButton onClick={onContinue}>
        Continuar al TPV
      </PrimaryButton>
    </>
  );
}

function ModeCard({
  active, onClick, icon, label, sub, previewBg, previewSurface, previewText,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  sub: string;
  previewBg: string;
  previewSurface: string;
  previewText: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col gap-3 p-3 rounded-2xl transition-all hover:scale-[1.02] active:scale-95"
      style={{
        background: active ? "var(--brand-soft)" : "var(--surface-2)",
        border: active ? "2px solid var(--brand)" : "2px solid var(--border)",
        cursor: "pointer",
      }}
    >
      <div className="flex items-center gap-2" style={{ color: active ? "var(--brand)" : "var(--text-primary)" }}>
        {icon}
        <span className="text-sm font-bold">{label}</span>
      </div>
      <div
        className="rounded-lg overflow-hidden flex items-center gap-1.5 p-2"
        style={{ background: previewBg, border: `1px solid ${previewSurface}` }}
      >
        <div className="w-2 h-8 rounded-full" style={{ background: "var(--brand)" }} />
        <div className="flex-1 flex flex-col gap-0.5">
          <div className="h-1.5 w-3/4 rounded-full" style={{ background: previewText, opacity: 0.8 }} />
          <div className="h-1.5 w-1/2 rounded-full" style={{ background: previewText, opacity: 0.4 }} />
        </div>
      </div>
      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
        {sub}
      </span>
    </button>
  );
}

function PreviewBlock() {
  return (
    <div
      className="rounded-2xl p-4 mb-6 flex flex-col gap-3"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
          Total Final
        </span>
        <span
          className="text-2xl font-extrabold"
          style={{ color: "var(--brand)", fontFamily: "var(--font-display)" }}
        >
          $145.00
        </span>
      </div>
      <button
        className="w-full h-11 rounded-xl text-xs font-bold uppercase tracking-wider"
        style={{
          background: "var(--brand)",
          color: "var(--brand-fg)",
          letterSpacing: "0.08em",
          boxShadow: "var(--shadow-glow)",
        }}
      >
        Procesar Cobro
      </button>
    </div>
  );
}

/* ── Atoms ───────────────────────────────────────────────────── */

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 overflow-auto flex items-center justify-center p-6"
      style={{ background: "var(--bg)" }}
    >
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <h1
            className="text-3xl font-black tracking-tighter"
            style={{ color: "var(--brand)", fontFamily: "var(--font-display)" }}
          >
            MRTPVREST
          </h1>
          <p
            className="text-[10px] mt-1 font-bold uppercase tracking-widest"
            style={{ color: "var(--text-muted)", letterSpacing: "0.18em" }}
          >
            Configuración de dispositivo
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-3xl p-7 relative"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-lg)",
      }}
    >
      {children}
    </div>
  );
}

function Heading({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      {icon && (
        <span
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
        >
          {icon}
        </span>
      )}
      <h1
        className="text-xl font-black tracking-tight"
        style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
      >
        {children}
      </h1>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-[10px] font-bold uppercase tracking-widest mb-2.5"
      style={{ color: "var(--text-muted)", letterSpacing: "0.14em" }}
    >
      {children}
    </h2>
  );
}

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-[10px] font-bold uppercase tracking-widest mt-4 mb-1.5"
      style={{ color: "var(--text-muted)", letterSpacing: "0.14em" }}
    >
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-xl text-base outline-none transition-colors"
      style={{
        padding: "12px 14px",
        background: "var(--surface-2)",
        color: "var(--text-primary)",
        border: "1px solid var(--border)",
        ...props.style,
      }}
    />
  );
}

function PrimaryButton({ children, onClick, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      onClick={onClick}
      {...rest}
      className="w-full mt-2 py-4 rounded-2xl font-black uppercase text-sm transition-all hover:brightness-110 active:scale-[0.98]"
      style={{
        background: "var(--brand)",
        color: "var(--brand-fg)",
        border: "none",
        cursor: rest.disabled ? "not-allowed" : "pointer",
        opacity: rest.disabled ? 0.5 : 1,
        boxShadow: "var(--shadow-glow)",
        letterSpacing: "0.08em",
      }}
    >
      {children}
    </button>
  );
}
