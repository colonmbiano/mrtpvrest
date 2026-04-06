"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const BUSINESS_TYPES = [
  { key: "RESTAURANT", emoji: "🍔", label: "Restaurante",   desc: "Menú, mesas, cocina y delivery" },
  { key: "GROCERY",    emoji: "🛒", label: "Abarrotes",     desc: "Inventario, escáner y punto de venta rápido" },
  { key: "BUTCHER",    emoji: "🥩", label: "Carnicería",    desc: "Venta por kilo, cortes y caja" },
  { key: "POULTRY",    emoji: "🍗", label: "Pollería",      desc: "Venta al corte, piezas y combos" },
  { key: "OTHER",      emoji: "🏪", label: "Otro negocio",  desc: "Configura desde cero tu tipo de venta" },
] as const;

function authHeader() {
  const t = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading]       = useState(true);
  const [tenantName, setTenantName] = useState("");
  const [selected, setSelected]     = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState("");

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) { router.replace("/login"); return; }

    fetch(`${API}/api/tenant/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (r.status === 401) { router.replace("/login"); return null; }
        return r.json();
      })
      .then(data => {
        if (!data) return;
        if (data.isOnboarded) { router.replace("/admin"); return; }
        setTenantName(data.name || "");
        setLoading(false);
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  const handleSelect = async (businessType: string) => {
    if (saving) return;
    setSelected(businessType);
    setSaving(true);
    setError("");

    try {
      const res = await fetch(`${API}/api/tenant/me/business-type`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ businessType }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al guardar. Intenta de nuevo.");
        setSelected(null);
        setSaving(false);
        return;
      }
      router.push("/admin");
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
      setSelected(null);
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-6"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* Brand */}
      <div className="mb-2 text-center">
        <h1 className="text-3xl font-black tracking-tighter">
          MRTPV<span className="text-orange-500">REST</span>
        </h1>
      </div>

      {/* Header */}
      <div className="mb-10 text-center max-w-sm">
        <p className="text-2xl font-black mt-4 mb-2">
          {tenantName
            ? `¿Qué tipo de negocio es ${tenantName}?`
            : "¿Qué tipo de negocio tienes?"}
        </p>
        <p className="text-gray-500 text-sm">
          Configuramos las herramientas más útiles según tu giro.
        </p>
      </div>

      {/* Cards grid */}
      <div className="w-full max-w-2xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {BUSINESS_TYPES.map(({ key, emoji, label, desc }) => {
          const isSelected = selected === key;
          const isDisabled = saving && !isSelected;

          return (
            <button
              key={key}
              onClick={() => handleSelect(key)}
              disabled={saving}
              className={`
                relative flex flex-col items-center text-center gap-3 p-7 rounded-3xl border-2 transition-all duration-200
                ${isSelected
                  ? "border-orange-500 bg-orange-500/10 scale-[0.98]"
                  : isDisabled
                    ? "border-white/5 bg-white/[0.02] opacity-40 cursor-not-allowed"
                    : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06] hover:scale-[1.02] cursor-pointer"
                }
              `}
            >
              {isSelected && saving ? (
                <div className="w-12 h-12 flex items-center justify-center">
                  <div className="w-9 h-9 border-4 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
                </div>
              ) : (
                <span className="text-5xl leading-none">{emoji}</span>
              )}
              <div>
                <p className="font-black text-base mb-1">{label}</p>
                <p className="text-gray-500 text-xs leading-relaxed">{desc}</p>
              </div>
              {isSelected && !saving && (
                <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center">
                  <span className="text-black text-[10px] font-black">✓</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mt-6 max-w-sm w-full bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold px-4 py-3 rounded-2xl text-center">
          {error}
        </div>
      )}

      <p className="text-gray-600 text-xs mt-8">
        Puedes cambiar esto en la configuración de tu cuenta.
      </p>
    </div>
  );
}
