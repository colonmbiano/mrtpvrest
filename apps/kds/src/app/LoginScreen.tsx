"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronLeft,
  Layers,
  Lock,
  LogOut,
  Moon,
  Sun,
} from "lucide-react";
import api from "@/lib/api";
import KioskUnlockModal from "@/components/KioskUnlockModal";

const KDS_STATIONS = [
  { code: "KITCHEN", label: "Cocina", color: "#ef4444" },
  { code: "BAR", label: "Barra", color: "#3b82f6" },
  { code: "GRILL", label: "Plancha", color: "#f59e0b" },
  { code: "FRYER", label: "Freidora", color: "#f97316" },
] as const;

type StationMode = "central" | "specific";
type Step = "login" | "location" | "stations" | "done";

interface Location {
  id: string;
  name: string;
  isActive?: boolean;
}

interface Restaurant {
  id: string;
  name: string;
  locations?: Location[];
}

interface LoginScreenProps {
  onSuccess: () => void;
}

export default function LoginScreen({ onSuccess }: LoginScreenProps) {
  const [step, setStep] = useState<Step>("login");
  const [dark, setDark] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [pickedLocation, setPickedLocation] = useState<Location | null>(null);
  const [authToken, setAuthToken] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showUnlock, setShowUnlock] = useState(false);
  const [stationMode, setStationMode] = useState<StationMode>("central");
  const [selectedStations, setSelectedStations] = useState<string[]>(
    KDS_STATIONS.map((s) => s.code),
  );

  useEffect(() => {
    const stored = localStorage.getItem("kdsTheme");
    const nextDark = stored ? stored === "dark" : false;
    setDark(nextDark);
    document.documentElement.dataset.theme = nextDark ? "dark" : "light";
  }, []);

  const toggleTheme = () => {
    setDark((current) => {
      const next = !current;
      document.documentElement.dataset.theme = next ? "dark" : "light";
      localStorage.setItem("kdsTheme", next ? "dark" : "light");
      return next;
    });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { data: loginRes } = await api.post("/api/auth/login", { email, password });
      const token = loginRes.accessToken;
      const userRestaurantId: string | null = loginRes.user?.restaurantId || null;
      setAuthToken(token);

      if (userRestaurantId) {
        localStorage.setItem("restaurantId", userRestaurantId);
      }

      const tenantHeaders: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };
      if (userRestaurantId) tenantHeaders["x-restaurant-id"] = userRestaurantId;

      const restRes = await api.get("/api/admin/config", { headers: tenantHeaders });
      const resolvedRestId: string | null = userRestaurantId || restRes.data?.id || null;
      if (resolvedRestId) {
        localStorage.setItem("restaurantId", resolvedRestId);
        tenantHeaders["x-restaurant-id"] = resolvedRestId;
      }

      const locRes = await api.get<Location[]>("/api/admin/locations", { headers: tenantHeaders });
      const list: Location[] = (locRes.data || []).filter((l) => l.isActive !== false);
      if (list.length === 0) {
        setError("No hay sucursales activas en tu cuenta.");
        setLoading(false);
        return;
      }

      setRestaurant({ id: resolvedRestId || "", name: restRes.data?.name || "Restaurante", locations: list });
      setLocations(list);
      setStep("location");
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || "Credenciales incorrectas");
    } finally {
      setLoading(false);
    }
  };

  const handleLocationSelect = (loc: Location) => {
    setPickedLocation(loc);
    setError("");
    setStep("stations");
  };

  const toggleStation = (code: string) => {
    setSelectedStations((curr) => {
      if (curr.includes(code)) {
        const next = curr.filter((c) => c !== code);
        return next.length === 0 ? curr : next;
      }
      return [...curr, code];
    });
  };

  const handleStationsConfirm = async () => {
    if (!restaurant || !pickedLocation) return;
    setLoading(true);
    setError("");

    const finalStations = stationMode === "central"
      ? KDS_STATIONS.map((s) => s.code as string)
      : selectedStations;

    try {
      const { data: dev } = await api.post(
        "/api/devices/create",
        {
          locationId: pickedLocation.id,
          deviceType: "KDS",
          restaurantId: restaurant.id,
        },
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
            "x-restaurant-id": restaurant.id,
            "x-location-id": pickedLocation.id,
          },
        },
      );

      const { data: auth } = await api.post("/api/devices/auth", { deviceToken: dev.deviceToken });

      localStorage.setItem("accessToken", auth.accessToken);
      localStorage.setItem("deviceToken", dev.deviceToken);
      localStorage.setItem("deviceId", dev.deviceId);
      localStorage.setItem("restaurantId", restaurant.id);
      localStorage.setItem("locationId", pickedLocation.id);
      localStorage.setItem("locationName", pickedLocation.name);
      localStorage.setItem("kdsStations", JSON.stringify(finalStations));
      localStorage.setItem("kdsMode", stationMode);

      setStep("done");
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || "Error vinculando dispositivo");
    } finally {
      setLoading(false);
    }
  };

  const stepNumber = step === "login" ? 1 : step === "location" ? 2 : 3;
  const progress = step === "login" ? "33%" : step === "location" ? "66%" : "100%";
  const finalStations = stationMode === "central"
    ? KDS_STATIONS.map((s) => s.label).join(", ")
    : KDS_STATIONS.filter((s) => selectedStations.includes(s.code)).map((s) => s.label).join(", ");

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-[var(--paper)] p-6 text-[var(--ink)]">
      <button
        type="button"
        onClick={toggleTheme}
        className="fixed right-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-[14px] border border-[var(--line)] bg-[var(--card)] text-[var(--muted)] shadow-[0_8px_22px_var(--shadow)] active:scale-95"
        aria-label="Cambiar tema"
      >
        {dark ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <button
        type="button"
        onClick={() => setShowUnlock(true)}
        className="fixed bottom-4 right-4 z-20 flex h-11 w-11 items-center justify-center rounded-[14px] border border-[var(--line)] bg-[var(--card)] text-[var(--muted)] shadow-[0_8px_22px_var(--shadow)] active:scale-95"
        aria-label="Desbloquear tablet"
      >
        <LogOut size={18} />
      </button>

      <div className="relative z-10 w-full max-w-[460px] rounded-[26px] border border-[var(--line)] bg-[var(--card)] p-7 shadow-[0_30px_80px_var(--shadow)] sm:p-8">
        {step !== "done" && (
          <div className="mb-7">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--honey)]">
                Paso {stepNumber} - {step === "login" ? "Acceso" : step === "location" ? "Sucursal" : "Estaciones"}
              </span>
              <span className="font-mono text-[10px] font-bold text-[var(--muted)]">{stepNumber}/3</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--field)]">
              <div className="h-full rounded-full bg-[var(--honey)] transition-[width] duration-300" style={{ width: progress }} />
            </div>
          </div>
        )}

        {step === "login" && (
          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            <div className="mb-2 flex flex-col items-center gap-3 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-[18px] border border-[var(--line)] bg-[var(--honey-soft)] text-[var(--honey)]">
                <Lock size={28} strokeWidth={2.5} />
              </div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--honey)]">KDS - Setup</span>
              <h1 className="text-[30px] font-extrabold leading-tight text-[var(--ink)]">Inicia sesion como admin</h1>
              <p className="max-w-xs text-sm font-medium text-[var(--muted)]">
                Para vincular esta tablet como pantalla de cocina.
              </p>
            </div>

            <Field label="Correo electronico">
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@restaurant.com"
                className="h-[54px] w-full rounded-[14px] border border-[var(--line)] bg-[var(--field)] px-5 text-[var(--ink)] outline-none transition focus:border-[var(--honey)] focus:shadow-[0_0_0_4px_var(--honey-soft)]"
              />
            </Field>

            <Field label="Contrasena">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
                className="h-[54px] w-full rounded-[14px] border border-[var(--line)] bg-[var(--field)] px-5 text-[var(--ink)] outline-none transition focus:border-[var(--honey)] focus:shadow-[0_0_0_4px_var(--honey-soft)]"
              />
            </Field>

            {error && <ErrorBox>{error}</ErrorBox>}

            <PrimaryButton disabled={loading}>
              {loading ? "Validando..." : <>Continuar <ArrowRight size={16} strokeWidth={3} /></>}
            </PrimaryButton>
          </form>
        )}

        {step === "location" && (
          <div className="flex flex-col gap-5">
            <StepHeader
              kicker="KDS - Sucursal"
              title="Elige sucursal"
              body="El KDS se vinculara a esta sucursal de forma permanente."
              onBack={() => { setStep("login"); setError(""); }}
            />

            <div className="flex max-h-[55vh] flex-col gap-2.5 overflow-y-auto">
              {locations.map((loc) => (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => handleLocationSelect(loc)}
                  disabled={loading}
                  className="flex min-h-[74px] items-center gap-4 rounded-[18px] border border-[var(--line)] bg-[var(--card)] p-5 text-left shadow-[0_5px_14px_var(--shadow)] transition hover:border-[var(--honey)] active:scale-[0.98] disabled:opacity-40"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] border border-[var(--line)] bg-[var(--honey-soft)] text-[var(--honey)]">
                    <Building2 size={22} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-bold text-[var(--ink)]">{loc.name}</p>
                    <p className="text-[12px] font-medium text-[var(--muted)]">{restaurant?.name}</p>
                  </div>
                  <ArrowRight size={18} strokeWidth={3} className="shrink-0 text-[var(--ink-sub)]" />
                </button>
              ))}
            </div>

            {error && <ErrorBox>{error}</ErrorBox>}
          </div>
        )}

        {step === "stations" && (
          <div className="flex flex-col gap-5">
            <StepHeader
              kicker="KDS - Estaciones"
              title="Que muestra esta pantalla?"
              body="Define si esta tablet es una cocina central o una estacion especifica."
              onBack={() => { setStep("location"); setError(""); }}
            />

            <div className="grid grid-cols-2 gap-3">
              <ModeCard
                active={stationMode === "central"}
                title="Cocina central"
                body="Todas las estaciones"
                onClick={() => setStationMode("central")}
              />
              <ModeCard
                active={stationMode === "specific"}
                title="Estacion especifica"
                body="Solo lo que elijas"
                onClick={() => setStationMode("specific")}
              />
            </div>

            {stationMode === "specific" && (
              <div className="grid grid-cols-2 gap-2">
                {KDS_STATIONS.map((s) => {
                  const active = selectedStations.includes(s.code);
                  return (
                    <button
                      key={s.code}
                      type="button"
                      onClick={() => toggleStation(s.code)}
                      className="flex items-center gap-3 rounded-[13px] border p-3 transition-all active:scale-95"
                      style={{
                        background: active ? `${s.color}20` : "var(--field)",
                        borderColor: active ? s.color : "var(--line)",
                        color: active ? "var(--ink)" : "var(--muted)",
                      }}
                    >
                      <span className="h-3 w-3 rounded-full" style={{ background: active ? s.color : "var(--ink-sub)" }} />
                      <span className="text-sm font-bold">{s.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {error && <ErrorBox>{error}</ErrorBox>}

            <PrimaryButton type="button" onClick={handleStationsConfirm} disabled={loading}>
              {loading ? "Vinculando..." : <>Vincular pantalla <ArrowRight size={16} strokeWidth={3} /></>}
            </PrimaryButton>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-5 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-[24px] border border-[var(--line)] bg-[var(--green-soft)] text-[var(--solid-green)]">
              <CheckCircle2 size={38} strokeWidth={2.4} />
            </div>
            <div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--brand)]">KDS vinculado</span>
              <h1 className="mt-2 text-[30px] font-extrabold leading-tight text-[var(--ink)]">Pantalla vinculada</h1>
              <p className="mt-2 text-sm font-medium text-[var(--muted)]">
                {pickedLocation?.name} - {finalStations}
              </p>
            </div>
            <button
              type="button"
              onClick={onSuccess}
              className="inline-flex min-h-[60px] w-full items-center justify-center gap-2 rounded-[16px] bg-[var(--ink)] px-5 py-4 text-sm font-extrabold uppercase tracking-[0.14em] text-[var(--card)] shadow-[0_12px_32px_var(--shadow)] transition-transform active:scale-95"
            >
              Abrir cocina <ArrowRight size={16} strokeWidth={3} />
            </button>
          </div>
        )}
      </div>

      {showUnlock && <KioskUnlockModal onClose={() => setShowUnlock(false)} />}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">{label}</span>
      {children}
    </label>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[14px] border border-[var(--line)] bg-[var(--red-soft)] p-3 text-center text-sm font-semibold text-[var(--solid-red)]">
      {children}
    </div>
  );
}

function PrimaryButton({
  children,
  type = "submit",
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  type?: "submit" | "button";
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-[60px] w-full items-center justify-center gap-2 rounded-[16px] bg-[var(--honey)] px-5 py-4 text-sm font-extrabold uppercase tracking-[0.14em] text-white shadow-[0_12px_32px_var(--shadow)] transition-transform active:scale-95 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function StepHeader({
  kicker,
  title,
  body,
  onBack,
}: {
  kicker: string;
  title: string;
  body: string;
  onBack: () => void;
}) {
  return (
    <div className="mb-2 flex items-start gap-3">
      <button
        type="button"
        onClick={onBack}
        className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-[var(--line)] bg-[var(--field)] text-[var(--ink)] transition-transform active:scale-95"
        aria-label="Atras"
      >
        <ChevronLeft size={18} />
      </button>
      <div>
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--honey)]">{kicker}</span>
        <h1 className="mt-1 text-2xl font-extrabold text-[var(--ink)]">{title}</h1>
        <p className="mt-1 text-xs font-medium text-[var(--muted)]">{body}</p>
      </div>
    </div>
  );
}

function ModeCard({
  active,
  title,
  body,
  onClick,
}: {
  active: boolean;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-1.5 rounded-[18px] border p-4 text-left transition-all active:scale-95"
      style={{
        background: active ? "var(--honey-soft)" : "var(--card)",
        borderColor: active ? "var(--honey)" : "var(--line)",
      }}
    >
      <Layers size={18} className="text-[var(--honey)]" />
      <span className="text-sm font-bold text-[var(--ink)]">{title}</span>
      <span className="text-[10px] font-bold text-[var(--muted)]">{body}</span>
    </button>
  );
}
