"use client";
import { useState } from "react";
import api from "@/lib/api";

const card: React.CSSProperties = {
  background: "var(--surf, #0e0e1a)",
  border: "1px solid var(--border, #1e1e30)",
  borderRadius: 24, padding: "36px 32px",
  boxShadow: "0 0 40px rgba(124,58,237,0.07)",
};
const label: React.CSSProperties = {
  display: "block", fontSize: 10, fontWeight: 700,
  color: "var(--muted, #6b6b90)", textTransform: "uppercase",
  letterSpacing: "0.8px", marginBottom: 6,
};
const input: React.CSSProperties = {
  width: "100%", padding: "11px 14px",
  background: "var(--surf2, #13131f)",
  border: "1px solid var(--border2, #2a2a40)",
  borderRadius: 10, fontSize: 13,
  color: "var(--text, #f0f0f8)", outline: "none",
};

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.post("/api/auth/forgot-password", { email });
      setSent(true);
    } catch (err: any) {
      setError(err.response?.data?.error || "Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6"
         style={{ background: "var(--bg, #080810)", fontFamily: "'DM Sans', sans-serif" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <span style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 800,
            fontSize: 22, color: "var(--text, #f0f0f8)", letterSpacing: -1,
          }}>
            MRTPV<span style={{ color: "#9f67ff" }}>REST</span>
          </span>
        </div>

        <div style={card}>
          <h2 style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 800,
            fontSize: 20, color: "var(--text, #f0f0f8)",
            marginBottom: 4, letterSpacing: -0.5,
          }}>Restablecer contraseña</h2>
          <p style={{ fontSize: 12, color: "var(--muted, #6b6b90)", marginBottom: 24 }}>
            Te enviaremos un enlace a tu correo
          </p>

          {sent ? (
            <div>
              <div style={{
                padding: "14px 16px", borderRadius: 12, fontSize: 13, lineHeight: 1.5,
                background: "rgba(34,197,94,0.08)", color: "#22c55e",
                border: "1px solid rgba(34,197,94,0.2)", marginBottom: 20,
              }}>
                Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña. Revisa tu bandeja (y spam). Expira en 1 hora.
              </div>
              <a href="/login" style={{
                display: "block", textAlign: "center", fontSize: 12,
                fontWeight: 700, color: "var(--muted, #6b6b90)", textDecoration: "none",
              }}>← Volver al inicio de sesión</a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={label}>Correo</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="tu@correo.com" required autoFocus style={input}
                />
              </div>

              {error && (
                <div style={{
                  padding: "10px 14px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                  background: "rgba(239,68,68,0.08)", color: "#ef4444",
                  border: "1px solid rgba(239,68,68,0.2)", textAlign: "center",
                }}>{error}</div>
              )}

              <button
                type="submit" disabled={loading}
                style={{
                  width: "100%", padding: "13px",
                  background: "linear-gradient(135deg, #7c3aed, #9f67ff)",
                  border: "none", borderRadius: 12,
                  fontFamily: "'Syne', sans-serif", fontWeight: 800,
                  fontSize: 13, color: "#fff", cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.6 : 1,
                  boxShadow: "0 4px 20px rgba(124,58,237,0.3)",
                }}
              >
                {loading ? "Enviando..." : "Enviar enlace →"}
              </button>

              <div style={{ textAlign: "center" }}>
                <a href="/login" style={{
                  fontSize: 12, fontWeight: 600, color: "var(--muted, #6b6b90)", textDecoration: "none",
                }}>← Volver al inicio de sesión</a>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
