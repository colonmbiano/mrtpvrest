"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getApiUrl } from "@/lib/config";

const API = getApiUrl();

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
    <div className="w-full max-w-md rounded-[24px] border border-bd-1 bg-surf-1 p-10 text-center shadow-[var(--shadow-md)]">

      {status === "loading" && (
        <div className="space-y-4">
          <div className="mx-auto h-16 w-16 animate-spin rounded-full border-4 border-iris-soft border-t-[var(--brand-primary)]" />
          <p className="font-bold text-tx-mut">Verificando tu cuenta...</p>
        </div>
      )}

      {status === "success" && (
        <div className="space-y-5">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full text-4xl" style={{ background: "var(--ok-soft)", color: "var(--ok)" }}>
            ✓
          </div>
          <div>
            <p className="mb-2 font-display text-2xl font-extrabold text-tx-hi">Email verificado</p>
            <p className="text-sm text-tx-mut">Tu cuenta está activa. Redirigiendo...</p>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-surf-2">
            <div className="h-1 animate-[grow_3s_linear_forwards]" style={{ width: "100%", background: "var(--ok)" }} />
          </div>
        </div>
      )}

      {status === "expired" && (
        <div className="space-y-5">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full text-4xl" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
            ⏰
          </div>
          <div>
            <p className="mb-2 font-display text-2xl font-extrabold text-tx-hi">Enlace expirado</p>
            <p className="text-sm text-tx-mut">{msg}</p>
          </div>
          <button
            onClick={() => router.push("/onboarding")}
            className="w-full rounded-[13px] py-4 font-extrabold text-white transition-all active:scale-95"
            style={{ background: "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))", boxShadow: "0 8px 22px var(--iris-glow)" }}
          >
            IR AL DASHBOARD →
          </button>
          <p className="text-xs text-tx-dim">
            Puedes reenviar el email desde la configuración de tu cuenta.
          </p>
        </div>
      )}

      {status === "error" && (
        <div className="space-y-5">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full text-4xl" style={{ background: "var(--err-soft)", color: "var(--err)" }}>
            ✗
          </div>
          <div>
            <p className="mb-2 font-display text-2xl font-extrabold text-tx-hi">Enlace inválido</p>
            <p className="text-sm text-tx-mut">{msg}</p>
          </div>
          <button
            onClick={() => router.push("/login")}
            className="w-full rounded-[13px] border border-bd-2 bg-surf-2 py-4 font-extrabold text-tx transition-all hover:bg-surf-3"
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
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-tx" style={{ background: "var(--bg)" }}>

      <div className="mb-10 flex items-center gap-3 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-[14px] font-display text-sm font-extrabold text-white" style={{ background: "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))" }}>MR</span>
        <h1 className="font-display text-3xl font-extrabold tracking-[-.03em] text-tx-hi">
          MRTPV<span className="text-primary">REST</span>
        </h1>
      </div>

      <Suspense fallback={
        <div className="w-full max-w-md rounded-[24px] border border-bd-1 bg-surf-1 p-10 text-center shadow-[var(--shadow-md)]">
          <div className="mx-auto h-16 w-16 animate-spin rounded-full border-4 border-iris-soft border-t-[var(--brand-primary)]" />
        </div>
      }>
        <VerifyEmailContent />
      </Suspense>
    </div>
  );
}
