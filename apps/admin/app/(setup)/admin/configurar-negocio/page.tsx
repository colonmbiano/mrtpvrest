// /admin/configurar-negocio · Wizard de tipo de negocio (cards)
//
// Pantalla full-screen (sin sidebar) que pide al admin elegir el tipo de
// negocio — Restaurante / Retail / Bar / Café — y crea el Restaurant/Location.
// Entradas:
//   · desde login/page.tsx cuando el user entra y no tiene restaurantes
//   · desde Sidebar.tsx botón "Añadir sucursal"
//
// Vive en app/(setup)/… (grupo invisible) para heredar un layout sin
// Sidebar y no mezclarse con las rutas operacionales bajo app/(admin)/…
//
// NO confundir con /onboarding (app/onboarding/page.tsx): ese es el chat
// IA del primer registro post-verify-email.
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

type BusinessType = "RESTAURANT" | "RETAIL" | "BAR" | "CAFE";

interface TypeCard {
  key: BusinessType;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ReactNode;
}

const CARDS: TypeCard[] = [
  {
    key: "RESTAURANT",
    title: "Restaurante",
    subtitle: "Servicio en mesa, cocina, delivery",
    description: "Pedidos por mesa, impresión en cocina, meseros y control de turnos.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10">
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
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10">
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
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10">
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
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10">
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
    <main className="min-h-screen font-sans text-tx" style={{ background: "var(--bg)" }}>
      <div className="mx-auto max-w-6xl px-6 py-16 md:py-24">
        <header className="mb-12 text-center md:mb-16">
          <div className="mb-6 inline-flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-[12px] font-display text-xs font-extrabold text-white" style={{ background: "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))" }}>MR</span>
            <span className="font-display text-lg font-extrabold tracking-[-.03em] text-tx-hi">MRTPV<span className="text-primary">REST</span></span>
          </div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-bd-1 bg-surf-1 px-3 py-1 font-mono text-[11px] uppercase tracking-[.14em] text-tx-mut shadow-[var(--shadow-sm)]">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--brand-primary)" }} />
            Configuración inicial
          </div>
          <h1 className="font-display text-3xl font-extrabold tracking-[-.04em] text-tx-hi md:text-5xl">
            ¿Qué tipo de negocio operas?
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-tx-mut md:text-lg">
            Esto adapta tu terminal al flujo perfecto. Podrás cambiarlo después en cualquier momento.
          </p>
        </header>

        {error && (
          <div className="mx-auto mb-8 max-w-2xl rounded-xl px-4 py-3 text-center text-sm font-semibold" style={{ border: "1px solid var(--err-soft)", background: "var(--err-soft)", color: "var(--err)" }}>
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
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
                  "group relative rounded-[20px] border bg-surf-1 p-6 text-left shadow-[var(--shadow-sm)] transition-all md:p-7",
                  "hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]",
                  isDisabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
                ].join(" ")}
                style={{
                  borderColor: isSelected ? "var(--brand-primary)" : "var(--bd-1)",
                  boxShadow: isSelected ? "0 0 0 1px var(--brand-primary), var(--shadow-md)" : undefined,
                  background: isSelected ? "var(--iris-soft)" : "var(--surf-1)",
                }}
              >
                <div
                  className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-[14px] border border-bd-1 transition-colors"
                  style={{
                    color: isSelected ? "var(--brand-primary)" : "var(--tx-mid)",
                    background: isSelected ? "var(--surf-1)" : "var(--surf-2)",
                  }}
                >
                  {card.icon}
                </div>
                <h2 className="mb-1 font-display text-xl font-extrabold tracking-[-.02em] text-tx-hi">{card.title}</h2>
                <p className="mb-3 font-mono text-[11px] uppercase tracking-[.12em] text-tx-dim">{card.subtitle}</p>
                <p className="text-sm leading-relaxed text-tx-mut">{card.description}</p>

                <div
                  className="absolute right-5 top-5 grid h-5 w-5 place-items-center rounded-full border transition-all"
                  style={{
                    borderColor: isSelected ? "var(--brand-primary)" : "var(--bd-2)",
                    background: isSelected ? "var(--brand-primary)" : "transparent",
                  }}
                >
                  {isSelected && saving && (
                    <span className="h-2 w-2 animate-ping rounded-full bg-white" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <footer className="mt-12 text-center text-xs text-tx-dim">
          Al continuar aceptas la adaptación de la interfaz al modo seleccionado.
        </footer>
      </div>
    </main>
  );
}
