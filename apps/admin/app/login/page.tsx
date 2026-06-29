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
      localStorage.setItem("refreshToken", data.refreshToken);
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
    <main className="min-h-screen bg-[#0e1512] font-sans text-[#e8f0eb]">
      {pendingEmail && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#0e1512]/90 p-5 backdrop-blur-md">
          <section className="w-full max-w-md rounded-[28px] border border-[#e1e8e4] bg-[#f7fbf8] p-7 text-center text-[#15201b] shadow-2xl sm:p-9">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#1f9d63]/10 text-[#1f9d63]">
              <Mail size={28} />
            </div>
            <div className="mt-5 font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#1f9d63]">Un paso más</div>
            <h2 className="mt-2 font-display text-2xl font-extrabold">Verifica tu correo</h2>
            <p className="mt-3 text-sm leading-relaxed text-[#5c6b62]">
              Enviamos un enlace de verificación a <strong className="text-[#15201b]">{pendingEmail}</strong>.
            </p>
            <button
              type="button"
              onClick={handleResend}
              disabled={resending || resendDone}
              className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1f9d63] px-5 text-sm font-extrabold text-white transition hover:bg-[#178354] disabled:cursor-not-allowed disabled:opacity-60"
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
              className="mt-4 min-h-11 text-xs font-bold text-[#5c6b62] underline decoration-[#cbd6d0] underline-offset-4 hover:text-[#15201b]"
            >
              Volver al inicio de sesión
            </button>
          </section>
        </div>
      )}

      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1.12fr)_minmax(430px,.88fr)]">
        <section className="relative hidden overflow-hidden border-r border-white/10 p-10 lg:flex lg:flex-col xl:p-14">
          <div className="flex items-center justify-between">
            <Link href="/" className="inline-flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-[#34c988] font-display text-sm font-extrabold text-white shadow-[0_8px_24px_rgba(52,201,136,.28)]">MR</span>
              <span className="font-display text-xl font-extrabold tracking-[-.03em]">MRTPV<span className="text-[#34c988]">REST</span></span>
            </Link>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#4fbf8b]/25 bg-[#4fbf8b]/10 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[.12em] text-[#75d2a6]">
              <span className="h-2 w-2 rounded-full bg-[#4fbf8b]" /> Sistemas en línea
            </span>
          </div>

          <div className="my-auto max-w-3xl py-12">
            <div className="font-mono text-[11px] font-bold uppercase tracking-[.18em] text-[#34c988]">Control total, menos ruido</div>
            <h1 className="mt-5 max-w-2xl font-display text-5xl font-extrabold leading-[1.02] tracking-[-.055em] text-[#f7fbf8] xl:text-6xl">
              Tu restaurante funciona mejor cuando todo está conectado.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-[#8da396]">
              Ventas, pedidos, personal e inventario en una experiencia clara, rápida y hecha para operar todos los días.
            </p>

            <div className="mt-9 grid max-w-2xl grid-cols-4 gap-3">
              {highlights.map(({ icon: Icon, value, label }) => (
                <div key={label} className="rounded-[18px] border border-white/10 bg-[#16211c] p-4 shadow-[0_14px_35px_rgba(0,0,0,.2)]">
                  <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[#34c988]/10 text-[#34c988]"><Icon size={16} /></span>
                  <div className="mt-4 font-display text-xl font-extrabold text-[#f7fbf8]">{value}</div>
                  <div className="mt-1 text-[11px] text-[#8da396]">{label}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex max-w-2xl items-center gap-4 rounded-[20px] border border-[#34c988]/20 bg-[#111a16] p-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[#1f9d63] text-white"><Sparkles size={20} /></span>
              <div>
                <div className="font-display text-sm font-extrabold text-[#f7fbf8]">Mesero IA está listo</div>
                <p className="mt-1 text-xs leading-relaxed text-[#8da396]">Pregunta por ventas, productos, inventario y rendimiento de tu equipo.</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-5 border-t border-white/10 pt-6 text-xs text-[#5e7268]">
            <span className="inline-flex items-center gap-2"><ShieldCheck size={15} /> Acceso protegido</span>
            <span className="inline-flex items-center gap-2"><ChefHat size={15} /> Hecho para restaurantes</span>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center bg-[#eef2f0] px-5 py-8 text-[#15201b] sm:px-10 lg:px-12">
          <div className="w-full max-w-[440px]">
            <Link href="/" className="mb-10 inline-flex items-center gap-3 lg:hidden">
              <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-[#1f9d63] font-display text-sm font-extrabold text-white">MR</span>
              <span className="font-display text-xl font-extrabold tracking-[-.03em]">MRTPV<span className="text-[#1f9d63]">REST</span></span>
            </Link>

            <div className="rounded-[28px] border border-[#e1e8e4] bg-[#f7fbf8] p-6 shadow-[0_24px_70px_rgba(20,40,30,.10)] sm:p-8">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#1f9d63]">Panel administrativo</div>
              <h2 className="mt-3 font-display text-3xl font-extrabold tracking-[-.04em] text-[#0b1410]">Bienvenido de nuevo</h2>
              <p className="mt-2 text-sm text-[#5c6b62]">Ingresa para continuar con la operación de tu restaurante.</p>

              {error && (
                <div className="mt-6 flex items-start gap-3 rounded-xl border border-[#c0432c]/20 bg-[#c0432c]/10 p-3.5 text-sm font-semibold text-[#a73522]">
                  <AlertCircle className="mt-0.5 shrink-0" size={17} /> {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-7 space-y-5">
                <div>
                  <label htmlFor="email" className="ml-1 block font-mono text-[10px] font-bold uppercase tracking-[.13em] text-[#5c6b62]">Correo electrónico</label>
                  <div className="relative mt-2">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-[#93a399]" size={18} />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="tu@restaurante.com"
                      required
                      autoComplete="email"
                      className="min-h-[52px] w-full rounded-xl border border-[#cbd6d0] bg-white py-3.5 pl-12 pr-4 text-sm text-[#15201b] outline-none transition placeholder:text-[#93a399] focus:border-[#1f9d63] focus:ring-4 focus:ring-[#1f9d63]/10"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="ml-1 block font-mono text-[10px] font-bold uppercase tracking-[.13em] text-[#5c6b62]">Contraseña</label>
                  <div className="relative mt-2">
                    <LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 text-[#93a399]" size={18} />
                    <input
                      id="password"
                      type={showPass ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete="current-password"
                      className="min-h-[52px] w-full rounded-xl border border-[#cbd6d0] bg-white py-3.5 pl-12 pr-12 text-sm text-[#15201b] outline-none transition placeholder:text-[#93a399] focus:border-[#1f9d63] focus:ring-4 focus:ring-[#1f9d63]/10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((visible) => !visible)}
                      className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg text-[#5c6b62] hover:bg-[#e7edea] hover:text-[#15201b]"
                      aria-label={showPass ? "Ocultar contraseña" : "Mostrar contraseña"}
                    >
                      {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#1f9d63] px-5 text-sm font-extrabold text-white shadow-[0_10px_24px_rgba(52,201,136,.24)] transition hover:bg-[#178354] active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? <><RefreshCw className="animate-spin" size={17} /> Verificando...</> : <>Entrar al panel <ArrowRight size={17} /></>}
                </button>
              </form>

              <div className="my-7 flex items-center gap-4">
                <div className="h-px flex-1 bg-[#e1e8e4]" />
                <span className="font-mono text-[9px] font-bold uppercase tracking-[.14em] text-[#93a399]">¿Primera vez?</span>
                <div className="h-px flex-1 bg-[#e1e8e4]" />
              </div>

              <Link href="/register" className="flex min-h-12 items-center justify-center rounded-xl border border-[#cbd6d0] px-4 text-sm font-bold text-[#1f9d63] transition hover:border-[#1f9d63] hover:bg-[#1f9d63]/5">
                Crear cuenta gratis · 15 días sin tarjeta
              </Link>
            </div>

            <p className="mt-6 text-center text-[11px] leading-relaxed text-[#5c6b62]">
              Al ingresar aceptas los términos de servicio y el aviso de privacidad de MRTPVREST.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
