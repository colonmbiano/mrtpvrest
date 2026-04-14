"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep]                       = useState(1);
  const [restaurantName, setRestaurantName]   = useState("");
  const [ownerName, setOwnerName]             = useState("");
  const [email, setEmail]                     = useState("");
  const [password, setPassword]               = useState("");
  const [terms, setTerms]                     = useState(false);
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState("");
  const [showPass, setShowPass]               = useState(false);
  const [resending, setResending]             = useState(false);
  const [resendDone, setResendDone]           = useState(false);
  const [emailDomain, setEmailDomain]         = useState("");

  const canNext1 = restaurantName.trim().length > 0 && ownerName.trim().length > 0;
  const canNext2 = email.trim().length > 0 && password.length >= 8 && terms;

  const handleResend = async () => {
    setResending(true);
    try {
      await api.post("/api/auth/resend-verification", { email });
      setResendDone(true);
      setTimeout(() => setResendDone(false), 5000);
    } catch { /* silencioso */ }
    setResending(false);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.post("/api/auth/register", {
        restaurantName,
        ownerName,
        email,
        password,
      });
      const domain = email.split("@")[1];
      if (domain) setEmailDomain(domain);
      setStep(3);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Error al crear la cuenta");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'DM Sans', sans-serif" }}>

      {/* Brand */}
      <div style={{ marginBottom: 32, textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: "linear-gradient(135deg,#7c3aed,#9f67ff)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 10, color: "#fff" }}>MR</div>
          <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: "var(--text)", letterSpacing: -0.5 }}>
            MRTPV<span style={{ color: "var(--brand-primary)" }}>REST</span>
          </span>
        </div>
        <p style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>EMPIEZA TU PRUEBA DE 15 DÍAS</p>
      </div>

      {/* Card */}
      <div style={{ width: "100%", maxWidth: 480, background: "var(--surf)", border: "1px solid var(--border2)", borderRadius: 20, padding: "36px 40px", boxShadow: "0 0 40px rgba(124,58,237,0.06)" }}>

        {/* Stepper */}
        {step < 3 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 32 }}>
            {[{ n: 1, label: "TU RESTAURANTE" }, { n: 2, label: "TU CUENTA" }].map(({ n, label }, i) => (
              <div key={n} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "5px 12px", borderRadius: 99, fontSize: 10, fontWeight: 700,
                  background: step === n ? "rgba(124,58,237,0.12)" : step > n ? "rgba(16,185,129,0.1)" : "var(--surf2)",
                  color: step === n ? "var(--brand-primary)" : step > n ? "#10b981" : "var(--muted)",
                  border: `1px solid ${step === n ? "rgba(124,58,237,0.25)" : step > n ? "rgba(16,185,129,0.25)" : "var(--border2)"}`,
                }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800,
                    background: step === n ? "var(--brand-primary)" : step > n ? "#10b981" : "var(--border2)",
                    color: step >= n ? "#fff" : "var(--muted)",
                  }}>
                    {step > n ? "✓" : n}
                  </div>
                  {label}
                </div>
                {i < 1 && <div style={{ width: 24, height: 2, borderRadius: 2, background: step > n ? "#10b981" : "var(--border2)" }} />}
              </div>
            ))}
          </div>
        )}

        {/* Paso 1 */}
        {step === 1 && (
          <div>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, color: "var(--text)", marginBottom: 4 }}>Tu restaurante</h2>
            <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 24 }}>Cuéntanos sobre tu negocio para empezar.</p>
            {[{ label: "Nombre del negocio", value: restaurantName, set: setRestaurantName, ph: "Ej: Tacos El Gordo" },
              { label: "Tu nombre completo", value: ownerName, set: setOwnerName, ph: "Ej: Juan García" }].map(f => (
              <div key={f.label} style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 6 }}>{f.label} <span style={{ color: "#ef4444" }}>*</span></label>
                <input value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.ph}
                  style={{ width: "100%", padding: "11px 14px", background: "var(--surf2)", border: "1px solid var(--border2)", borderRadius: 10, color: "var(--text)", fontSize: 13, outline: "none", fontFamily: "'DM Sans',sans-serif" }} />
              </div>
            ))}
            <div style={{ background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.18)", borderRadius: 12, padding: "12px 16px", marginTop: 16 }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 4 }}>Plan incluido</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}><span style={{ color: "var(--brand-primary)" }}>15 días gratis</span> · Plan Básico</p>
              <p style={{ fontSize: 11, color: "var(--muted)" }}>Sin tarjeta de crédito requerida</p>
            </div>
          </div>
        )}

        {/* Paso 2 */}
        {step === 2 && (
          <div>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, color: "var(--text)", marginBottom: 4 }}>Crea tu cuenta</h2>
            <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 24 }}>Serás el administrador de <strong style={{ color: "var(--text)" }}>{restaurantName}</strong>.</p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 6 }}>Correo electrónico <span style={{ color: "#ef4444" }}>*</span></label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="juan@mirestaurante.com"
                style={{ width: "100%", padding: "11px 14px", background: "var(--surf2)", border: "1px solid var(--border2)", borderRadius: 10, color: "var(--text)", fontSize: 13, outline: "none" }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.7px" }}>Contraseña <span style={{ color: "#ef4444" }}>*</span></label>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>Mínimo 8 caracteres</span>
              </div>
              <div style={{ position: "relative" }}>
                <input type={showPass ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                  style={{ width: "100%", padding: "11px 44px 11px 14px", background: "var(--surf2)", border: "1px solid var(--border2)", borderRadius: 10, color: "var(--text)", fontSize: 13, outline: "none" }} />
                <button type="button" onClick={() => setShowPass(s => !s)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 15 }}>
                  {showPass ? "🙈" : "👁️"}
                </button>
              </div>
              {password.length > 0 && password.length < 8 && <p style={{ color: "#ef4444", fontSize: 11, marginTop: 4 }}>Mínimo 8 caracteres</p>}
            </div>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", marginTop: 8 }}>
              <div onClick={() => setTerms(t => !t)} style={{
                marginTop: 2, width: 18, height: 18, borderRadius: 5, flexShrink: 0, border: `1px solid ${terms ? "var(--brand-primary)" : "var(--border2)"}`,
                background: terms ? "var(--brand-primary)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {terms && <span style={{ color: "#fff", fontSize: 10, fontWeight: 800 }}>✓</span>}
              </div>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>
                Acepto los <a href="#" style={{ color: "var(--brand-primary)" }}>términos</a> y la <a href="#" style={{ color: "var(--brand-primary)" }}>política de privacidad</a>
              </span>
            </label>
          </div>
        )}

        {/* Paso 3 — email enviado */}
        {step === 3 && (
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, margin: "0 auto 20px" }}>✉️</div>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 22, color: "var(--text)", marginBottom: 8 }}>Revisa tu email</h2>
            <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.7, marginBottom: 24 }}>
              Enviamos un enlace a <br /><strong style={{ color: "var(--text)" }}>{email}</strong>
            </p>
            {emailDomain && (
              <a href={`https://${emailDomain}`} target="_blank" rel="noopener noreferrer"
                style={{ display: "inline-block", padding: "10px 24px", background: "var(--surf2)", border: "1px solid var(--border2)", borderRadius: 10, fontSize: 13, fontWeight: 700, color: "var(--text)", textDecoration: "none", marginBottom: 24 }}>
                Abrir {emailDomain} →
              </a>
            )}
            <div style={{ background: "var(--surf2)", border: "1px solid var(--border2)", borderRadius: 12, padding: 16, textAlign: "left", marginBottom: 20 }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 12 }}>Qué sigue</p>
              {["Haz clic en el botón del email", "Tu cuenta queda activada", "Configura tu negocio"].map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(124,58,237,0.12)", color: "var(--brand-primary)", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i+1}</div>
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>{s}</span>
                </div>
              ))}
            </div>
            <button onClick={handleResend} disabled={resending || resendDone}
              style={{ width: "100%", padding: "12px", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer", border: "1px solid var(--border2)", background: "var(--surf2)", color: "var(--muted)", opacity: (resending || resendDone) ? 0.6 : 1 }}>
              {resendDone ? "✓ Correo reenviado" : resending ? "Enviando..." : "No llegó el correo — Reenviar"}
            </button>
          </div>
        )}

        {/* Error global */}
        {error && (
          <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", fontSize: 13, fontWeight: 700 }}>⚠️ {error}</div>
        )}

        {/* Botones de navegación */}
        {step < 3 && (
          <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
            {step > 1 && (
              <button onClick={() => { setStep(s => s - 1); setError(""); }}
                style={{ padding: "12px 20px", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer", background: "var(--surf2)", border: "1px solid var(--border2)", color: "var(--muted)" }}>
                ← Atrás
              </button>
            )}
            {step < 2 ? (
              <button disabled={!canNext1} onClick={() => { setStep(2); setError(""); }}
                style={{ flex: 1, padding: "13px", borderRadius: 10, fontWeight: 800, fontSize: 13, border: "none", background: "var(--brand-primary)", color: "#fff", cursor: canNext1 ? "pointer" : "not-allowed", opacity: canNext1 ? 1 : 0.5, boxShadow: "0 4px 20px rgba(124,58,237,0.25)" }}>
                CONTINUAR →
              </button>
            ) : (
              <button disabled={!canNext2 || loading} onClick={handleSubmit}
                style={{ flex: 1, padding: "13px", borderRadius: 10, fontWeight: 800, fontSize: 13, border: "none", background: "var(--brand-primary)", color: "#fff", cursor: (canNext2 && !loading) ? "pointer" : "not-allowed", opacity: (canNext2 && !loading) ? 1 : 0.5, boxShadow: "0 4px 20px rgba(124,58,237,0.25)" }}>
                {loading ? "Creando cuenta..." : "EMPEZAR GRATIS →"}
              </button>
            )}
          </div>
        )}

        {/* Footer link */}
        {step < 3 && (
          <div style={{ marginTop: 20, textAlign: "center", borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <p style={{ fontSize: 13, color: "var(--muted)" }}>¿Ya tienes cuenta?{" "}
              <Link href="/login" style={{ color: "var(--brand-primary)", fontWeight: 700, textDecoration: "none" }}>Iniciar sesión</Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
