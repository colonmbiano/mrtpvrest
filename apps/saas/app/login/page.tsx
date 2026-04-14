"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

export default function SaaSLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/api/auth/login", { email, password });
      if (data.user.role !== "SUPER_ADMIN") {
        setError("Acceso denegado: solo para Super Administradores.");
        setLoading(false);
        return;
      }
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.removeItem("restaurantId");
      localStorage.removeItem("locationId");
      document.cookie = `mb-role=SUPER_ADMIN; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.error || "Error de conexión con la central");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6"
         style={{ background: "var(--bg, #080810)", fontFamily: "'DM Sans', sans-serif" }}>
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 12
          }}>
            <div style={{
              width: 36, height: 36,
              background: "linear-gradient(135deg, #7c3aed, #9f67ff)",
              borderRadius: 10, display: "flex", alignItems: "center",
              justifyContent: "center", fontFamily: "'Syne', sans-serif",
              fontWeight: 800, fontSize: 11, color: "#fff"
            }}>MR</div>
            <span style={{
              fontFamily: "'Syne', sans-serif", fontWeight: 800,
              fontSize: 22, color: "var(--text, #f0f0f8)", letterSpacing: -1
            }}>
              MRTPV<span style={{ color: "#9f67ff" }}>REST</span>
            </span>
          </div>
          <div style={{
            display: "inline-block", padding: "3px 10px", borderRadius: 6,
            fontSize: 10, fontWeight: 700, letterSpacing: "0.5px",
            textTransform: "uppercase",
            background: "rgba(124,58,237,0.15)", color: "#9f67ff",
            border: "1px solid rgba(124,58,237,0.3)"
          }}>SaaS Central</div>
        </div>

        {/* Card */}
        <div style={{
          background: "var(--surf, #0e0e1a)",
          border: "1px solid var(--border, #1e1e30)",
          borderRadius: 24, padding: "36px 32px",
          boxShadow: "0 0 40px rgba(124,58,237,0.07)"
        }}>
          <h2 style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 800,
            fontSize: 20, color: "var(--text, #f0f0f8)",
            marginBottom: 4, letterSpacing: -0.5
          }}>Acceso Central</h2>
          <p style={{ fontSize: 12, color: "var(--muted, #6b6b90)", marginBottom: 24 }}>
            Solo Super Administradores
          </p>

          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{
                display: "block", fontSize: 10, fontWeight: 700,
                color: "var(--muted, #6b6b90)", textTransform: "uppercase",
                letterSpacing: "0.8px", marginBottom: 6
              }}>Correo</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="admin@mrtpvrest.com" required
                style={{
                  width: "100%", padding: "11px 14px",
                  background: "var(--surf2, #13131f)",
                  border: "1px solid var(--border2, #2a2a40)",
                  borderRadius: 10, fontSize: 13,
                  color: "var(--text, #f0f0f8)", outline: "none"
                }}
              />
            </div>
            <div>
              <label style={{
                display: "block", fontSize: 10, fontWeight: 700,
                color: "var(--muted, #6b6b90)", textTransform: "uppercase",
                letterSpacing: "0.8px", marginBottom: 6
              }}>Contraseña</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required
                style={{
                  width: "100%", padding: "11px 14px",
                  background: "var(--surf2, #13131f)",
                  border: "1px solid var(--border2, #2a2a40)",
                  borderRadius: 10, fontSize: 13,
                  color: "var(--text, #f0f0f8)", outline: "none"
                }}
              />
            </div>

            {error && (
              <div style={{
                padding: "10px 14px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                background: "rgba(239,68,68,0.08)", color: "#ef4444",
                border: "1px solid rgba(239,68,68,0.2)", textAlign: "center"
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
                transition: "all .2s"
              }}
            >
              {loading ? "Verificando..." : "Ingresar a la Central →"}
            </button>
          </form>
        </div>

        <p style={{
          textAlign: "center", marginTop: 20,
          fontSize: 10, color: "var(--muted2, #4a4a6a)",
          fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px"
        }}>
          Sistema Protegido · © 2026 MRTPVREST
        </p>
      </div>
    </div>
  );
}
