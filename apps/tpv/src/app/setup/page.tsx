"use client";

import axios from "axios";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  getApiUrl,
  getApiUrlOverride,
  setApiUrlOverride,
  DEFAULT_API_URL,
  fetchRemoteConfig,
  clearCachedRemoteConfig,
} from "@/lib/config";
import api from "@/lib/api";

const ACCENT = "#F5C842";

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

export default function SetupPage() {
  const router = useRouter();

  const [alreadyLinked, setAlreadyLinked] = useState<null | {
    restaurantName: string;
    locationName: string;
  }>(null);
  const [step, setStep] = useState<"login" | "pick" | "terminal" | "saving">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [picked, setPicked] = useState<{ restaurant: Restaurant; location: Location } | null>(null);
  const [terminalId, setTerminalId] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [showServerEditor, setShowServerEditor] = useState(false);

  useEffect(() => {
    // HARD RESET: Si hay una URL vieja de localhost, la limpiamos
    const oldUrl = localStorage.getItem("apiBaseUrl");
    if (oldUrl && (oldUrl.includes("localhost") || oldUrl.includes("127.0.0.1"))) {
      localStorage.removeItem("apiBaseUrl");
    }

    // Pre-llenamos el campo "Servidor" con el override activo o el default baked.
    setServerUrl(getApiUrlOverride() || getApiUrl());

    const restaurantId = localStorage.getItem("restaurantId");
    const locationId = localStorage.getItem("locationId");
    if (!restaurantId || !locationId) return;
    setAlreadyLinked({
      restaurantName: localStorage.getItem("restaurantName") || "Restaurante",
      locationName: localStorage.getItem("locationName") || "Sucursal",
    });
    setTerminalId(localStorage.getItem("terminalId") || "");
  }, []);

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
        // El dueño de la plataforma no está ligado a un tenant; listamos todas
        // las sucursales cross-tenant para que pueda vincular el TPV a
        // cualquier marca sin pedir credenciales al cliente.
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
        tenantRestaurants = Array.from(byRestaurant.values())
          .filter(r => r.locations.length > 0);
      } else if (userRestaurantId) {
        // Admin de marca. No dependemos de /api/tenant/me (que requiere
        // user.tenantId — algunos admins legacy lo tienen NULL). Resolvemos
        // directo con los endpoints que sólo necesitan user.restaurantId.
        // No silenciamos los errores: si el server da 4xx/5xx queremos verlo
        // en pantalla en vez de degradar a "sin sucursales" misterioso.
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
        throw new Error(`Tu sesión no trae restaurantId. user.role=${role || "?"}, user.id=${data?.user?.id || "?"}. Revisa que tu cuenta tenga un restaurante asignado.`);
      }

      if (tenantRestaurants.length === 0 || tenantRestaurants.every((r) => r.locations.length === 0)) {
        throw new Error("No encontramos sucursales activas para esta cuenta.");
      }

      setRestaurants(tenantRestaurants);
      setStep("pick");
    } catch (err: any) {
      setError(
        err?.response?.data?.error ||
          err?.message ||
          "No se pudo iniciar sesión.",
      );
    } finally {
      setLoading(false);
    }
  }

  function pickLocation(restaurant: Restaurant, location: Location) {
    setPicked({ restaurant, location });
    setStep("terminal");
  }

  async function finishSetup() {
    if (!picked) return;
    setStep("saving");
    const { restaurant, location } = picked;

    localStorage.setItem("restaurantId", restaurant.id);
    localStorage.setItem("restaurantName", restaurant.name);
    localStorage.setItem("locationId", location.id);
    localStorage.setItem("locationName", location.name);

    if (terminalId.trim()) {
      localStorage.setItem("terminalId", terminalId.trim());
    } else {
      localStorage.removeItem("terminalId");
    }

    if (restaurant.accentColor) {
      localStorage.setItem("mb-accent", restaurant.accentColor);
    }

    // Nueva sucursal → cache previa ya no aplica
    clearCachedRemoteConfig();
    // Pre-calentamos la config remota antes de redirigir al TPV.
    await fetchRemoteConfig(api).catch(() => null);

    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");

    router.replace("/");
  }

  function saveTerminalOnly() {
    const v = terminalId.trim();
    if (v) localStorage.setItem("terminalId", v);
    else localStorage.removeItem("terminalId");
    router.replace("/");
  }

  function unlink() {
    if (!confirm("¿Desvincular este TPV? Tendrás que volver a configurarlo.")) return;
    [
      "restaurantId",
      "restaurantName",
      "locationId",
      "locationName",
      "terminalId",
      "mb-accent",
      "accessToken",
      "refreshToken",
      "user",
    ].forEach((k) => localStorage.removeItem(k));
    document.cookie = "mb-role=; path=/; max-age=0; SameSite=Lax";
    clearCachedRemoteConfig();
    setAlreadyLinked(null);
    setRestaurants([]);
    setEmail("");
    setPassword("");
    setTerminalId("");
    setError("");
    setStep("login");
  }

  if (alreadyLinked && step === "login") {
    return (
      <Page>
        <Card>
          <H1>Dispositivo vinculado</H1>
          <p className="mt-2 mb-6 text-sm" style={{ color: "var(--muted)" }}>
            <b>{alreadyLinked.restaurantName}</b> — {alreadyLinked.locationName}
          </p>

          <Label>Terminal de pagos (opcional)</Label>
          <Input
            value={terminalId}
            onChange={(e) => setTerminalId(e.target.value)}
            placeholder="Ej. 192.168.1.45 o TERM-001"
          />
          <PrimaryButton onClick={saveTerminalOnly}>Guardar y continuar</PrimaryButton>

          <div className="mt-8 pt-5 border-t" style={{ borderColor: "var(--border)" }}>
            <button
              onClick={unlink}
              className="text-sm"
              style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}
            >
              Desvincular TPV
            </button>
          </div>
        </Card>
      </Page>
    );
  }

  return (
    <Page>
      <Card>
        {step === "login" && (
          <form onSubmit={login}>
            <H1>Vincular TPV</H1>
            <p className="mt-2 mb-6 text-sm" style={{ color: "var(--muted)" }}>
              Inicia sesión como administrador para asignar este dispositivo a una sucursal.
            </p>
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <Label>Contraseña</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            {error && (
              <div className="mt-2 text-sm" style={{ color: "#ef4444" }}>
                {error}
              </div>
            )}
            <PrimaryButton disabled={loading} type="submit">
              {loading ? "Entrando…" : "Entrar"}
            </PrimaryButton>

            <div className="mt-6 pt-5 border-t" style={{ borderColor: "var(--border)" }}>
              <button
                type="button"
                onClick={() => setShowServerEditor(s => !s)}
                className="text-xs"
                style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}
              >
                {showServerEditor ? "▾" : "▸"} Servidor
              </button>
              {showServerEditor && (
                <div className="mt-3">
                  <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>
                    Solo cámbialo si tu instalación apunta a un backend distinto. Default: {DEFAULT_API_URL}
                  </p>
                  <Input
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    placeholder="https://api.mrtpvrest.com"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={applyServerOverride}
                      className="flex-1 text-xs font-bold py-2 rounded-xl"
                      style={{ background: ACCENT, color: "#000", border: "none", cursor: "pointer" }}
                    >
                      Aplicar
                    </button>
                    <button
                      type="button"
                      onClick={() => { setApiUrlOverride(null); setServerUrl(getApiUrl()); }}
                      className="flex-1 text-xs py-2 rounded-xl"
                      style={{ background: "transparent", color: "var(--muted)", border: "1px solid var(--border)", cursor: "pointer" }}
                    >
                      Usar default
                    </button>
                  </div>
                </div>
              )}
            </div>
          </form>
        )}

        {step === "pick" && (
          <>
            <H1>Elige la sucursal</H1>
            <p className="mt-2 mb-6 text-sm" style={{ color: "var(--muted)" }}>
              ¿En qué sucursal está físicamente este TPV?
            </p>
            {restaurants.map((r) =>
              (r.locations || []).length === 0 ? (
                <div key={r.id} className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
                  {r.name}: sin sucursales activas
                </div>
              ) : (
                r.locations.map((loc) => (
                  <button
                    key={loc.id}
                    onClick={() => pickLocation(r, loc)}
                    className="block w-full text-left p-5 mb-3 rounded-2xl border"
                    style={{
                      background: "var(--surf2, var(--bg))",
                      borderColor: "var(--border)",
                      cursor: "pointer",
                    }}
                  >
                    <div className="text-xl font-extrabold" style={{ color: "var(--text)" }}>
                      {loc.name}
                    </div>
                    <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                      {r.name} · {loc.address || "sin dirección"}
                    </div>
                  </button>
                ))
              ),
            )}
            <button
              onClick={() => {
                setStep("login");
                setRestaurants([]);
              }}
              className="mt-3 text-sm"
              style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}
            >
              ← Volver
            </button>
          </>
        )}

        {step === "terminal" && picked && (
          <>
            <H1>Terminal de pagos</H1>
            <p className="mt-2 mb-6 text-sm" style={{ color: "var(--muted)" }}>
              Introduce el ID o IP de la terminal física asignada a este TPV. Es opcional — si lo
              dejas vacío, los pagos con tarjeta deberán cobrarse manualmente.
            </p>
            <div
              className="mb-4 p-3 rounded-xl"
              style={{ background: "var(--surf2, var(--bg))", border: "1px solid var(--border)" }}
            >
              <div className="text-xs uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                Vinculando
              </div>
              <div className="text-base font-bold mt-1" style={{ color: "var(--text)" }}>
                {picked.restaurant.name} · {picked.location.name}
              </div>
            </div>
            <Label>ID / IP de la terminal</Label>
            <Input
              value={terminalId}
              onChange={(e) => setTerminalId(e.target.value)}
              placeholder="Ej. 192.168.1.45 o TERM-001"
              autoFocus
            />
            <PrimaryButton onClick={finishSetup}>
              {terminalId.trim() ? "Guardar y vincular" : "Vincular sin terminal"}
            </PrimaryButton>
            <button
              onClick={() => setStep("pick")}
              className="mt-3 text-sm"
              style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}
            >
              ← Cambiar sucursal
            </button>
          </>
        )}

        {step === "saving" && (
          <div className="text-center py-10">
            <H1>Guardando…</H1>
          </div>
        )}
      </Card>
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 overflow-auto flex items-center justify-center p-6"
      style={{ background: "var(--bg)" }}
    >
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <h1 className="text-4xl font-black tracking-tighter" style={{ color: ACCENT }}>
            MRTPVREST
          </h1>
          <p
            className="text-xs mt-1 font-medium uppercase tracking-widest"
            style={{ color: "var(--muted)" }}
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
      className="rounded-3xl border p-8 shadow-2xl"
      style={{ background: "var(--surf)", borderColor: "var(--border)" }}
    >
      {children}
    </div>
  );
}

function H1({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-2xl font-black tracking-tight" style={{ color: "var(--text)" }}>
      {children}
    </h1>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="block text-[11px] font-semibold uppercase tracking-widest mt-4 mb-1.5"
      style={{ color: "var(--muted)" }}
    >
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-xl text-base outline-none"
      style={{
        padding: "13px 15px",
        background: "var(--surf2, var(--bg))",
        color: "var(--text)",
        border: "1px solid var(--border2, var(--border))",
        ...props.style,
      }}
    />
  );
}

function PrimaryButton({
  children,
  onClick,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      onClick={onClick}
      {...rest}
      className="w-full mt-6 py-4 rounded-2xl font-black uppercase text-base"
      style={{
        background: ACCENT,
        color: "#000",
        border: "none",
        cursor: rest.disabled ? "not-allowed" : "pointer",
        opacity: rest.disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}
