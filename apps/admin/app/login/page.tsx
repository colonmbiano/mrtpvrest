"use client";
// app/(admin)/login/page.tsx

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [showPass, setShowPass]     = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");   // email sin verificar
  const [resending, setResending]   = useState(false);
  const [resendDone, setResendDone] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (token) router.push("/dashboard");
  }, []);

  const handleResend = async () => {
    setResending(true);
    try {
      const token = localStorage.getItem("accessToken");
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/auth/resend-verification`, {
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

      // Para ADMIN: verificar si el email está confirmado antes de entrar
      const tenantRes = await api.get("/api/tenant/me");
      const tenant = tenantRes.data;
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
      {/* ── MODAL: email pendiente de verificación ── */}
      {pendingEmail && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 z-50 font-sans">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-10 text-center shadow-2xl animate-fade-in-up">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[#fff0ed] border border-red-50 flex items-center justify-center text-4xl shadow-inner">
              ✉️
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-2">
              Verifica tu email
            </h2>
            <p className="text-sm text-slate-600 mb-8 leading-relaxed">
              Enviamos un enlace de confirmación a <strong className="text-slate-900">{pendingEmail}</strong>.
              Debes verificarlo para acceder.
            </p>
            <button
              onClick={handleResend}
              disabled={resending || resendDone}
              className={`w-full py-4 rounded-xl font-bold text-sm transition-all mb-4
                ${resendDone 
                  ? "bg-green-50 border border-green-200 text-green-600" 
                  : "bg-[#ff5c35] hover:bg-[#e54a25] text-white shadow-lg shadow-orange-500/20 disabled:opacity-60"}`}
            >
              {resendDone ? "✓ Correo reenviado" : resending ? "Enviando..." : "Reenviar correo de verificación"}
            </button>
            <button
              onClick={() => { setPendingEmail(""); localStorage.removeItem("accessToken"); document.cookie = "mb-role=; path=/; max-age=0"; }}
              className="text-sm text-slate-500 hover:text-slate-800 underline transition-colors"
            >
              Volver al login
            </button>
          </div>
        </div>
      )}

      {/* ── PANTALLA PRINCIPAL DE LOGIN ── */}
      <div className="min-h-screen grid grid-cols-1 md:grid-cols-[1.3fr,1fr] bg-white font-sans">
        
        {/* LEFT PANEL */}
        <div className="hidden md:flex bg-slate-50 flex-col justify-between p-12 lg:p-20 border-r border-slate-200 relative overflow-hidden">
          {/* Adornos visuales sutiles */}
          <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#ff5c35] opacity-[0.03] rounded-full blur-3xl pointer-events-none"></div>
          
          <div className="relative z-10">
            <Link href="/" className="flex items-center gap-3 mb-20 hover:opacity-80 transition-opacity">
              <div className="w-10 h-10 rounded-xl bg-[#ff5c35] flex items-center justify-center shadow-md">
                <svg viewBox="0 0 24 24" className="w-6 h-6 stroke-white fill-none stroke-2"><path d="M3 12h18M3 6h18M3 18h12"/></svg>
              </div>
              <span className="text-2xl font-black text-slate-900 tracking-tighter">MR<span className="text-[#ff5c35]">TPV</span>REST</span>
            </Link>
            
            <div className="max-w-xl">
              <h1 className="text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.1] mb-6">
                Gestiona tu restaurante <br/><em className="not-italic text-[#ff5c35]">sin complicaciones.</em>
              </h1>
              <p className="text-lg text-slate-600 leading-relaxed max-w-md">
                TPV, cocina, delivery y tienda online. Todo en una plataforma diseñada para restaurantes en LATAM.
              </p>
            </div>
          </div>
          
          {/* Stats */}
          <div className="grid grid-cols-3 gap-6 pt-10 border-t border-slate-200 relative z-10">
            <div>
              <p className="text-4xl font-black text-slate-900 font-mono tracking-tighter">62</p>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-2">Restaurantes activos</p>
            </div>
            <div>
              <p className="text-4xl font-black text-slate-900 font-mono tracking-tighter">$2</p>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-2">Desde por mes</p>
            </div>
            <div>
              <p className="text-4xl font-black text-slate-900 font-mono tracking-tighter">15d</p>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-2">Prueba gratis</p>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL (FORM) */}
        <div className="flex items-center justify-center p-8 sm:p-12 lg:p-20 bg-white">
          <div className="w-full max-w-md animate-fade-in-up">
            
            {/* Header móvil */}
            <div className="md:hidden flex items-center gap-2 mb-10">
               <div className="w-8 h-8 rounded-lg bg-[#ff5c35] flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-5 h-5 stroke-white fill-none stroke-2"><path d="M3 12h18M3 6h18M3 18h12"/></svg>
              </div>
              <span className="text-xl font-black text-slate-900 tracking-tighter">MRTPVREST</span>
            </div>

            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">Bienvenido de nuevo</h2>
            <p className="text-sm text-slate-500 font-medium mb-10">Ingresa a tu panel de administración</p>

            {error && (
              <div className="mb-6 bg-red-50 border border-red-200 text-red-600 text-sm font-bold px-4 py-3 rounded-lg flex items-center gap-3">
                <svg viewBox="0 0 24 24" className="w-5 h-5 stroke-current fill-none stroke-2 flex-shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Correo electrónico</label>
                <input
                  type="email"
                  placeholder="tu@restaurante.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full px-4 py-3.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-[#ff5c35] focus:border-[#ff5c35] transition-all text-sm font-medium outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Contraseña</label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="w-full pl-4 pr-12 py-3.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-[#ff5c35] focus:border-[#ff5c35] transition-all text-sm font-medium outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    tabIndex={-1}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                  >
                    {showPass ? (
                      <svg viewBox="0 0 24 24" className="w-5 h-5 stroke-current fill-none stroke-[1.5]"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg viewBox="0 0 24 24" className="w-5 h-5 stroke-current fill-none stroke-[1.5]"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
              </div>

              <button 
                type="submit" 
                disabled={loading}
                className="w-full mt-2 py-4 rounded-xl font-bold text-white bg-slate-900 hover:bg-[#ff5c35] shadow-lg hover:shadow-orange-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  "Verificando..."
                ) : (
                  <>
                    Entrar al panel
                    <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-current fill-none stroke-2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                  </>
                )}
              </button>
            </form>

            <div className="flex items-center gap-4 my-8">
              <div className="flex-1 h-px bg-slate-200"></div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">¿nuevo aquí?</div>
              <div className="flex-1 h-px bg-slate-200"></div>
            </div>

            <div className="text-center">
              <Link href="/register" className="text-sm font-bold text-slate-600 hover:text-[#ff5c35] hover:underline transition-colors">
                Crear cuenta gratis — 15 días sin tarjeta
              </Link>
            </div>

          </div>
        </div>
      </div>
      
      {/* Animación global para la entrada suave */}
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.5s ease-out forwards;
        }
      `}</style>
    </>
  );
}