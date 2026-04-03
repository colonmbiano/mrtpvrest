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
        setError("Acceso denegado: Esta terminal es solo para Super Administradores.");
        setLoading(false);
        return;
      }

      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("user", JSON.stringify(data.user));
      // El Super Admin no necesita restaurantId ya que ve todo
      localStorage.removeItem("restaurantId");
      localStorage.removeItem("locationId");

      router.push("/saas/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.error || "Error de conexión con la central");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050505] p-4 font-syne">
      <div className="w-full max-w-md">
        <div className="text-center mb-12">
          <div className="inline-block bg-orange-500 text-black text-[10px] font-black px-2 py-1 rounded mb-4 uppercase">
            SaaS Central
          </div>
          <h1 className="text-5xl font-black text-white tracking-tighter">
            MRTPV<span className="text-orange-500">REST</span>
          </h1>
          <p className="text-gray-500 text-sm mt-2 font-bold uppercase tracking-widest">Global Control Center</p>
        </div>

        <div className="bg-[#111] border border-gray-800 rounded-[2.5rem] p-10 shadow-2xl">
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-[10px] font-black text-gray-500 uppercase ml-2 mb-2 tracking-widest">
                ID de Acceso (Email)
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@mrtpvrest.com"
                required
                className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 transition-all text-white font-bold"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-500 uppercase ml-2 mb-2 tracking-widest">
                Llave Maestra (Password)
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 transition-all text-white font-bold"
              />
            </div>

            {error && (
              <div className="text-xs font-bold px-4 py-3 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-5 rounded-[1.5rem] bg-white hover:bg-orange-500 hover:text-white text-black font-black transition-all active:scale-95 shadow-xl uppercase tracking-tighter"
            >
              {loading ? "Verificando..." : "Ingresar a la Central"}
            </button>
          </form>
        </div>

        <p className="text-center mt-8 text-[10px] text-gray-600 font-bold uppercase tracking-widest">
          Sistema Protegido • © 2024 MRTPVREST
        </p>
      </div>
    </div>
  );
}
