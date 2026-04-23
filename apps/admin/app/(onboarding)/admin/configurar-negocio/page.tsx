"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

type BusinessType = "RESTAURANT" | "RETAIL" | "BAR" | "CAFE";

interface TypeCard {
  key: BusinessType;
  title: string;
  subtitle: string;
  description: string;
  icon: JSX.Element;
}

const CARDS: TypeCard[] = [
  {
    key: "RESTAURANT",
    title: "Restaurante",
    subtitle: "Servicio en mesa, cocina, delivery",
    description: "Pedidos por mesa, impresión en cocina, meseros y control de turnos.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10">
        <path d="M7 2v20" />
        <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Z" />
        <path d="M3 6v4a3 3 0 0 0 3 3" />
      </svg>
    ),
  },
  {
    key: "RETAIL",
    title: "Abarrotes / Retail",
    subtitle: "Tienda con inventario y código de barras",
    description: "Scanner, catálogo por SKU, precios por peso y control de stock.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10">
        <path d="M3 9l1.5-6h15L21 9" />
        <path d="M3 9h18v12H3z" />
        <path d="M8 13h8" />
      </svg>
    ),
  },
  {
    key: "BAR",
    title: "Bar",
    subtitle: "Consumo por comanda, cuentas abiertas",
    description: "Bebidas por categoría, propinas, cuentas divididas y cierre nocturno.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10">
        <path d="M3 3h18l-7 9v7h3v2H7v-2h3v-7Z" />
      </svg>
    ),
  },
  {
    key: "CAFE",
    title: "Cafetería",
    subtitle: "Bebidas y repostería para llevar",
    description: "Flujo rápido de mostrador, modificadores (leche, azúcar) y fidelidad.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10">
        <path d="M3 9h14v6a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
        <path d="M17 10h2a2 2 0 0 1 0 4h-2" />
        <path d="M7 3v3" />
        <path d="M11 3v3" />
      </svg>
    ),
  },
];

export default function ConfigurarNegocioPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<BusinessType | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [resolvingLocation, setResolvingLocation] = useState(true);

  // Resolvemos la sucursal en este orden:
  // 1. localStorage.locationId (si el usuario ya la tiene seleccionada).
  // 2. GET /api/admin/locations — primera sucursal activa del restaurant.
  // 3. POST /api/admin/locations — crear "Principal" si no hay ninguna
  //    (defensa en profundidad; el registro ya debería haberla creado, pero
  //    si alguien llega al onboarding sin sucursal por cuenta legacy, se
  //    auto-arregla).
  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      if (typeof window === "undefined") return;

      const fromLS = localStorage.getItem("locationId");
      if (fromLS) {
        if (!cancelled) { setLocationId(fromLS); setResolvingLocation(false); }
        return;
      }

      try {
        const { data } = await api.get<any[]>("/api/admin/locations");
        const active = (data || []).filter(l => l.isActive !== false);
        if (active.length > 0) {
          const first = active[0];
          localStorage.setItem("locationId", first.id);
          if (first.name) localStorage.setItem("locationName", first.name);
          if (!cancelled) { setLocationId(first.id); setResolvingLocation(false); }
          return;
        }

        // No hay ninguna — la creamos.
        const created = await api.post("/api/admin/locations", { name: "Principal", slug: "principal" });
        localStorage.setItem("locationId", created.data.id);
        localStorage.setItem("locationName", created.data.name || "Principal");
        if (!cancelled) { setLocationId(created.data.id); setResolvingLocation(false); }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.response?.data?.error || err?.message || "No se pudo preparar tu sucursal.");
          setResolvingLocation(false);
        }
      }
    }

    resolve();
    return () => { cancelled = true; };
  }, []);

  const handleSelect = async (key: BusinessType) => {
    if (saving || resolvingLocation) return;
    setSelected(key);
    setError(null);

    if (!locationId) {
      setError("No pudimos preparar tu sucursal. Recarga la página o contacta soporte.");
      return;
    }

    setSaving(true);
    try {
      await api.put(`/api/locations/${locationId}/business-type`, { businessType: key });
      router.push("/admin");
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.message ||
        "Error al guardar el tipo de negocio";
      setError(msg);
      setSelected(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white font-[DM_Sans,system-ui,sans-serif]">
      <div className="mx-auto max-w-6xl px-6 py-16 md:py-24">
        <header className="mb-12 md:mb-16 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs tracking-wide text-white/70 mb-6">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--brand-primary)" }}
            />
            Configuración inicial
          </div>
          <h1 className="text-3xl md:text-5xl font-semibold tracking-tight">
            ¿Qué tipo de negocio operas?
          </h1>
          <p className="mt-4 text-white/60 max-w-2xl mx-auto text-base md:text-lg">
            Esto adapta tu terminal al flujo perfecto. Podrás cambiarlo después en cualquier momento.
          </p>
        </header>

        {error && (
          <div className="mb-8 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 text-center">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          {CARDS.map((card) => {
            const isSelected = selected === card.key;
            const isDisabled = saving && !isSelected;
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => handleSelect(card.key)}
                disabled={isDisabled}
                aria-pressed={isSelected}
                className={[
                  "group relative text-left rounded-2xl border p-6 md:p-7 transition-all",
                  "bg-white/[0.03] hover:bg-white/[0.06]",
                  "border-white/10 hover:border-white/25",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]",
                  isSelected
                    ? "border-[var(--brand-primary)]/70 bg-white/[0.08] shadow-[0_0_0_1px_var(--brand-primary)]"
                    : "",
                  isDisabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
                ].join(" ")}
              >
                <div
                  className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-black/40 transition-colors"
                  style={{ color: isSelected ? "var(--brand-primary)" : undefined }}
                >
                  {card.icon}
                </div>
                <h2 className="text-xl font-semibold tracking-tight mb-1">{card.title}</h2>
                <p className="text-xs uppercase tracking-wider text-white/40 mb-3">{card.subtitle}</p>
                <p className="text-sm text-white/60 leading-relaxed">{card.description}</p>

                <div
                  className="absolute top-5 right-5 h-5 w-5 rounded-full border transition-all"
                  style={{
                    borderColor: isSelected ? "var(--brand-primary)" : "rgba(255,255,255,0.15)",
                    background: isSelected ? "var(--brand-primary)" : "transparent",
                  }}
                >
                  {isSelected && saving && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="h-2 w-2 animate-ping rounded-full bg-white" />
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <footer className="mt-12 text-center text-xs text-white/40">
          Al continuar aceptas la adaptación de la interfaz al modo seleccionado.
        </footer>
      </div>
    </main>
  );
}
