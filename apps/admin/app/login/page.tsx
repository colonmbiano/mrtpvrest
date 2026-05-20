"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { getApiUrl } from "@/lib/config";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [showPass, setShowPass]     = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [resending, setResending]   = useState(false);
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
    } catch { /* silencioso */ }
    setResending(false);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    // Defensa: descartar contexto stale para que el interceptor no inyecte
    // un x-restaurant-id ajeno en la propia llamada de login.
    localStorage.removeItem("restaurantId");
    localStorage.removeItem("locationId");
    try {
      const { data } = await api.post("/api/auth/login", { email, password });
      localStorage.setItem("accessToken",  data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken);
      localStorage.setItem("user",         JSON.stringify(data.user));
      if (data.user?.restaurantId) localStorage.setItem("restaurantId", data.user.restaurantId);
      document.cookie = `mb-role=${data.user.role}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;

      if (data.user?.role === "SUPER_ADMIN") {
        router.push("/dashboard");
        return;
      }

      // Si el usuario no tiene restaurante asociado → forzar onboarding
      if (!data.user?.restaurantId) {
        router.push("/admin/configurar-negocio");
        return;
      }

      let tenant: any = null;
      try {
        const tenantRes = await api.get("/api/tenant/me");
        tenant = tenantRes.data;
      } catch {
        // Si no se puede resolver el tenant, enviamos a onboarding
        router.push("/admin/configurar-negocio");
        return;
      }

      // Si el tenant no tiene restaurantes/sucursales → forzar onboarding
      if (!tenant?.restaurants || tenant.restaurants.length === 0) {
        router.push("/admin/configurar-negocio");
        return;
      }

      // Guardar accentColor para ThemeProvider
      if (tenant.accentColor) {
        localStorage.setItem("mb-accent", tenant.accentColor);
      }

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
    <>
      {/* Modal email pendiente */}
      {pendingEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md transition-all">
          <div className="w-full max-w-md bg-surf-1 border border-bd-2 rounded-3xl p-10 text-center shadow-[0_0_60px_rgba(0,0,0,0.5)] transform animate-in zoom-in-95 duration-300">
            <div className="w-20 h-20 mx-auto rounded-full bg-iris-500/10 border border-iris-500/20 flex items-center justify-center text-4xl mb-6 shadow-inner">
              ✉️
            </div>
            <h2 className="font-syne font-black text-2xl text-tx mb-2">
              Verifica tu email
            </h2>
            <p className="text-sm text-tx-mut mb-8 leading-relaxed">
              Enviamos un enlace a <strong className="text-tx">{pendingEmail}</strong>
            </p>
            <button
              onClick={handleResend} 
              disabled={resending || resendDone}
              className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm transition-all mb-4 ${
                resendDone 
                  ? "bg-emerald-500/10 text-emerald-500" 
                  : "bg-gradient-to-r from-iris-600 to-iris-500 text-white hover:shadow-iris hover:scale-[1.02]"
              } disabled:opacity-60 disabled:hover:scale-100 disabled:cursor-not-allowed`}
            >
              {resendDone ? "✓ Correo reenviado" : resending ? "Enviando..." : "Reenviar correo"}
            </button>
            <button
              onClick={() => { setPendingEmail(""); localStorage.removeItem("accessToken"); document.cookie = "mb-role=; path=/; max-age=0"; }}
              className="text-xs text-tx-mut hover:text-tx transition-colors underline underline-offset-4"
            >
              Volver al login
            </button>
          </div>
        </div>
      )}

      {/* Layout split */}
      <div className="min-h-screen flex font-sans bg-bg">
        {/* Panel izquierdo (Decorativo) - Oculto en móviles */}
        <div className="hidden lg:flex lg:w-7/12 bg-surf-1 border-r border-bd-1 p-12 flex-col justify-between relative overflow-hidden">
          {/* Orbe decorativo */}
          <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-iris-500/10 rounded-full blur-[100px] pointer-events-none animate-pulse duration-10000" />
          
          <div className="relative z-10">
            <Link href="/" className="inline-flex items-center gap-3 mb-16 hover:opacity-80 transition-opacity">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-iris-500 to-iris-700 flex items-center justify-center font-syne font-black text-xs text-white shadow-lg shadow-iris-500/20">
                MR
              </div>
              <span className="font-syne font-black text-xl text-tx tracking-tight">
                MRTPV<span className="text-primary">REST</span>
              </span>
            </Link>
            
            <h1 className="font-syne font-black text-5xl text-tx leading-[1.1] tracking-tight mb-6 max-w-lg">
              Gestiona tu restaurante <em className="not-italic text-primary">sin complicaciones.</em>
            </h1>
            <p className="text-base text-tx-mut leading-relaxed max-w-md">
              TPV, cocina, delivery y tienda online. Todo sincronizado en tiempo real para restaurantes en LATAM.
            </p>
          </div>
          
          <div className="relative z-10 grid grid-cols-3 gap-6 pt-8 border-t border-bd-1/50">
            {[
              { n: "+500", l: "Restaurantes activos" }, 
              { n: "$29", l: "Desde por mes" }, 
              { n: "15d", l: "Prueba gratis" }
            ].map(s => (
              <div key={s.n} className="group">
                <div className="font-syne text-3xl font-black text-tx group-hover:text-primary transition-colors">{s.n}</div>
                <div className="text-xs text-tx-mut mt-1 uppercase tracking-wider font-semibold">{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Panel derecho (Formulario) - Full width en móviles */}
        <div className="w-full lg:w-5/12 flex items-center justify-center p-6 sm:p-12 relative overflow-hidden">
          {/* Orbe decorativo móvil */}
          <div className="lg:hidden absolute top-[-20%] right-[-20%] w-[300px] h-[300px] bg-primary/10 rounded-full blur-[80px] pointer-events-none" />
          
          <div className="w-full max-w-[400px] relative z-10">
            
            {/* Logo solo en móviles */}
            <div className="lg:hidden flex items-center gap-3 mb-10">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-iris-500 to-iris-700 flex items-center justify-center font-syne font-black text-xs text-white shadow-lg shadow-iris-500/20">
                MR
              </div>
              <span className="font-syne font-black text-xl text-tx tracking-tight">
                MRTPV<span className="text-primary">REST</span>
              </span>
            </div>

            <div className="mb-10">
              <h2 className="font-syne font-black text-3xl text-tx mb-2 tracking-tight">Bienvenido de nuevo</h2>
              <p className="text-sm text-tx-mut">Ingresa a tu panel de administración para continuar</p>
            </div>

            {error && (
              <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm font-bold flex items-center gap-2 animate-in slide-in-from-top-2">
                <span className="text-lg">⚠</span> {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-tx-mut uppercase tracking-widest ml-1">Correo electrónico</label>
                <input 
                  type="email" 
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  placeholder="tu@restaurante.com" 
                  required 
                  autoComplete="email" 
                  className="w-full px-4 py-3.5 bg-surf-1 border border-bd-2 rounded-xl text-sm text-tx outline-none transition-all focus:ring-2 focus:ring-primary/50 focus:border-primary placeholder:text-tx-dim" 
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-tx-mut uppercase tracking-widest ml-1">Contraseña</label>
                <div className="relative">
                  <input 
                    type={showPass ? "text" : "password"} 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    placeholder="••••••••" 
                    required 
                    autoComplete="current-password" 
                    className="w-full pl-4 pr-12 py-3.5 bg-surf-1 border border-bd-2 rounded-xl text-sm text-tx outline-none transition-all focus:ring-2 focus:ring-primary/50 focus:border-primary placeholder:text-tx-dim" 
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPass(v => !v)} 
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-tx-mut hover:text-tx transition-colors rounded-lg hover:bg-surf-2"
                  >
                    {showPass ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>
              
              <button 
                type="submit" 
                disabled={loading} 
                className="w-full mt-2 py-4 rounded-xl bg-gradient-to-r from-primary to-[#ff7e5f] font-syne font-black text-sm text-white shadow-lg shadow-primary/25 transition-all hover:scale-[1.02] hover:shadow-primary/40 active:scale-95 disabled:opacity-60 disabled:hover:scale-100 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Verificando...
                  </>
                ) : (
                  "Entrar al panel →"
                )}
              </button>
            </form>

            <div className="flex items-center gap-4 my-8">
              <div className="flex-1 h-px bg-bd-1" />
              <span className="text-[10px] text-tx-dim uppercase tracking-widest font-bold">¿nuevo aquí?</span>
              <div className="flex-1 h-px bg-bd-1" />
            </div>
            
            <div className="text-center">
              <Link href="/register" className="text-sm font-bold text-primary hover:text-[#ff7e5f] transition-colors hover:underline underline-offset-4">
                Crear cuenta gratis — 15 días sin tarjeta
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
