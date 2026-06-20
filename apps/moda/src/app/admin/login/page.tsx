"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LockKeyhole, Mail, ShoppingBag, ArrowRight, AlertCircle } from "lucide-react";
import api from "@/lib/admin-api";
import { ADMIN_KEYS } from "@/lib/admin-auth";

interface Loc {
  id: string;
  name: string;
  businessType?: string | null;
}

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post<{ accessToken: string; user: { restaurantId?: string } & Record<string, unknown> }>(
        "/api/auth/login",
        { email, password },
      );
      localStorage.setItem(ADMIN_KEYS.token, data.accessToken);
      localStorage.setItem(ADMIN_KEYS.user, JSON.stringify(data.user));
      if (data.user?.restaurantId) localStorage.setItem(ADMIN_KEYS.restaurantId, data.user.restaurantId);

      if (!data.user?.restaurantId) {
        setError("Esta cuenta no tiene una tienda asociada. Crea tu tienda desde la app MODA+ primero.");
        setLoading(false);
        return;
      }

      // Sucursal por defecto: la RETAIL si existe, si no la primera.
      try {
        const locRes = await api.get<Loc[]>("/api/admin/locations");
        const locs = Array.isArray(locRes.data) ? locRes.data : [];
        const chosen = locs.find((l) => l.businessType === "RETAIL") || locs[0];
        if (chosen?.id) {
          localStorage.setItem(ADMIN_KEYS.locationId, chosen.id);
          localStorage.setItem(ADMIN_KEYS.locationName, chosen.name || "");
        }
      } catch {
        /* sin sucursales todavía */
      }

      router.push("/admin");
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Credenciales incorrectas";
      setError(msg);
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-7 flex flex-col items-center text-center">
          <div
            className="grid h-14 w-14 place-items-center rounded-2xl text-[#06140d]"
            style={{ background: "var(--brand-primary)", boxShadow: "0 12px 34px var(--iris-glow)" }}
          >
            <ShoppingBag size={26} strokeWidth={2.4} />
          </div>
          <h1
            className="mt-4 text-2xl font-black tracking-tight text-[var(--tx-hi)]"
            style={{ fontFamily: "var(--font-syne), Syne, sans-serif" }}
          >
            MODA<span className="text-[var(--brand-primary)]">+</span> Admin
          </h1>
          <p className="mt-1 text-sm text-[var(--tx-mut)]">Catálogo, stock y ventas de tu tienda</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-[1.75rem] border border-[var(--bd-1)] bg-[var(--surf-1)] p-6 shadow-2xl"
        >
          {error && (
            <div className="flex items-start gap-2 rounded-2xl border border-[var(--err)]/30 bg-[var(--err-soft)] px-3 py-2.5 text-[13px] font-semibold text-[var(--err)]">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <label className="block">
            <span className="mb-1.5 ml-1 block font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--tx-mut)]">
              Correo
            </span>
            <div className="flex min-h-12 items-center gap-3 rounded-2xl border border-[var(--bd-1)] bg-[var(--surf-2)] px-4">
              <Mail size={17} className="text-[var(--tx-dim)]" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="dueno@mitienda.com"
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[var(--tx-hi)] outline-none placeholder:text-[var(--tx-dim)]"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 ml-1 block font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--tx-mut)]">
              Contraseña
            </span>
            <div className="flex min-h-12 items-center gap-3 rounded-2xl border border-[var(--bd-1)] bg-[var(--surf-2)] px-4">
              <LockKeyhole size={17} className="text-[var(--tx-dim)]" />
              <input
                type={showPass ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[var(--tx-hi)] outline-none placeholder:text-[var(--tx-dim)]"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                aria-label={showPass ? "Ocultar contraseña" : "Mostrar contraseña"}
                className="text-[var(--tx-dim)] transition-colors hover:text-[var(--tx-hi)]"
              >
                {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-black text-[#06140d] transition-all active:scale-[.98] disabled:opacity-60"
            style={{ background: "var(--brand-primary)", boxShadow: "0 10px 30px var(--iris-glow)" }}
          >
            {loading ? "Entrando…" : "Entrar"}
            {!loading && <ArrowRight size={17} />}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-[var(--tx-dim)]">
          ¿Eres cajero? Tu acceso es por <span className="font-bold text-[var(--tx-mut)]">PIN</span> en la pantalla
          principal de la caja.
        </p>
      </div>
    </main>
  );
}
