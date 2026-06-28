"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle, ArrowRight, BarChart3, Check, ChefHat, Clock3,
  Eye, EyeOff, LockKeyhole, Mail, RefreshCw, ShieldCheck,
  ShoppingBag, Sparkles, UsersRound,
} from "lucide-react";
import api from "@/lib/api";
import { getApiUrl } from "@/lib/config";
import { setRefreshToken } from "@/lib/auth";

const highlights = [
  { icon: ShoppingBag, value: "142", label: "Pedidos hoy" },
  { icon: BarChart3, value: "+12.4%", label: "Ventas" },
  { icon: Clock3, value: "14 min", label: "Preparación" },
  { icon: UsersRound, value: "4", label: "En turno" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(true);
  const [pendingEmail, setPendingEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendDone, setResendDone] = useState(false);

  const handleResend = async () => {
    setResending(true);
    try {
      const token = localStorage.getItem("accessToken");
      await fetch(`${getApiUrl()}/api/auth/resend-verification`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setResendDone(true);
      setTimeout(() => setResendDone(false), 5000);
    } catch {
      // Keep the verification modal usable if the resend endpoint is unavailable.
    }
    setResending(false);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    localStorage.removeItem("restaurantId");
    localStorage.removeItem("locationId");

    try {
      const { data } = await api.post("/api/auth/login", { email, password });
      localStorage.setItem("accessToken", data.accessToken);
      // "Mantener sesión iniciada" → refresh en localStorage (persiste ~30 días).
      // Sin marcar → sessionStorage (la sesión se cierra al cerrar el navegador).
      setRefreshToken(data.refreshToken, remember);
      localStorage.setItem("user", JSON.stringify(data.user));
      if (data.user?.restaurantId) localStorage.setItem("restaurantId", data.user.restaurantId);
      document.cookie = `mb-role=${data.user.role}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;

      if (data.user?.role === "SUPER_ADMIN") {
        router.push("/dashboard");
        return;
      }

      if (!data.user?.restaurantId) {
        router.push("/admin/configurar-negocio");
        return;
      }

      let tenant: any = null;
      try {
        const tenantRes = await api.get("/api/tenant/me");
        tenant = tenantRes.data;
      } catch {
        router.push("/admin/configurar-negocio");
        return;
      }

      if (!tenant?.restaurants || tenant.restaurants.length === 0) {
        router.push("/admin/configurar-negocio");
        return;
      }

      if (tenant.accentColor) localStorage.setItem("mb-accent", tenant.accentColor);

      if (!tenant.emailVerifiedAt) {
        setPendingEmail(data.user.email);
        return;
      }

      router.push("/admin");
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Credenciales incorrectas");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen font-sans text-tx" style={{ background: "var(--bg)" }}>
      {pendingEmail && (
        <div className="fixed inset-0 z-50 grid place-items-center p-5 backdrop-blur-md" style={{ background: "rgba(15,23,42,.45)" }}>
          <section className="w-full max-w-md rounded-[24px] border border-bd-1 bg-surf-1 p-7 text-center text-tx shadow-[var(--shadow-md)] sm:p-9">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl text-primary" style={{ background: "var(--iris-soft)" }}>
              <Mail size={28} />
            </div>
            <div className="mt-5 font-mono text-[10px] font-bold uppercase tracking-[.16em] text-primary">Un paso más</div>
            <h2 className="mt-2 font-display text-2xl font-extrabold text-tx-hi">Verifica tu correo</h2>
            <p className="mt-3 text-sm leading-relaxed text-tx-mut">
              Enviamos un enlace de verificación a <strong className="text-tx-hi">{pendingEmail}</strong>.
            </p>
            <button
              type="button"
              onClick={handleResend}
              disabled={resending || resendDone}
              className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-[13px] px-5 text-sm font-extrabold text-white transition active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))", boxShadow: "0 6px 18px var(--iris-glow)" }}
            >
              {resendDone ? <><Check size={17} /> Correo reenviado</> : resending ? <><RefreshCw className="animate-spin" size={17} /> Enviando...</> : <><RefreshCw size={17} /> Reenviar correo</>}
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingEmail("");
                localStorage.removeItem("accessToken");
                document.cookie = "mb-role=; path=/; max-age=0";
              }}
              className="mt-4 min-h-11 text-xs font-bold text-tx-mut underline decoration-bd-2 underline-offset-4 hover:text-tx-hi"
            >
              Volver al inicio de sesión
            </button>
          </section>
        </div>
      )}

      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1.12fr)_minmax(430px,.88fr)]">
        {/* Showcase oscuro elegante — espejo del sidebar del admin (#0f172a) */}
        <section className="admin-sidebar relative hidden overflow-hidden p-10 text-white lg:flex lg:flex-col xl:p-14" style={{ background: "#0f172a" }}>
          <div
            aria-hidden
            className="pointer-events-none absolute -top-40 -right-24 h-[460px] w-[460px] rounded-full opacity-60"
            style={{ background: "radial-gradient(circle, var(--iris-glow) 0%, transparent 70%)" }}
          />
          <div className="relative flex items-center justify-between">
            <Link href="/" className="inline-flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-[14px] font-display text-sm font-extrabold text-white shadow-[0_8px_24px_var(--iris-glow)]" style={{ background: "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))" }}>MR</span>
              <span className="font-display text-xl font-extrabold tracking-[-.03em]">MRTPV<span className="text-primary">REST</span></span>
            </Link>
            <span className="inline-flex items-center gap-2 rounded-full px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[.12em]" style={{ border: "1px solid var(--ok-soft)", background: "var(--ok-soft)", color: "var(--ok)" }}>
              <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: "var(--ok)" }} /> Sistemas en línea
            </span>
          </div>

          <div className="relative my-auto max-w-3xl py-12">
            <div className="font-mono text-[11px] font-bold uppercase tracking-[.18em] text-primary">Control total, menos ruido</div>
            <h1 className="mt-5 max-w-2xl font-display text-5xl font-extrabold leading-[1.02] tracking-[-.055em] text-white xl:text-6xl">
              Tu restaurante funciona mejor cuando todo está conectado.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-400">
              Ventas, pedidos, personal e inventario en una experiencia clara, rápida y hecha para operar todos los días.
            </p>

            <div className="mt-9 grid max-w-2xl grid-cols-4 gap-3">
              {highlights.map(({ icon: Icon, value, label }) => (
                <div key={label} className="rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
                  <span className="grid h-8 w-8 place-items-center rounded-[10px] text-primary" style={{ background: "var(--iris-soft)" }}><Icon size={16} /></span>
                  <div className="mt-4 font-display text-xl font-extrabold text-white">{value}</div>
                  <div className="mt-1 text-[11px] text-slate-400">{label}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex max-w-2xl items-center gap-4 rounded-[20px] border border-white/10 bg-white/[0.04] p-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] text-white" style={{ background: "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))" }}><Sparkles size={20} /></span>
              <div>
                <div className="font-display text-sm font-extrabold text-white">Mesero IA está listo</div>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">Pregunta por ventas, productos, inventario y rendimiento de tu equipo.</p>
              </div>
            </div>
          </div>

          <div className="relative flex items-center gap-5 border-t border-white/10 pt-6 text-xs text-slate-500">
            <span className="inline-flex items-center gap-2"><ShieldCheck size={15} /> Acceso protegido</span>
            <span className="inline-flex items-center gap-2"><ChefHat size={15} /> Hecho para restaurantes</span>
          </div>
        </section>

        {/* Formulario claro premium retail */}
        <section className="flex min-h-screen items-center justify-center px-5 py-8 text-tx sm:px-10 lg:px-12" style={{ background: "var(--bg)" }}>
          <div className="w-full max-w-[440px]">
            <Link href="/" className="mb-10 inline-flex items-center gap-3 lg:hidden">
              <span className="grid h-11 w-11 place-items-center rounded-[14px] font-display text-sm font-extrabold text-white" style={{ background: "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))" }}>MR</span>
              <span className="font-display text-xl font-extrabold tracking-[-.03em] text-tx-hi">MRTPV<span className="text-primary">REST</span></span>
            </Link>

            <div className="rounded-[24px] border border-bd-1 bg-surf-1 p-6 shadow-[var(--shadow-md)] sm:p-8">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-primary">Panel administrativo</div>
              <h2 className="mt-3 font-display text-3xl font-extrabold tracking-[-.04em] text-tx-hi">Bienvenido de nuevo</h2>
              <p className="mt-2 text-sm text-tx-mut">Ingresa para continuar con la operación de tu restaurante.</p>

              {error && (
                <div className="mt-6 flex items-start gap-3 rounded-xl p-3.5 text-sm font-semibold" style={{ border: "1px solid var(--err-soft)", background: "var(--err-soft)", color: "var(--err)" }}>
                  <AlertCircle className="mt-0.5 shrink-0" size={17} /> {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-7 space-y-5">
                <div>
                  <label htmlFor="email" className="ml-1 block font-mono text-[10px] font-bold uppercase tracking-[.13em] text-tx-mut">Correo electrónico</label>
                  <div className="relative mt-2">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-tx-dim" size={18} />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="tu@restaurante.com"
                      required
                      autoComplete="email"
                      className="min-h-[52px] w-full rounded-xl border border-bd-2 bg-surf-1 py-3.5 pl-12 pr-4 text-sm text-tx outline-none transition placeholder:text-tx-dim focus:border-[var(--brand-primary)] focus:ring-4 focus:ring-iris-soft"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="ml-1 block font-mono text-[10px] font-bold uppercase tracking-[.13em] text-tx-mut">Contraseña</label>
                  <div className="relative mt-2">
                    <LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 text-tx-dim" size={18} />
                    <input
                      id="password"
                      type={showPass ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete="current-password"
                      className="min-h-[52px] w-full rounded-xl border border-bd-2 bg-surf-1 py-3.5 pl-12 pr-12 text-sm text-tx outline-none transition placeholder:text-tx-dim focus:border-[var(--brand-primary)] focus:ring-4 focus:ring-iris-soft"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((visible) => !visible)}
                      className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg text-tx-mut hover:bg-surf-2 hover:text-tx-hi"
                      aria-label={showPass ? "Ocultar contraseña" : "Mostrar contraseña"}
                    >
                      {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <label htmlFor="remember" className="flex cursor-pointer items-start gap-3 rounded-xl border border-bd-1 bg-surf-2/40 p-3.5 transition hover:border-bd-2">
                  <input
                    id="remember"
                    type="checkbox"
                    checked={remember}
                    onChange={(event) => setRemember(event.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--brand-primary)]"
                  />
                  <span className="text-sm leading-snug text-tx">
                    <span className="font-bold text-tx-hi">Mantener sesión iniciada por 30 días</span>
                    <span className="mt-0.5 block text-xs text-tx-mut">Desactívalo en equipos compartidos: cerrarás sesión al cerrar el navegador.</span>
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[13px] px-5 text-sm font-extrabold text-white transition active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ background: "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))", boxShadow: "0 8px 22px var(--iris-glow)" }}
                >
                  {loading ? <><RefreshCw className="animate-spin" size={17} /> Verificando...</> : <>Entrar al panel <ArrowRight size={17} /></>}
                </button>
              </form>

              <div className="my-7 flex items-center gap-4">
                <div className="h-px flex-1 bg-bd-1" />
                <span className="font-mono text-[9px] font-bold uppercase tracking-[.14em] text-tx-dim">¿Primera vez?</span>
                <div className="h-px flex-1 bg-bd-1" />
              </div>

              <Link href="/register" className="flex min-h-12 items-center justify-center rounded-xl border border-bd-2 px-4 text-sm font-bold text-primary transition hover:border-[var(--brand-primary)] hover:bg-iris-soft">
                Crear cuenta gratis · 15 días sin tarjeta
              </Link>
            </div>

            <p className="mt-6 text-center text-[11px] leading-relaxed text-tx-mut">
              Al ingresar aceptas los términos de servicio y el aviso de privacidad de MRTPVREST.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
