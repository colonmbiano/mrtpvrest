"use client";
// app/(admin)/login/page.tsx
// Coloca en: apps/admin/app/(admin)/login/page.tsx
// O donde esté actualmente tu login page

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (token) router.push("/dashboard");
  }, []);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/api/auth/login", { email, password });
      localStorage.setItem("accessToken", data.accessToken);
      document.cookie = `mb-role=${data.user.role}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
      if (data.user?.role === "SUPER_ADMIN") {
        router.push("/dashboard");
      } else {
        router.push("/admin");
      }
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Credenciales incorrectas");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .login-root {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 1fr 1fr;
          font-family: 'Sora', sans-serif;
          background: #0c0c0e;
        }
        /* LEFT PANEL */
        .login-left {
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 48px;
          background: #0c0c0e;
          overflow: hidden;
        }
        .login-left::before {
          content: '';
          position: absolute;
          top: -120px; left: -120px;
          width: 500px; height: 500px;
          background: radial-gradient(circle, rgba(232,93,40,0.15) 0%, transparent 70%);
          pointer-events: none;
        }
        .login-left::after {
          content: '';
          position: absolute;
          bottom: -80px; right: -80px;
          width: 400px; height: 400px;
          background: radial-gradient(circle, rgba(232,93,40,0.08) 0%, transparent 70%);
          pointer-events: none;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
          position: relative;
          z-index: 1;
        }
        .brand-mark {
          width: 36px; height: 36px;
          background: #e85d28;
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
        }
        .brand-mark svg { width: 20px; height: 20px; stroke: white; fill: none; stroke-width: 2; }
        .brand-name { font-size: 15px; font-weight: 600; color: #f0f0f0; letter-spacing: -0.3px; }
        .brand-name span { color: #e85d28; }
        .left-content {
          position: relative;
          z-index: 1;
        }
        .left-headline {
          font-size: 38px;
          font-weight: 600;
          color: #f0f0f0;
          line-height: 1.15;
          letter-spacing: -1.5px;
          margin-bottom: 20px;
        }
        .left-headline em {
          font-style: normal;
          color: #e85d28;
        }
        .left-sub {
          font-size: 15px;
          color: #666;
          line-height: 1.6;
          max-width: 340px;
        }
        .left-stats {
          display: flex;
          gap: 32px;
          position: relative;
          z-index: 1;
        }
        .stat-item {}
        .stat-num {
          font-size: 28px;
          font-weight: 600;
          color: #f0f0f0;
          letter-spacing: -1px;
          font-family: 'DM Mono', monospace;
        }
        .stat-label {
          font-size: 12px;
          color: #444;
          margin-top: 2px;
        }

        /* RIGHT PANEL */
        .login-right {
          background: #f7f6f3;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 48px;
        }
        .login-card {
          width: 100%;
          max-width: 380px;
        }
        .login-card-title {
          font-size: 22px;
          font-weight: 600;
          color: #111;
          letter-spacing: -0.5px;
          margin-bottom: 6px;
        }
        .login-card-sub {
          font-size: 13px;
          color: #888;
          margin-bottom: 36px;
        }
        .field {
          margin-bottom: 16px;
        }
        .field label {
          display: block;
          font-size: 11px;
          font-weight: 500;
          color: #555;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        .input-wrap {
          position: relative;
        }
        .field input {
          width: 100%;
          height: 44px;
          padding: 0 14px;
          border: 1px solid #e2e1d9;
          border-radius: 10px;
          background: #fff;
          font-size: 14px;
          font-family: 'Sora', sans-serif;
          color: #111;
          outline: none;
          transition: border-color 0.15s;
          appearance: none;
        }
        .field input:focus {
          border-color: #e85d28;
          box-shadow: 0 0 0 3px rgba(232,93,40,0.08);
        }
        .pass-toggle {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          color: #aaa;
          display: flex;
          align-items: center;
        }
        .pass-toggle:hover { color: #666; }
        .pass-toggle svg { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 1.5; }
        .field input[type="password"] { padding-right: 40px; }
        .field input[type="text"] { padding-right: 40px; }

        .error-msg {
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 8px;
          padding: 10px 14px;
          font-size: 12px;
          color: #dc2626;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .error-msg svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 2; flex-shrink: 0; }

        .submit-btn {
          width: 100%;
          height: 46px;
          background: #111;
          color: #fff;
          border: none;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 500;
          font-family: 'Sora', sans-serif;
          cursor: pointer;
          transition: all 0.15s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 8px;
        }
        .submit-btn:hover:not(:disabled) {
          background: #e85d28;
        }
        .submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .submit-btn svg { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 2; }

        .divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 20px 0;
        }
        .divider-line { flex: 1; height: 1px; background: #e2e1d9; }
        .divider-text { font-size: 11px; color: #bbb; }

        .register-link {
          text-align: center;
          font-size: 13px;
          color: #888;
        }
        .register-link a {
          color: #e85d28;
          text-decoration: none;
          font-weight: 500;
        }
        .register-link a:hover { text-decoration: underline; }

        @media (max-width: 768px) {
          .login-root { grid-template-columns: 1fr; }
          .login-left { display: none; }
          .login-right { padding: 32px 24px; }
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .login-card { animation: fadeUp 0.4s ease both; }
      `}</style>

      <div className="login-root">
        {/* LEFT */}
        <div className="login-left">
          <div className="brand">
            <div className="brand-mark">
              <svg viewBox="0 0 24 24"><path d="M3 12h18M3 6h18M3 18h12"/></svg>
            </div>
            <div className="brand-name">MR<span>TPV</span>REST</div>
          </div>

          <div className="left-content">
            <div className="left-headline">
              Gestiona tu<br />restaurante<br /><em>sin complicaciones.</em>
            </div>
            <div className="left-sub">
              TPV, cocina, delivery y tienda online. Todo en una plataforma diseñada para restaurantes en LATAM.
            </div>
          </div>

          <div className="left-stats">
            <div className="stat-item">
              <div className="stat-num">62</div>
              <div className="stat-label">Restaurantes activos</div>
            </div>
            <div className="stat-item">
              <div className="stat-num">$2</div>
              <div className="stat-label">Desde por mes</div>
            </div>
            <div className="stat-item">
              <div className="stat-num">15d</div>
              <div className="stat-label">Prueba gratis</div>
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="login-right">
          <div className="login-card">
            <div className="login-card-title">Bienvenido de nuevo</div>
            <div className="login-card-sub">Ingresa a tu panel de administración</div>

            {error && (
              <div className="error-msg">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="field">
                <label>Correo electrónico</label>
                <input
                  type="email"
                  placeholder="tu@restaurante.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div className="field">
                <label>Contraseña</label>
                <div className="input-wrap">
                  <input
                    type={showPass ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="pass-toggle"
                    onClick={() => setShowPass((v) => !v)}
                    tabIndex={-1}
                  >
                    {showPass ? (
                      <svg viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
              </div>

              <button type="submit" className="submit-btn" disabled={loading}>
                {loading ? (
                  <>Verificando...</>
                ) : (
                  <>
                    Entrar al panel
                    <svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                  </>
                )}
              </button>
            </form>

            <div className="divider">
              <div className="divider-line" />
              <div className="divider-text">¿nuevo aquí?</div>
              <div className="divider-line" />
            </div>

            <div className="register-link">
              <a href="https://masterburguers.com/#precios">Crear cuenta gratis — 15 días sin tarjeta</a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
