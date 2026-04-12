"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

const ACCENT = "#ff5c35";

export default function SetupPage() {
  const router = useRouter();

  const [step, setStep]                       = useState<1 | 2>(1);
  const [email, setEmail]                     = useState("");
  const [password, setPassword]               = useState("");
  const [showPassword, setShowPassword]       = useState(false);
  const [restaurant, setRestaurant]           = useState<{ id: number; name: string } | null>(null);
  const [locations, setLocations]             = useState<{ id: number; name: string; slug?: string }[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/api/auth/login", { email, password });
      const token = data.token;
      if (token) localStorage.setItem("accessToken", token);

      const restId = data.restaurant?.id || data.user?.restaurantId;
      if (restId) localStorage.setItem("restaurantId", String(restId));

      const { data: locs } = await api.get("/api/admin/locations");
      const restName = data.restaurant?.name || "Tu restaurante";

      setRestaurant({ id: restId, name: restName });
      setLocations(locs);
      if (locs.length === 1) setSelectedLocationId(String(locs[0].id));
      setStep(2);
    } catch {
      setError("Correo o contraseña incorrectos");
    } finally {
      setLoading(false);
    }
  }

  function handleStart() {
    if (!selectedLocationId) { setError("Selecciona una sucursal"); return; }
    localStorage.setItem("locationId", selectedLocationId);
    router.push("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <h1
            className="text-5xl font-black uppercase tracking-tighter"
            style={{ color: ACCENT }}
          >
            MRTPVREST
          </h1>
          <p className="text-sm mt-1 font-medium" style={{ color: "var(--muted)" }}>
            {step === 1 ? "Configura este dispositivo" : `Bienvenido a ${restaurant?.name}`}
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-3xl border p-8 shadow-2xl flex flex-col gap-5"
          style={{ background: "var(--surf)", borderColor: "var(--border)" }}
        >

          {/* Indicador de pasos */}
          <div className="flex items-center gap-2 mb-1">
            {[1, 2].map((s) => (
              <div
                key={s}
                className="h-1.5 flex-1 rounded-full transition-all duration-300"
                style={{ background: step >= s ? ACCENT : "var(--surf2, #2a2a2a)" }}
              />
            ))}
          </div>

          {step === 1 && (
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold mb-1.5 block" style={{ color: "var(--muted)" }}>
                  Correo electrónico
                </label>
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="admin@restaurante.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-2xl text-sm outline-none border transition-colors"
                  style={{
                    background: "var(--bg)",
                    borderColor: "var(--border)",
                    color: "var(--text)",
                  }}
                  onFocus={e  => (e.currentTarget.style.borderColor = ACCENT)}
                  onBlur={e   => (e.currentTarget.style.borderColor = "var(--border)")}
                />
              </div>

              <div>
                <label className="text-xs font-bold mb-1.5 block" style={{ color: "var(--muted)" }}>
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    className="w-full px-4 py-3 pr-12 rounded-2xl text-sm outline-none border transition-colors"
                    style={{
                      background: "var(--bg)",
                      borderColor: "var(--border)",
                      color: "var(--text)",
                    }}
                    onFocus={e => (e.currentTarget.style.borderColor = ACCENT)}
                    onBlur={e  => (e.currentTarget.style.borderColor = "var(--border)")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 text-sm"
                  >
                    {showPassword ? "🙈" : "👁"}
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-sm text-center text-red-400">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || !email || !password}
                className="w-full py-4 rounded-2xl text-base font-black uppercase tracking-wide transition-all disabled:opacity-50 hover:brightness-110 active:scale-95"
                style={{ background: ACCENT, color: "#000" }}
              >
                {loading ? "Verificando..." : "Continuar →"}
              </button>
            </form>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold mb-1.5 block" style={{ color: "var(--muted)" }}>
                  Sucursal
                </label>
                <select
                  value={selectedLocationId}
                  onChange={e => { setSelectedLocationId(e.target.value); setError(""); }}
                  className="w-full px-4 py-3 rounded-2xl text-sm outline-none border transition-colors appearance-none cursor-pointer"
                  style={{
                    background: "var(--bg)",
                    borderColor: "var(--border)",
                    color: selectedLocationId ? "var(--text)" : "var(--muted)",
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = ACCENT)}
                  onBlur={e  => (e.currentTarget.style.borderColor = "var(--border)")}
                >
                  <option value="" disabled>Selecciona una sucursal...</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={String(loc.id)}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>

              {error && (
                <p className="text-sm text-center text-red-400">{error}</p>
              )}

              <button
                onClick={handleStart}
                disabled={!selectedLocationId}
                className="w-full py-4 rounded-2xl text-base font-black uppercase tracking-wide transition-all disabled:opacity-50 hover:brightness-110 active:scale-95"
                style={{ background: ACCENT, color: "#000" }}
              >
                Iniciar Operación
              </button>

              <button
                onClick={() => { setStep(1); setError(""); setLocations([]); setRestaurant(null); setSelectedLocationId(""); }}
                className="text-xs text-center underline"
                style={{ color: "var(--muted)" }}
              >
                ← Volver
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
