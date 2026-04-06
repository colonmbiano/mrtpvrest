"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

function input(extra = "") {
  return `w-full bg-black border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 transition-all text-sm font-bold placeholder:font-normal placeholder:text-gray-600 ${extra}`;
}

function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex justify-between items-center ml-1 mb-1.5">
        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
          {label}{required && <span className="text-orange-500 ml-0.5">*</span>}
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
    <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-6"
      style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* Brand */}
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-black tracking-tighter">
          MRTPV<span className="text-orange-500">REST</span>
        </h1>
        <p className="text-gray-500 text-sm mt-1 font-bold tracking-widest uppercase">
          Empieza tu prueba de 15 días
        </p>
      </div>

      {/* Stepper — solo visible en pasos 1 y 2 */}
      {step < 3 && (
        <div className="flex items-center gap-3 mb-10">
          {[
            { n: 1, label: "Tu Restaurante" },
            { n: 2, label: "Tu Cuenta"      },
          ].map(({ n, label }, i) => (
            <div key={n} className="flex items-center gap-3">
              <div className="flex flex-col items-center gap-1">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black transition-all
                  ${step === n ? "bg-orange-500 text-black" :
                    step > n  ? "bg-green-500 text-black"  :
                                 "bg-white/5 text-gray-500 border border-white/10"}`}>
                  {step > n ? "✓" : n}
                </div>
                <span className={`text-[9px] font-black uppercase tracking-widest
                  ${step === n ? "text-orange-400" : step > n ? "text-green-400" : "text-gray-600"}`}>
                  {label}
                </span>
              </div>
              {i < 1 && (
                <div className={`w-16 h-[2px] mb-4 rounded transition-all ${step > n ? "bg-green-500" : "bg-white/5"}`} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Card */}
      <div className="w-full max-w-md bg-[#111] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl">

        {/* ── PASO 1 — Tu restaurante ── */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-black mb-1">Tu restaurante</h2>
              <p className="text-gray-500 text-sm">Cuéntanos sobre tu negocio para empezar.</p>
            </div>
            <Field label="Nombre del negocio" required>
              <input value={restaurantName} onChange={e => setRestaurantName(e.target.value)}
                placeholder="Ej: Tacos El Gordo" className={input()} />
            </Field>
            <Field label="Tu nombre completo" required>
              <input value={ownerName} onChange={e => setOwnerName(e.target.value)}
                placeholder="Juan García" className={input()} />
            </Field>
            <div className="bg-orange-500/5 border border-orange-500/20 rounded-2xl p-4 text-sm">
              <p className="text-orange-400 font-black text-[10px] uppercase mb-1">Plan incluido</p>
              <p className="text-white font-bold">15 días gratis · Plan Básico</p>
              <p className="text-gray-400 text-xs mt-0.5">Sin tarjeta de crédito requerida</p>
            </div>
          </div>
        )}

        {/* ── PASO 3 — Revisa tu email ── */}
        {step === 3 && (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 mx-auto rounded-full bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-4xl">
              ✉️
            </div>
            <div>
              <h2 className="text-2xl font-black mb-2">Revisa tu email</h2>
              <p className="text-gray-400 text-sm leading-relaxed">
                Enviamos un enlace de verificación a{" "}
                <span className="text-white font-bold">{email}</span>
              </p>
              {emailDomain && (
                <a
                  href={`https://${emailDomain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-4 px-5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm font-bold text-white hover:bg-white/10 transition-all"
                >
                  Abrir {emailDomain} →
                </a>
              )}
            </div>
            <div className="bg-white/3 border border-white/5 rounded-2xl p-4 text-left space-y-2">
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Que sigue</p>
              {[
                "Haz clic en el botón del email",
                "Tu cuenta queda activada",
                "Configura tu negocio",
              ].map((s, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 text-[10px] font-black flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </div>
                  <span className="text-sm text-gray-400">{s}</span>
                </div>
              ))}
            </div>
            <button
              onClick={handleResend}
              disabled={resending || resendDone}
              className="w-full py-3 rounded-2xl font-black border border-white/10 hover:border-white/20 text-gray-400 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {resendDone
                ? "✓ Correo reenviado"
                : resending
                  ? "Enviando..."
                  : "No llegó el correo — reenviar"}
            </button>
            <p className="text-xs text-gray-600">
              El enlace expira en 24 horas.
            </p>
          </div>
        )}

        {/* ── PASO 2 — Tu cuenta ── */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-black mb-1">Crea tu cuenta</h2>
              <p className="text-gray-500 text-sm">Serás el administrador de <span className="text-white font-bold">{restaurantName}</span>.</p>
            </div>
            <Field label="Email" required>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="juan@mirestaurante.com" className={input()} />
            </Field>
            <Field label="Contraseña" required
              hint={<span className="text-[10px] text-gray-600">Mínimo 8 caracteres</span>}>
              <div className="relative">
                <input type={showPass ? "text" : "password"} value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" className={input("pr-12")} />
                <button type="button" onClick={() => setShowPass(s => !s)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-sm transition-colors">
                  {showPass ? "🙈" : "👁️"}
                </button>
              </div>
              {password.length > 0 && password.length < 8 && (
                <p className="text-red-400 text-[11px] mt-1 ml-1">Mínimo 8 caracteres</p>
              )}
            </Field>
            <label className="flex items-start gap-3 cursor-pointer group">
              <div onClick={() => setTerms(t => !t)}
                className={`mt-0.5 w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all
                  ${terms ? "bg-orange-500 border-orange-500" : "border-white/20 group-hover:border-white/40"}`}>
                {terms && <span className="text-black text-xs font-black">✓</span>}
              </div>
              <span className="text-sm text-gray-400 select-none">
                Acepto los{" "}
                <span className="text-orange-400 underline">términos de servicio</span>
                {" "}y la{" "}
                <span className="text-orange-400 underline">política de privacidad</span>
              </span>
            </label>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-5 bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold px-4 py-3 rounded-2xl">
            {error}
          </div>
        )}

        {/* Navegación — oculta en paso 3 */}
        <div className={`flex gap-3 mt-8 ${step === 3 ? "hidden" : ""}`}>
          {step > 1 && (
            <button onClick={() => { setStep(s => s - 1); setError(""); }}
              className="flex-1 py-4 rounded-2xl font-black text-gray-400 hover:text-white border border-white/10 hover:border-white/20 transition-all">
              ← ATRÁS
            </button>
          )}
          {step < 2 ? (
            <button disabled={!canNext1} onClick={() => { setStep(2); setError(""); }}
              className="flex-1 py-4 rounded-2xl font-black bg-white text-black hover:bg-orange-500 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-95">
              CONTINUAR →
            </button>
          ) : (
            <button disabled={!canNext2 || loading} onClick={handleSubmit}
              className="flex-1 py-4 rounded-2xl font-black bg-orange-500 hover:bg-orange-600 text-white shadow-2xl shadow-orange-500/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-95">
              {loading ? "Creando cuenta..." : "EMPEZAR GRATIS →"}
            </button>
          )}
        </div>

        {step < 3 && (
          <p className="text-center text-gray-600 text-xs mt-6">
            ¿Ya tienes cuenta?{" "}
            <a href="/login" className="text-orange-400 hover:text-orange-300 font-bold transition-colors">
              Iniciar sesión
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
