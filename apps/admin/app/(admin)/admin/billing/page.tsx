"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import api from "@/lib/api";

type Plan = {
  id: string;
  name: "BASIC" | "PRO" | "UNLIMITED" | string;
  displayName: string;
  price: number;
  trialDays: number;
  maxLocations: number;
  maxEmployees: number;
  hasKDS: boolean;
  hasLoyalty: boolean;
  hasInventory: boolean;
  hasReports: boolean;
  hasAPIAccess: boolean;
  stripePriceId: string | null;
  allowedModules: string[];
  isActive: boolean;
};

type Subscription = {
  id: string;
  status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELLED" | "EXPIRED";
  trialEndsAt: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelledAt: string | null;
  priceSnapshot: number;
  externalId: string | null;
  paymentGateway: string | null;
  plan: { id: string; name: string; displayName: string; price: number; stripePriceId: string | null };
};

type StatusResponse = {
  tenant: { id: string; name: string; stripeCustomerId: string | null; ownerEmail: string };
  subscription: Subscription | null;
};

const STATUS_META: Record<Subscription["status"], { label: string; color: string; soft: string }> = {
  TRIAL:     { label: "Prueba gratis",     color: "var(--info)",  soft: "var(--info-soft)"  },
  ACTIVE:    { label: "Activa",             color: "var(--ok)",    soft: "var(--ok-soft)"    },
  PAST_DUE:  { label: "Pago pendiente",     color: "var(--warn)",  soft: "var(--warn-soft)"  },
  SUSPENDED: { label: "Suspendida",         color: "var(--err)",   soft: "var(--err-soft)"   },
  CANCELLED: { label: "Cancelada",          color: "var(--err)",   soft: "var(--err-soft)"   },
  EXPIRED:   { label: "Expirada",           color: "var(--err)",   soft: "var(--err-soft)"   },
};

function fmtMoney(n: number) {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="p-10" style={{ color: "var(--tx-mut)" }}>Cargando…</div>}>
      <BillingInner />
    </Suspense>
  );
}

function BillingInner() {
  const searchParams = useSearchParams();
  const returnStatus = searchParams.get("status"); // success | cancel
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, plansRes] = await Promise.all([
        api.get<StatusResponse>("/api/billing/status"),
        api.get<Plan[]>("/api/saas/plans"),
      ]);
      setStatus(statusRes.data);
      const list = Array.isArray(plansRes.data) ? plansRes.data : [];
      setPlans(list.filter(p => p.isActive));
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || "Error al cargar billing");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const currentPlanId = status?.subscription?.plan?.id ?? null;

  async function startCheckout(planId: string) {
    setActionLoading(`checkout:${planId}`);
    setError(null);
    try {
      const { data } = await api.post<{ url: string }>("/api/billing/checkout", { planId });
      if (data?.url) window.location.href = data.url;
    } catch (e: any) {
      const msg = e.response?.data?.error || e.message;
      if (msg === "PLAN_HAS_NO_STRIPE_PRICE") {
        setError("Este plan aún no tiene un precio de Stripe asociado.");
      } else {
        setError(msg || "No se pudo iniciar el checkout");
      }
      setActionLoading(null);
    }
  }

  async function openPortal() {
    setActionLoading("portal");
    setError(null);
    try {
      const { data } = await api.post<{ url: string }>("/api/billing/portal");
      if (data?.url) window.location.href = data.url;
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || "No se pudo abrir el portal");
      setActionLoading(null);
    }
  }

  const subStatusMeta = useMemo(() => {
    if (!status?.subscription) return null;
    return STATUS_META[status.subscription.status];
  }, [status]);

  return (
    <div className="p-6 md:p-10" style={{ color: "var(--tx)" }}>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <header className="mb-8">
          <div className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: "var(--tx-mut)" }}>
            Suscripción SaaS
          </div>
          <h1 className="mt-1 text-3xl font-black tracking-tight" style={{ fontFamily: "var(--f-d)", color: "var(--tx-hi)" }}>
            Facturación
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--tx-mut)" }}>
            Gestiona tu plan, tu método de pago y tus facturas de MRTPVREST.
          </p>
        </header>

        {/* Return banner from Stripe */}
        {returnStatus === "success" && (
          <div
            className="mb-6 rounded-xl p-4 text-sm"
            style={{ background: "var(--ok-soft)", border: "1px solid var(--ok)", color: "var(--ok)" }}
          >
            ✓ Pago procesado. Tu suscripción se activará en unos segundos.
          </div>
        )}
        {returnStatus === "cancel" && (
          <div
            className="mb-6 rounded-xl p-4 text-sm"
            style={{ background: "var(--warn-soft)", border: "1px solid var(--warn)", color: "var(--warn)" }}
          >
            ⚠ Checkout cancelado. No se realizó ningún cargo.
          </div>
        )}
        {error && (
          <div
            className="mb-6 rounded-xl p-4 text-sm"
            style={{ background: "var(--err-soft)", border: "1px solid var(--err)", color: "var(--err)" }}
          >
            {error}
          </div>
        )}

        {/* Current subscription card */}
        <section
          className="mb-10 rounded-2xl p-6"
          style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}
        >
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="text-[10px] font-bold tracking-[0.18em] uppercase mb-2" style={{ color: "var(--tx-mut)" }}>
                Estado actual
              </div>
              {loading ? (
                <div style={{ color: "var(--tx-mut)" }}>Cargando…</div>
              ) : status?.subscription ? (
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span
                      className="text-2xl font-black tracking-tight"
                      style={{ fontFamily: "var(--f-d)", color: "var(--tx-hi)" }}
                    >
                      {status.subscription.plan.displayName}
                    </span>
                    {subStatusMeta && (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold tracking-wider uppercase"
                        style={{ background: subStatusMeta.soft, color: subStatusMeta.color, border: `1px solid ${subStatusMeta.color}44` }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: subStatusMeta.color }} />
                        {subStatusMeta.label}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--tx-dim)" }}>Precio</div>
                      <div className="mt-1 font-semibold" style={{ color: "var(--tx)" }}>
                        {fmtMoney(status.subscription.priceSnapshot || status.subscription.plan.price)}
                        <span className="font-normal text-xs" style={{ color: "var(--tx-mut)" }}>&nbsp;/mes</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--tx-dim)" }}>Período actual</div>
                      <div className="mt-1 font-semibold" style={{ color: "var(--tx)" }}>
                        {fmtDate(status.subscription.currentPeriodStart)} → {fmtDate(status.subscription.currentPeriodEnd)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--tx-dim)" }}>Pasarela</div>
                      <div className="mt-1 font-semibold" style={{ color: "var(--tx)" }}>
                        {status.subscription.paymentGateway || "Manual"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--tx-dim)" }}>Fin de prueba</div>
                      <div className="mt-1 font-semibold" style={{ color: "var(--tx)" }}>
                        {fmtDate(status.subscription.trialEndsAt)}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ color: "var(--tx-mut)" }}>No tienes una suscripción activa todavía.</div>
              )}
            </div>

            <button
              onClick={openPortal}
              disabled={!status?.tenant?.stripeCustomerId || actionLoading === "portal"}
              className="rounded-xl px-5 py-2.5 text-sm font-bold transition disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: "var(--iris-500)",
                color: "#fff",
                boxShadow: "0 4px 20px var(--iris-glow)",
              }}
              title={!status?.tenant?.stripeCustomerId ? "Disponible tras el primer pago" : ""}
            >
              {actionLoading === "portal" ? "Abriendo…" : "Gestionar facturación"}
            </button>
          </div>
        </section>

        {/* Plans grid */}
        <section>
          <div className="text-[10px] font-bold tracking-[0.18em] uppercase mb-3" style={{ color: "var(--tx-mut)" }}>
            Planes disponibles
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {loading && [1, 2, 3].map(i => (
              <div key={i} className="rounded-2xl p-6 animate-pulse"
                style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", minHeight: 280 }}/>
            ))}
            {!loading && plans.map(plan => {
              const isCurrent = plan.id === currentPlanId;
              const disabled = !plan.stripePriceId || isCurrent || actionLoading === `checkout:${plan.id}`;
              const features: string[] = [
                `${plan.maxLocations === 999 ? "Sucursales ilimitadas" : `${plan.maxLocations} sucursal${plan.maxLocations > 1 ? "es" : ""}`}`,
                `${plan.maxEmployees === 999 ? "Empleados ilimitados" : `${plan.maxEmployees} empleados`}`,
                plan.hasKDS       ? "Kitchen Display"  : null,
                plan.hasLoyalty   ? "Programa de puntos" : null,
                plan.hasInventory ? "Inventario"       : null,
                plan.hasReports   ? "Reportes avanzados" : null,
                plan.hasAPIAccess ? "Acceso API"       : null,
              ].filter(Boolean) as string[];
              return (
                <div
                  key={plan.id}
                  className="rounded-2xl p-6 relative flex flex-col"
                  style={{
                    background: "var(--surf-1)",
                    border: `1px solid ${isCurrent ? "var(--iris-500)" : "var(--bd-1)"}`,
                    boxShadow: isCurrent ? "0 0 0 1px var(--iris-500)" : undefined,
                  }}
                >
                  {isCurrent && (
                    <div
                      className="absolute top-3 right-3 rounded-full px-2 py-0.5 text-[9px] font-bold tracking-widest uppercase"
                      style={{ background: "var(--iris-soft)", color: "var(--iris-300)", border: "1px solid var(--iris-500)" }}
                    >
                      Actual
                    </div>
                  )}
                  <div className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "var(--tx-dim)" }}>
                    {plan.name}
                  </div>
                  <div className="mt-1 text-2xl font-black tracking-tight"
                       style={{ fontFamily: "var(--f-d)", color: "var(--tx-hi)" }}>
                    {plan.displayName}
                  </div>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-4xl font-black" style={{ color: "var(--tx-hi)" }}>
                      {fmtMoney(plan.price)}
                    </span>
                    <span className="text-xs" style={{ color: "var(--tx-mut)" }}>/mes · USD</span>
                  </div>
                  <ul className="mt-4 space-y-1.5 text-sm flex-1" style={{ color: "var(--tx-mid)" }}>
                    {features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span style={{ color: "var(--ok)" }}>✓</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => startCheckout(plan.id)}
                    disabled={disabled}
                    className="mt-5 w-full rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: isCurrent ? "var(--surf-2)" : "var(--iris-500)",
                      color: isCurrent ? "var(--tx-mut)" : "#fff",
                      border: isCurrent ? "1px solid var(--bd-1)" : "none",
                      boxShadow: isCurrent ? undefined : "0 4px 20px var(--iris-glow)",
                    }}
                  >
                    {actionLoading === `checkout:${plan.id}`
                      ? "Redirigiendo a Stripe…"
                      : isCurrent
                        ? "Plan actual"
                        : plan.stripePriceId
                          ? "Contratar"
                          : "No disponible"}
                  </button>
                  {!plan.stripePriceId && !isCurrent && (
                    <div className="mt-2 text-[10px]" style={{ color: "var(--tx-dim)" }}>
                      Precio de Stripe pendiente de configurar
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
