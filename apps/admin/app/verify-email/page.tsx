"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

function VerifyEmailContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const token        = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error" | "expired">("loading");
  const [msg, setMsg]       = useState("");

  useEffect(() => {
    if (!token) { setStatus("error"); setMsg("Token no encontrado."); return; }

    fetch(`${API}/api/auth/verify-email/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setStatus("success");
          setTimeout(() => router.push(data.isOnboarded ? "/admin" : "/onboarding"), 3000);
        } else if (data.error?.includes("expirado")) {
          setStatus("expired");
          setMsg(data.error);
        } else {
          setStatus("error");
          setMsg(data.error || "Token inválido.");
        }
      })
      .catch(() => { setStatus("error"); setMsg("Error de conexión."); });
  }, [token, router]);

  return (
    <div className="w-full max-w-md bg-[#111] border border-white/5 rounded-[2.5rem] p-10 shadow-2xl text-center">

      {status === "loading" && (
        <div className="space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full border-4 border-orange-500/30 border-t-orange-500 animate-spin" />
          <p className="text-gray-400 font-bold">Verificando tu cuenta...</p>
        </div>
      )}

      {status === "success" && (
        <div className="space-y-5">
          <div className="w-20 h-20 mx-auto rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center text-4xl">
            ✓
          </div>
          <div>
            <p className="text-2xl font-black mb-2">Email verificado</p>
            <p className="text-gray-400 text-sm">Tu cuenta está activa. Redirigiendo...</p>
          </div>
          <div className="w-full bg-white/5 rounded-full h-1 overflow-hidden">
            <div className="bg-green-500 h-1 animate-[grow_3s_linear_forwards]" style={{ width: "100%" }} />
          </div>
        </div>
      )}

      {status === "expired" && (
        <div className="space-y-5">
          <div className="w-20 h-20 mx-auto rounded-full bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center text-4xl">
            ⏰
          </div>
          <div>
            <p className="text-2xl font-black mb-2">Enlace expirado</p>
            <p className="text-gray-400 text-sm">{msg}</p>
          </div>
          <button
            onClick={() => router.push("/onboarding")}
            className="w-full py-4 rounded-2xl font-black bg-orange-500 hover:bg-orange-600 text-white transition-all active:scale-95"
          >
            IR AL DASHBOARD →
          </button>
          <p className="text-xs text-gray-600">
            Puedes reenviar el email desde la configuración de tu cuenta.
          </p>
        </div>
      )}

      {status === "error" && (
        <div className="space-y-5">
          <div className="w-20 h-20 mx-auto rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-4xl">
            ✗
          </div>
          <div>
            <p className="text-2xl font-black mb-2">Enlace inválido</p>
            <p className="text-gray-400 text-sm">{msg}</p>
          </div>
          <button
            onClick={() => router.push("/login")}
            className="w-full py-4 rounded-2xl font-black bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-all"
          >
            INICIAR SESIÓN
          </button>
        </div>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-6"
      style={{ fontFamily: "'Inter', sans-serif" }}>

      <div className="mb-10 text-center">
        <h1 className="text-3xl font-black tracking-tighter">
          MRTPV<span className="text-orange-500">REST</span>
        </h1>
      </div>

      <Suspense fallback={
        <div className="w-full max-w-md bg-[#111] border border-white/5 rounded-[2.5rem] p-10 shadow-2xl text-center">
          <div className="w-16 h-16 mx-auto rounded-full border-4 border-orange-500/30 border-t-orange-500 animate-spin" />
        </div>
      }>
        <VerifyEmailContent />
      </Suspense>
    </div>
  );
}
