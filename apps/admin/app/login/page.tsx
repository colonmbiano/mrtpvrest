"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import api from "@/lib/api";

export default function LoginPage() {
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

      // Verificamos si es un rol permitido
      if (data.user.role !== "ADMIN" && data.user.role !== "KITCHEN" && data.user.role !== "SUPER_ADMIN") {
        setError("Sin acceso al panel admin");
        setLoading(false);
        return;
      }

      // GUARDAR DATOS EN LOCALSTORAGE (Importante para SaaS)
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("user", JSON.stringify(data.user));

      // Cookie para middleware (no httpOnly — mismo trust level que localStorage)
      document.cookie = `mb-role=${data.user.role}; path=/; max-age=86400; SameSite=Lax`;

      // Guardamos el restaurantId para que el interceptor lo envíe en cada petición
      if (data.user.restaurantId) {
        localStorage.setItem("restaurantId", data.user.restaurantId);
      }

      // Redirigir según el rol
      if (data.user.role === "SUPER_ADMIN") {
        router.push("/dashboard");
      } else {
        router.push("/admin");
      }

    } catch (err: any) {
      setError(err.response?.data?.error || "Error al iniciar sesion");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{background:"var(--bg)"}}>
      <div className="w-full max-w-sm relative">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-2">
            <Image src="/logo.png" alt="Logo" width={140} height={140} className="rounded-2xl" />
          </div>
          <p className="text-sm mt-2 font-bold uppercase tracking-widest" style={{color:"var(--muted)"}}>MRTPVREST SaaS</p>
        </div>

        <div className="rounded-2xl p-8 border" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            <div>
              <label className="block text-xs font-bold mb-2 uppercase tracking-widest" style={{color:"var(--muted)"}}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all" style={{background:"var(--surf2)",border:"1.5px solid var(--border)",color:"var(--text)"}} />
            </div>
            <div>
              <label className="block text-xs font-bold mb-2 uppercase tracking-widest" style={{color:"var(--muted)"}}>Contraseña</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all" style={{background:"var(--surf2)",border:"1.5px solid var(--border)",color:"var(--text)"}} />
            </div>

            {error && <div className="text-sm px-4 py-3 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20">{error}</div>}

            <button type="submit" disabled={loading} className="w-full py-3 rounded-xl font-syne font-black text-sm tracking-wide transition-all active:scale-95" style={{background: loading ? "var(--muted)" : "var(--gold)", color:"#000"}}>
              {loading ? "Entrando..." : "Entrar al Panel"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
