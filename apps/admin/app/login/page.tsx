"use client";
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
  const [pendingEmail, setPendingEmail] = useState("");
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

      const tenantRes = await api.get("/api/tenant/me");
      const tenant = tenantRes.data;

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

  // Estilos reutilizables
  const inputStyle = {
    width: "100%", padding: "11px 14px",
    border: "1px solid var(--border2)",
    borderRadius: 10, background: "var(--surf)",
    color: "var(--text)", fontSize: 13, outline: "none",
    fontFamily: "'DM Sans', sans-serif",
  } as const;

  return (
    <>
      {/* Modal email pendiente */}
      {pendingEmail && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(8,8,16,0.8)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 24, zIndex: 50,
        }}>
          <div style={{
            width: "100%", maxWidth: 400,
            background: "var(--surf)", border: "1px solid var(--border2)",
            borderRadius: 24, padding: 40, textAlign: "center",
            boxShadow: "0 0 60px rgba(0,0,0,0.5)"
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: "50%",
              background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 36, margin: "0 auto 20px"
            }}>✉️</div>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: "var(--text)", marginBottom: 8 }}>
              Verifica tu email
            </h2>
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 24, lineHeight: 1.6 }}>
              Enviamos un enlace a <strong style={{ color: "var(--text)" }}>{pendingEmail}</strong>
            </p>
            <button
              onClick={handleResend} disabled={resending || resendDone}
              style={{
                width: "100%", padding: "12px",
                borderRadius: 10, fontWeight: 700, fontSize: 13,
                cursor: "pointer", marginBottom: 12, border: "none",
                background: resendDone ? "rgba(16,185,129,0.1)" : "var(--brand-primary)",
                color: resendDone ? "#10b981" : "#fff",
                opacity: resending ? 0.6 : 1,
              }}
            >
              {resendDone ? "✓ Correo reenviado" : resending ? "Enviando..." : "Reenviar correo"}
            </button>
            <button
              onClick={() => { setPendingEmail(""); localStorage.removeItem("accessToken"); document.cookie = "mb-role=; path=/; max-age=0"; }}
              style={{ background: "none", border: "none", fontSize: 12, color: "var(--muted)", cursor: "pointer", textDecoration: "underline" }}
            >Volver al login</button>
          </div>
        </div>
      )}

      {/* Layout split */}
      <div style={{
        minHeight: "100vh", display: "grid",
        gridTemplateColumns: "1.3fr 1fr",
        fontFamily: "'DM Sans', sans-serif",
      }}>
        {/* Panel izquierdo */}
        <div style={{
          background: "var(--surf)", borderRight: "1px solid var(--border)",
          padding: "48px 48px", display: "flex", flexDirection: "column",
          justifyContent: "space-between", position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", top: "-20%", left: "-20%",
            width: 500, height: 500,
            background: "radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)",
            pointerEvents: "none",
          }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 48, textDecoration: "none" }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: "linear-gradient(135deg, #7c3aed, #9f67ff)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 11, color: "#fff"
              }}>MR</div>
              <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, color: "var(--text)", letterSpacing: -0.5 }}>
                MRTPV<span style={{ color: "var(--brand-primary)" }}>REST</span>
              </span>
            </Link>
            <h1 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 36, color: "var(--text)", lineHeight: 1.1, letterSpacing: -1.5, marginBottom: 16 }}>
              Gestiona tu restaurante{" "}
              <em style={{ fontStyle: "normal", color: "var(--brand-primary)" }}>sin complicaciones.</em>
            </h1>
            <p style={{ fontSize: 15, color: "var(--muted)", lineHeight: 1.7, maxWidth: 340 }}>
              TPV, cocina, delivery y tienda online. Todo sincronizado en tiempo real para restaurantes en LATAM.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 24, borderTop: "1px solid var(--border)", paddingTop: 24, position: "relative", zIndex: 1 }}>
            {[{ n: "+500", l: "Restaurantes activos" }, { n: "$29", l: "Desde por mes" }, { n: "15d", l: "Prueba gratis" }].map(s => (
              <div key={s.n}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 24, fontWeight: 800, color: "var(--text)" }}>{s.n}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Panel derecho (formulario) */}
        <div style={{ background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 40px" }}>
          <div style={{ width: "100%", maxWidth: 380 }}>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 24, color: "var(--text)", marginBottom: 4, letterSpacing: -0.5 }}>Bienvenido de nuevo</h2>
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 28 }}>Ingresa a tu panel de administración</p>

            {error && (
              <div style={{
                marginBottom: 20, padding: "10px 14px", borderRadius: 10,
                background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
                color: "#ef4444", fontSize: 13, fontWeight: 700
              }}>{error}</div>
            )}

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>Correo electrónico</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@restaurante.com" required autoComplete="email" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>Contraseña</label>
                <div style={{ position: "relative" }}>
                  <input type={showPass ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password" style={{ ...inputStyle, paddingRight: 44 }} />
                  <button type="button" onClick={() => setShowPass(v => !v)} tabIndex={-1}
                    style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 16 }}>
                    {showPass ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading} style={{
                width: "100%", padding: "13px",
                background: "var(--brand-primary)",
                border: "none", borderRadius: 10,
                fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 13,
                color: "#fff", cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
                boxShadow: "0 4px 20px rgba(124,58,237,0.25)",
                transition: "all .2s", marginTop: 4,
              }}>
                {loading ? "Verificando..." : "Entrar al panel →"}
              </button>
            </form>

            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "24px 0" }}>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              <span style={{ fontSize: 10, color: "var(--muted2)", textTransform: "uppercase", letterSpacing: "0.8px" }}>¿nuevo aquí?</span>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>
            <div style={{ textAlign: "center" }}>
              <Link href="/register" style={{ fontSize: 13, fontWeight: 700, color: "var(--brand-primary)", textDecoration: "none" }}>
                Crear cuenta gratis — 15 días sin tarjeta
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
