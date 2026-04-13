"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// Nuevo input adaptado al diseño claro
function input(extra = "") {
  return `w-full px-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-[#ff5c35] focus:border-[#ff5c35] transition-all text-sm font-medium ${extra}`;
}

function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-2">
        <label className="text-sm font-bold text-slate-700 tracking-wide">
          {label}{required && <span className="text-red-500 ml-1">*</span>}
        </label>
        {hint}
      </div>
      {children}
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep]         = useState(1);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [showPass, setShowPass] = useState(false);

  // Paso 1
  const [restaurantName, setRestaurantName] = useState("");
  const [ownerName, setOwnerName]           = useState("");

  // Paso 2
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [terms, setTerms]       = useState(false);

  const canNext1 = restaurantName.trim().length >= 2 && ownerName.trim().length >= 2;
  const emailDomain = email.split("@")[1] || "";
  const [resending, setResending]     = useState(false);
  const [resendDone, setResendDone]   = useState(false);
  const canNext2 = email.trim() && password.length >= 8 && terms;

  const handleResend = async () => {
    setResending(true);
    try {
      const token = localStorage.getItem("accessToken");
      await fetch(`${API}/api/auth/resend-verification`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setResendDone(true);
      setTimeout(() => setResendDone(false), 5000);
    } catch {
      // silencioso — el usuario puede reintentar
    }
    setResending(false);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/api/auth/register-tenant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantName, ownerName, email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Error al registrar"); setLoading(false); return; }

      localStorage.setItem("accessToken",  data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken);
      localStorage.setItem("user",         JSON.stringify(data.user));
      localStorage.setItem("restaurantId", data.restaurant.id);
      localStorage.setItem("tenantId",     data.tenant.id);

      setStep(3);
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 font-sans">
      
      {/* Brand */}
      <div className="mb-10 text-center">
        <Link href="/" className="flex items-center justify-center gap-2 mb-2 hover:opacity-80 transition-opacity">
          <div className="w-8 h-8 rounded-full bg-[#ff5c35]"></div>
          <span className="text-3xl font-black text-slate-900 tracking-tighter">MRTPVREST</span>
        </Link>
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-3">EMPIEZA TU PRUEBA DE 15 DÍAS</p>
      </div>

      {/* Tarjeta Central Blanca */}
      <div className="w-full max-w-xl bg-white p-10 md:p-14 rounded-2xl shadow-xl border border-slate-100">

        {/* Stepper — solo visible en pasos 1 y 2 */}
        {step < 3 && (
          <div className="flex items-center justify-center gap-4 mb-12">
            {[
              { n: 1, label: "TU RESTAURANTE" },
              { n: 2, label: "TU CUENTA"      },
            ].map(({ n, label }, i) => (
              <div key={n} className="flex items-center gap-3">
                <div className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm transition-all
                  ${step === n ? "bg-[#fff0ed] text-[#ff5c35]" :
                    step > n  ? "bg-green-50 text-green-600"  :
                                 "bg-slate-50 text-slate-400 border border-slate-200"}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs
                    ${step === n ? "bg-[#ff5c35] text-white" :
                      step > n ? "bg-green-500 text-white" : "bg-slate-200 text-slate-500"}`}>
                    {step > n ? "✓" : n}
                  </div>
                  {label}
                </div>
                {i < 1 && (
                  <div className={`w-8 h-[2px] rounded transition-all ${step > n ? "bg-green-500" : "bg-slate-200"}`} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── PASO 1 — Tu restaurante ── */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="mb-8">
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">Tu restaurante</h2>
              <p className="text-lg text-slate-600">Cuéntanos sobre tu negocio para empezar.</p>
            </div>
            
            <Field label="Nombre del negocio" required>
              <input value={restaurantName} onChange={e => setRestaurantName(e.target.value)}
                placeholder="Ej: Tacos El Gordo" className={input()} />
            </Field>
            <Field label="Tu nombre completo" required>
              <input value={ownerName} onChange={e => setOwnerName(e.target.value)}
                placeholder="Ej: Juan García" className={input()} />
            </Field>
            
            {/* Tarjeta de Plan (Estilo Claro) */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mt-8">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Plan incluido</p>
              <p className="text-lg font-bold text-slate-900 mb-1">
                <span className="text-[#ff5c35]">15 días gratis</span> · Plan Básico
              </p>
              <p className="text-sm text-slate-500">Sin tarjeta de crédito requerida</p>
            </div>
          </div>
        )}

        {/* ── PASO 2 — Tu cuenta ── */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="mb-8">
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">Crea tu cuenta</h2>
              <p className="text-lg text-slate-600">Serás el administrador de <span className="font-bold text-slate-900">{restaurantName}</span>.</p>
            </div>
            
            <Field label="Correo electrónico" required>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="juan@mirestaurante.com" className={input()} />
            </Field>
            <Field label="Contraseña" required
              hint={<span className="text-xs text-slate-500 font-medium">Mínimo 8 caracteres</span>}>
              <div className="relative">
                <input type={showPass ? "text" : "password"} value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" className={input("pr-12")} />
                <button type="button" onClick={() => setShowPass(s => !s)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                  {showPass ? "🙈" : "👁️"}
                </button>
              </div>
              {password.length > 0 && password.length < 8 && (
                <p className="text-red-500 text-xs mt-2 font-medium">Mínimo 8 caracteres</p>
              )}
            </Field>
            
            <label className="flex items-start gap-3 cursor-pointer group mt-6">
              <div onClick={() => setTerms(t => !t)}
                className={`mt-0.5 w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-all
                  ${terms ? "bg-[#ff5c35] border-[#ff5c35]" : "bg-white border-slate-300 group-hover:border-slate-400"}`}>
                {terms && <span className="text-white text-xs font-black">✓</span>}
              </div>
              <span className="text-sm text-slate-600 select-none">
                Acepto los <a href="#" className="text-[#ff5c35] hover:underline font-medium">términos de servicio</a> y la <a href="#" className="text-[#ff5c35] hover:underline font-medium">política de privacidad</a>
              </span>
            </label>
          </div>
        )}

        {/* ── PASO 3 — Revisa tu email ── */}
        {step === 3 && (
          <div className="text-center space-y-8 py-6">
            <div className="w-24 h-24 mx-auto rounded-full bg-[#fff0ed] flex items-center justify-center text-5xl shadow-inner border border-red-50">
              ✉️
            </div>
            <div>
              <h2 className="text-3xl font-extrabold text-slate-900 mb-4">Revisa tu email</h2>
              <p className="text-lg text-slate-600 leading-relaxed">
                Enviamos un enlace de verificación a<br/>
                <span className="text-slate-900 font-bold">{email}</span>
              </p>
              {emailDomain && (
                <a
                  href={`https://${emailDomain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-6 px-8 py-3 bg-slate-100 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-200 transition-all shadow-sm"
                >
                  Abrir {emailDomain} →
                </a>
              )}
            </div>
            
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-left max-w-sm mx-auto space-y-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 border-b border-slate-200 pb-2">Qué sigue</p>
              {[
                "Haz clic en el botón del email",
                "Tu cuenta queda activada",
                "Configura tu negocio",
              ].map((s, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#fff0ed] text-[#ff5c35] text-xs font-black flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </div>
                  <span className="text-sm font-medium text-slate-700">{s}</span>
                </div>
              ))}
            </div>
            
            <div className="pt-4">
              <button
                onClick={handleResend}
                disabled={resending || resendDone}
                className="w-full py-4 rounded-lg font-bold border border-slate-200 hover:bg-slate-50 text-slate-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {resendDone
                  ? "✓ Correo reenviado"
                  : resending
                    ? "Enviando..."
                    : "No llegó el correo — Reenviar"}
              </button>
              <p className="text-xs text-slate-400 mt-4">El enlace expira en 24 horas.</p>
            </div>
          </div>
        )}

        {/* Error global */}
        {error && (
          <div className="mt-6 bg-red-50 border border-red-200 text-red-600 text-sm font-bold px-4 py-3 rounded-lg flex items-center gap-2">
            <span>⚠️</span> {error}
          </div>
        )}

        {/* Navegación Inferior (Botones) */}
        <div className={`flex gap-4 mt-10 ${step === 3 ? "hidden" : ""}`}>
          {step > 1 && (
            <button onClick={() => { setStep(s => s - 1); setError(""); }}
              className="px-6 py-4 rounded-lg font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-all">
              ← ATRÁS
            </button>
          )}
          
          {step < 2 ? (
            <button disabled={!canNext1} onClick={() => { setStep(2); setError(""); }}
              className="flex-1 py-4 rounded-lg font-bold bg-[#ff5c35] hover:bg-[#e54a25] text-white shadow-lg shadow-orange-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              CONTINUAR →
            </button>
          ) : (
            <button disabled={!canNext2 || loading} onClick={handleSubmit}
              className="flex-1 py-4 rounded-lg font-bold bg-[#ff5c35] hover:bg-[#e54a25] text-white shadow-lg shadow-orange-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? "Creando cuenta..." : "EMPEZAR GRATIS →"}
            </button>
          )}
        </div>

        {/* Footer Link */}
        {step < 3 && (
          <div className="mt-8 text-center pt-6 border-t border-slate-100">
            <p className="text-slate-600 text-sm">
              ¿Ya tienes cuenta?{" "}
              <Link href="/login" className="text-[#ff5c35] hover:underline font-bold transition-colors">
                Iniciar sesión
              </Link>
            </p>
          </div>
        )}

      </div>
    </div>
  );
}