"use client";
import { useState } from "react";
import { Lock, Building2, ArrowRight, ChevronLeft, Layers, LogOut } from "lucide-react";
import api from "@/lib/api";
import KioskUnlockModal from "@/components/KioskUnlockModal";

// Estaciones soportadas por el KDS. Mismo enum que el TPV/admin para
// que los pedidos lleguen filtrados consistentemente.
const KDS_STATIONS = [
  { code: "KITCHEN", label: "Cocina",   color: "#ef4444" },
  { code: "BAR",     label: "Barra",    color: "#3b82f6" },
  { code: "GRILL",   label: "Plancha",  color: "#f59e0b" },
  { code: "FRYER",   label: "Freidora", color: "#f97316" },
] as const;

type StationMode = "central" | "specific";

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

type Step = "login" | "location" | "stations";

export default function LoginScreen({ onSuccess }: LoginScreenProps) {
  const [step, setStep] = useState<Step>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [pickedLocation, setPickedLocation] = useState<Location | null>(null);
  const [authToken, setAuthToken] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showUnlock, setShowUnlock] = useState(false);

  // Modo de operación de esta pantalla KDS.
  const [stationMode, setStationMode] = useState<StationMode>("central");
  const [selectedStations, setSelectedStations] = useState<string[]>(
    KDS_STATIONS.map((s) => s.code),
  );

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { data: loginRes } = await api.post("/api/auth/login", { email, password });
      const token = loginRes.accessToken;
      const userRestaurantId: string | null = loginRes.user?.restaurantId || null;
      setAuthToken(token);

      // Persistimos el restaurantId del JWT lo antes posible para que el
      // interceptor de api.ts ponga el header x-restaurant-id.
      if (userRestaurantId) {
        localStorage.setItem("restaurantId", userRestaurantId);
      }

      // Headers para garantizar resolución de tenant en el backend cuando
      // todavía no hay restaurantId en localStorage (primer login).
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
            "x-location-id":   pickedLocation.id,
          },
        },
      );

      const { data: auth } = await api.post("/api/devices/auth", { deviceToken: dev.deviceToken });

      localStorage.setItem("accessToken",  auth.accessToken);
      localStorage.setItem("deviceToken",  dev.deviceToken);
      localStorage.setItem("deviceId",     dev.deviceId);
      localStorage.setItem("restaurantId", restaurant.id);
      localStorage.setItem("locationId",   pickedLocation.id);
      localStorage.setItem("locationName", pickedLocation.name);
      // Persistimos la configuración de estaciones — el KdsScreen la lee
      // al montar para filtrar el polling y los tabs.
      localStorage.setItem("kdsStations", JSON.stringify(finalStations));
      localStorage.setItem("kdsMode",     stationMode);

      onSuccess();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || "Error vinculando dispositivo");
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-6 overflow-hidden bg-[#0a0a0c]">
      <button
        type="button"
        onClick={() => setShowUnlock(true)}
        className="fixed right-4 bottom-4 z-20 w-12 h-12 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10 text-white/45 active:scale-95"
        aria-label="Desbloquear tablet"
      >
        <LogOut size={18} />
      </button>
      {/* Ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-60 -left-60 w-[700px] h-[700px] rounded-full blur-[120px] opacity-50"
        style={{ background: "radial-gradient(circle, rgba(255,184,77,0.18) 0%, transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-60 -right-60 w-[700px] h-[700px] rounded-full blur-[120px] opacity-40"
        style={{ background: "radial-gradient(circle, rgba(136,214,108,0.10) 0%, transparent 70%)" }}
      />

      <div className="relative z-10 w-full max-w-md rounded-3xl p-8 bg-white/5 backdrop-blur-md border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.4)]">
        {step === "login" ? (
          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            <div className="flex flex-col items-center text-center gap-3 mb-2">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-[#ffb84d]/15 text-[#ffb84d] border border-[#ffb84d]/30">
                <Lock size={28} strokeWidth={2.5} />
              </div>
              <span className="text-[10px] font-black tracking-[0.3em] uppercase text-[#ffb84d]">KDS · Setup</span>
              <h1 className="text-3xl font-black text-white tracking-tight">Inicia sesión como ADMIN</h1>
              <p className="text-sm font-medium text-white/55 max-w-xs">
                Para vincular esta tablet como pantalla de cocina.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/55">Correo electrónico</label>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@restaurant.com"
                className="w-full h-14 px-5 rounded-2xl bg-white/5 border border-white/10 text-white outline-none focus:border-[#ffb84d]/50 transition-colors"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/55">Contraseña</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-14 px-5 rounded-2xl bg-white/5 border border-white/10 text-white outline-none focus:border-[#ffb84d]/50 transition-colors"
              />
            </div>

            {error && (
              <div className="rounded-2xl p-3 text-sm font-semibold text-center"
                   style={{ background: "rgba(255,92,51,0.10)", border: "1px solid rgba(255,92,51,0.30)", color: "#FF8B6E" }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 w-full min-h-[64px] py-4 rounded-2xl text-sm font-black uppercase tracking-[0.2em] text-[#0a0a0c] bg-[#ffb84d] active:scale-95 transition-transform disabled:opacity-40 shadow-[0_15px_40px_rgba(255,184,77,0.25)]"
            >
              {loading ? "Validando…" : <>Continuar <ArrowRight size={16} strokeWidth={3} /></>}
            </button>
          </form>
        ) : step === "location" ? (
          <div className="flex flex-col gap-5">
            <div className="flex items-start gap-3 mb-2">
              <button
                type="button"
                onClick={() => { setStep("login"); setError(""); }}
                className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center active:scale-95 transition-transform text-white/85"
                aria-label="Atrás"
              >
                <ChevronLeft size={18} />
              </button>
              <div>
                <span className="text-[10px] font-black tracking-[0.3em] uppercase text-[#ffb84d]">KDS · Sucursal</span>
                <h1 className="text-2xl font-black text-white tracking-tight mt-1">Elige sucursal</h1>
                <p className="text-xs font-medium text-white/55 mt-1">
                  El KDS se vinculará a esta sucursal de forma permanente.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2.5 max-h-[55vh] overflow-y-auto">
              {locations.map((loc) => (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => handleLocationSelect(loc)}
                  disabled={loading}
                  className="flex items-center gap-4 p-5 min-h-[72px] rounded-2xl bg-white/5 border border-white/10 active:scale-95 transition-transform text-left disabled:opacity-40"
                >
                  <div className="w-12 h-12 rounded-xl bg-[#ffb84d]/15 text-[#ffb84d] border border-[#ffb84d]/30 flex items-center justify-center flex-shrink-0">
                    <Building2 size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-white tracking-tight">{loc.name}</p>
                    <p className="text-[11px] font-medium text-white/55">{restaurant?.name}</p>
                  </div>
                  <ArrowRight size={18} strokeWidth={3} className="text-white/30 flex-shrink-0" />
                </button>
              ))}
            </div>

            {error && (
              <div className="rounded-2xl p-3 text-sm font-semibold text-center"
                   style={{ background: "rgba(255,92,51,0.10)", border: "1px solid rgba(255,92,51,0.30)", color: "#FF8B6E" }}>
                {error}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex items-start gap-3 mb-2">
              <button
                type="button"
                onClick={() => { setStep("location"); setError(""); }}
                className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center active:scale-95 transition-transform text-white/85"
                aria-label="Atrás"
              >
                <ChevronLeft size={18} />
              </button>
              <div>
                <span className="text-[10px] font-black tracking-[0.3em] uppercase text-[#ffb84d]">KDS · Estaciones</span>
                <h1 className="text-2xl font-black text-white tracking-tight mt-1">¿Qué muestra esta pantalla?</h1>
                <p className="text-xs font-medium text-white/55 mt-1">
                  Define si esta tablet es una cocina central o una estación específica.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setStationMode("central")}
                className="flex flex-col items-start gap-1.5 p-4 rounded-2xl border transition-all active:scale-95 text-left"
                style={{
                  background:  stationMode === "central" ? "rgba(255,184,77,0.10)" : "rgba(255,255,255,0.03)",
                  borderColor: stationMode === "central" ? "#ffb84d"               : "rgba(255,255,255,0.10)",
                }}
              >
                <Layers size={18} className="text-[#ffb84d]" />
                <span className="text-sm font-black text-white">Cocina central</span>
                <span className="text-[10px] font-bold text-white/50">Todas las estaciones</span>
              </button>
              <button
                type="button"
                onClick={() => setStationMode("specific")}
                className="flex flex-col items-start gap-1.5 p-4 rounded-2xl border transition-all active:scale-95 text-left"
                style={{
                  background:  stationMode === "specific" ? "rgba(255,184,77,0.10)" : "rgba(255,255,255,0.03)",
                  borderColor: stationMode === "specific" ? "#ffb84d"               : "rgba(255,255,255,0.10)",
                }}
              >
                <Layers size={18} className="text-[#ffb84d]" />
                <span className="text-sm font-black text-white">Estación específica</span>
                <span className="text-[10px] font-bold text-white/50">Solo lo que elijas</span>
              </button>
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
                      className="flex items-center gap-3 p-3 rounded-xl border transition-all active:scale-95"
                      style={{
                        background:  active ? s.color + "20" : "rgba(255,255,255,0.03)",
                        borderColor: active ? s.color        : "rgba(255,255,255,0.10)",
                        color:       active ? "#ffffff"      : "rgba(255,255,255,0.55)",
                      }}
                    >
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ background: active ? s.color : "rgba(255,255,255,0.10)" }}
                      />
                      <span className="text-sm font-black">{s.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {error && (
              <div className="rounded-2xl p-3 text-sm font-semibold text-center"
                   style={{ background: "rgba(255,92,51,0.10)", border: "1px solid rgba(255,92,51,0.30)", color: "#FF8B6E" }}>
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleStationsConfirm}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 w-full min-h-[64px] py-4 rounded-2xl text-sm font-black uppercase tracking-[0.2em] text-[#0a0a0c] bg-[#ffb84d] active:scale-95 transition-transform disabled:opacity-40 shadow-[0_15px_40px_rgba(255,184,77,0.25)]"
            >
              {loading ? "Vinculando…" : <>Vincular pantalla <ArrowRight size={16} strokeWidth={3} /></>}
            </button>
          </div>
        )}
      </div>
      {showUnlock && <KioskUnlockModal onClose={() => setShowUnlock(false)} />}
    </div>
  );
}
