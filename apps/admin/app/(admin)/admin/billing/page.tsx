"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2, AlertTriangle, XCircle, CreditCard, Check,
} from "lucide-react";
import api from "@/lib/api";
import {
  PageShell, PageHeader, Card, SectionLabel, Pill, Button, Skeleton,
  type Tone,
} from "@/components/ds";

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
  billingProvider: "STRIPE" | "MERCADOPAGO" | string;
  billingCurrency: string;
};

const STATUS_META: Record<Subscription["status"], { label: string; tone: Tone }> = {
  TRIAL:     { label: "Prueba gratis",  tone: "info" },
  ACTIVE:    { label: "Activa",         tone: "ok"   },
  PAST_DUE:  { label: "Pago pendiente", tone: "warn" },
  SUSPENDED: { label: "Suspendida",     tone: "err"  },
  CANCELLED: { label: "Cancelada",      tone: "err"  },
  EXPIRED:   { label: "Expirada",       tone: "err"  },
};

function fmtMoney(n: number, currency = "USD") {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}
function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short", year: "numeric" });
}

export default function BillingPage() {
  return (
    <Suspense fallback={<PageShell><Card className="p-6 text-sm text-tx-mut">Cargando…</Card></PageShell>}>
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
      setPlans(list.filter((p) => p.isActive));
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err.response?.data?.error || err.message || "Error al cargar billing");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const currentPlanId = status?.subscription?.plan?.id ?? null;
  const billingProvider = status?.billingProvider || "STRIPE";
  const billingCurrency = status?.billingCurrency || (billingProvider === "MERCADOPAGO" ? "MXN" : "USD");
  const canManageBilling = billingProvider === "MERCADOPAGO"
    ? Boolean(status?.subscription?.externalId)
    : Boolean(status?.tenant?.stripeCustomerId);

  async function startCheckout(planId: string) {
    setActionLoading(`checkout:${planId}`);
    setError(null);
    try {
      const { data } = await api.post<{ url: string }>("/api/billing/checkout", { planId });
      if (data?.url) window.location.href = data.url;
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } }; message?: string }).response?.data?.error
        || (e as { message?: string }).message;
      if (msg === "PLAN_HAS_NO_STRIPE_PRICE") {
        setError("Este plan aun no tiene un precio de pago asociado.");
      } else if (msg === "PLAN_HAS_INVALID_PRICE") {
        setError("Este plan necesita un precio mayor a cero para iniciar el cobro.");
      } else if (msg === "TENANT_HAS_NO_OWNER_EMAIL") {
        setError("Esta cuenta necesita un email de propietario para iniciar la suscripcion.");
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
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err.response?.data?.error || err.message || "No se pudo abrir el portal");
      setActionLoading(null);
    }
  }

  const subStatusMeta = useMemo(() => {
    if (!status?.subscription) return null;
    return STATUS_META[status.subscription.status];
  }, [status]);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Suscripción SaaS"
        title="Facturación"
        subtitle="Gestiona tu plan, tu método de pago y tus facturas de MRTPVREST."
      />

      {/* Return banner from checkout */}
      {returnStatus === "success" && (
        <Card className="mb-6 flex items-center gap-2 p-4 text-sm"
          style={{ background: "var(--ok-soft)", borderColor: "var(--ok)", color: "var(--ok)" }}>
          <CheckCircle2 size={16} className="shrink-0" /> Pago procesado. Tu suscripción se activará en unos segundos.
        </Card>
      )}
      {returnStatus === "cancel" && (
        <Card className="mb-6 flex items-center gap-2 p-4 text-sm"
          style={{ background: "var(--warn-soft)", borderColor: "var(--warn)", color: "var(--warn)" }}>
          <AlertTriangle size={16} className="shrink-0" /> Checkout cancelado. No se realizó ningún cargo.
        </Card>
      )}
      {error && (
        <Card className="mb-6 flex items-center gap-2 p-4 text-sm"
          style={{ background: "var(--err-soft)", borderColor: "var(--err)", color: "var(--err)" }}>
          <XCircle size={16} className="shrink-0" /> {error}
        </Card>
      )}

      {/* Current subscription card */}
      <SectionLabel>Estado actual</SectionLabel>
      <Card className="p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {loading ? (
              <div className="text-sm text-tx-mut">Cargando…</div>
            ) : status?.subscription ? (
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-display text-2xl font-extrabold tracking-tight text-tx-hi">
                    {status.subscription.plan.displayName}
                  </span>
                  {subStatusMeta && (
                    <Pill tone={subStatusMeta.tone} live={status.subscription.status === "ACTIVE"}>
                      {subStatusMeta.label}
                    </Pill>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                  <div>
                    <div className="font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-dim">Precio</div>
                    <div className="mt-1 font-semibold text-tx">
                      {fmtMoney(status.subscription.priceSnapshot || status.subscription.plan.price, billingCurrency)}
                      <span className="text-xs font-normal text-tx-mut">&nbsp;/mes</span>
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-dim">Período actual</div>
                    <div className="mt-1 font-semibold text-tx">
                      {fmtDate(status.subscription.currentPeriodStart)} → {fmtDate(status.subscription.currentPeriodEnd)}
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-dim">Pasarela</div>
                    <div className="mt-1 font-semibold text-tx">
                      {status.subscription.paymentGateway || "Manual"}
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-dim">Fin de prueba</div>
                    <div className="mt-1 font-semibold text-tx">
                      {fmtDate(status.subscription.trialEndsAt)}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-tx-mut">No tienes una suscripción activa todavía.</div>
            )}
          </div>

          <div className="w-full shrink-0 md:w-auto">
            <Button
              onClick={openPortal}
              disabled={!canManageBilling || actionLoading === "portal"}
              loading={actionLoading === "portal"}
              icon={CreditCard}
              full
            >
              {actionLoading === "portal"
                ? "Abriendo…"
                : billingProvider === "MERCADOPAGO"
                  ? "Abrir Mercado Pago"
                  : "Gestionar facturación"}
            </Button>
            {!canManageBilling && (
              <div className="mt-1.5 text-center text-[10px] text-tx-dim md:text-right">
                Disponible tras iniciar la suscripción
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Plans grid */}
      <SectionLabel>Planes disponibles</SectionLabel>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {loading && [1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-72 rounded-ds-lg" />
        ))}
        {!loading && plans.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const hasGatewayPrice = billingProvider === "MERCADOPAGO" || Boolean(plan.stripePriceId);
          const disabled = !hasGatewayPrice || isCurrent || actionLoading === `checkout:${plan.id}`;
          const features: string[] = [
            `${plan.maxLocations === 999 ? "Sucursales ilimitadas" : `${plan.maxLocations} sucursal${plan.maxLocations > 1 ? "es" : ""}`}`,
            `${plan.maxEmployees === 999 ? "Empleados ilimitados" : `${plan.maxEmployees} empleados`}`,
            plan.hasKDS       ? "Kitchen Display"     : null,
            plan.hasLoyalty   ? "Programa de puntos"  : null,
            plan.hasInventory ? "Inventario"          : null,
            plan.hasReports   ? "Reportes avanzados"  : null,
            plan.hasAPIAccess ? "Acceso API"          : null,
          ].filter(Boolean) as string[];

          return (
            <Card
              key={plan.id}
              className="relative flex flex-col p-5 md:p-6"
              style={isCurrent ? { borderColor: "var(--brand-primary)", boxShadow: "0 0 0 1px var(--brand-primary)" } : undefined}
            >
              {isCurrent && (
                <div className="absolute right-3 top-3">
                  <Pill tone="ac">Actual</Pill>
                </div>
              )}
              <div className="font-mono text-[9.5px] uppercase tracking-[.14em] text-tx-dim">
                {plan.name}
              </div>
              <div className="mt-1 font-display text-2xl font-extrabold tracking-tight text-tx-hi">
                {plan.displayName}
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="font-display text-4xl font-extrabold text-tx-hi">
                  {fmtMoney(plan.price, billingCurrency)}
                </span>
                <span className="text-xs text-tx-mut">/mes · {billingCurrency}</span>
              </div>
              <ul className="mt-4 flex-1 space-y-1.5 text-sm text-tx-mid">
                {features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check size={15} className="mt-0.5 shrink-0 text-ok" strokeWidth={2.4} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                <Button
                  onClick={() => startCheckout(plan.id)}
                  disabled={disabled}
                  loading={actionLoading === `checkout:${plan.id}`}
                  variant={isCurrent ? "secondary" : "primary"}
                  full
                >
                  {actionLoading === `checkout:${plan.id}`
                    ? "Redirigiendo al pago…"
                    : isCurrent
                      ? "Plan actual"
                      : hasGatewayPrice
                        ? "Contratar"
                        : "No disponible"}
                </Button>
              </div>
              {!hasGatewayPrice && !isCurrent && (
                <div className="mt-2 text-[10px] text-tx-dim">
                  Precio de pago pendiente de configurar
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </PageShell>
  );
}
