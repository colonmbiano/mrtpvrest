"use client";
import { useEffect, useState } from "react";
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

export default function ResetPasswordPage() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token"));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("La contraseña debe tener al menos 8 caracteres."); return; }
    if (password !== confirm) { setError("Las contraseñas no coinciden."); return; }
    setLoading(true);
    try {
      await api.post("/api/auth/reset-password", { token, newPassword: password });
      setDone(true);
    } catch (err: any) {
      setError(err.response?.data?.error || "No se pudo restablecer. El enlace pudo expirar.");
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
          }}>Nueva contraseña</h2>
          <p style={{ fontSize: 12, color: "var(--muted, #6b6b90)", marginBottom: 24 }}>
            Elige una contraseña segura (mínimo 8 caracteres)
          </p>

          {done ? (
            <div>
              <div style={{
                padding: "14px 16px", borderRadius: 12, fontSize: 13, lineHeight: 1.5,
                background: "rgba(34,197,94,0.08)", color: "#22c55e",
                border: "1px solid rgba(34,197,94,0.2)", marginBottom: 20,
              }}>
                ✓ Contraseña actualizada. Ya puedes iniciar sesión con tu nueva contraseña.
              </div>
              <a href="/login" style={{
                display: "block", textAlign: "center", padding: "13px",
                background: "linear-gradient(135deg, #7c3aed, #9f67ff)",
                borderRadius: 12, fontFamily: "'Syne', sans-serif", fontWeight: 800,
                fontSize: 13, color: "#fff", textDecoration: "none",
              }}>Ir al inicio de sesión →</a>
            </div>
          ) : token === null ? (
            <div style={{
              padding: "14px 16px", borderRadius: 12, fontSize: 13, lineHeight: 1.5,
              background: "rgba(239,68,68,0.08)", color: "#ef4444",
              border: "1px solid rgba(239,68,68,0.2)",
            }}>
              Falta el enlace de restablecimiento o es inválido. Solicítalo de nuevo desde{" "}
              <a href="/forgot-password" style={{ color: "#9f67ff", fontWeight: 700 }}>¿Olvidaste tu contraseña?</a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={label}>Nueva contraseña</label>
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required autoFocus style={input}
                />
              </div>
              <div>
                <label style={label}>Confirmar contraseña</label>
                <input
                  type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                  placeholder="••••••••" required style={input}
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
                {loading ? "Guardando..." : "Restablecer contraseña →"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
