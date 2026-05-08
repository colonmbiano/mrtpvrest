"use client";
import { useState } from "react";
import { Lock, Building2, ArrowRight, ChevronLeft } from "lucide-react";
import api from "@/lib/api";

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

type Step = "login" | "location";

export default function LoginScreen({ onSuccess }: LoginScreenProps) {
  const [step, setStep] = useState<Step>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [authToken, setAuthToken] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { data: loginRes } = await api.post("/api/auth/login", { email, password });
      const token = loginRes.accessToken;
      setAuthToken(token);

      // Obtener sucursales accesibles para este admin.
      const restRes  = await api.get("/api/admin/config", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const locRes = await api.get<Location[]>("/api/admin/locations", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const list: Location[] = (locRes.data || []).filter((l) => l.isActive !== false);
      if (list.length === 0) {
        setError("No hay sucursales activas en tu cuenta.");
        setLoading(false);
        return;
      }

      setRestaurant({ id: restRes.data?.id || "", name: restRes.data?.name || "Restaurante", locations: list });
      setLocations(list);
      setStep("location");
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || "Credenciales incorrectas");
    } finally {
      setLoading(false);
    }
  };

  const handleLocationSelect = async (loc: Location) => {
    if (!restaurant) return;
    setLoading(true);
    setError("");

    try {
      // Crear/recuperar device KDS para esta sucursal.
      const { data: dev } = await api.post(
        "/api/devices/create",
        { locationId: loc.id, deviceType: "KDS", restaurantId: restaurant.id },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      // Canjear deviceToken por JWT de máquina (30 días, role KITCHEN).
      const { data: auth } = await api.post("/api/devices/auth", { deviceToken: dev.deviceToken });

      localStorage.setItem("accessToken",  auth.accessToken);
      localStorage.setItem("deviceToken",  dev.deviceToken);
      localStorage.setItem("deviceId",     dev.deviceId);
      localStorage.setItem("restaurantId", restaurant.id);
      localStorage.setItem("locationId",   loc.id);
      localStorage.setItem("locationName", loc.name);

      onSuccess();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || "Error vinculando dispositivo");
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-6 overflow-hidden bg-[#0a0a0c]">
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
        ) : (
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

            {loading && (
              <p className="text-center text-xs font-bold text-white/40">Vinculando dispositivo…</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
