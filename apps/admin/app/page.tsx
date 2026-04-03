"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getUser } from "@/lib/auth";

/**
 * RootPage: Punto de entrada inteligente del sistema.
 *
 * OPTIMIZACIONES:
 * 1. Uso de router.replace para evitar polución en el stack de navegación.
 * 2. Ejecución atómica de la lógica de negocio para reducir tiempo de redirección.
 * 3. Renderizado ultra-ligero para mejorar el Core Web Vital: LCP (Largest Contentful Paint).
 */
export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    // Iniciamos métrica de rendimiento
    const t0 = performance.now();

    const user = getUser();

    // LOGIC OPTIMIZATION: Priorizamos el reemplazo de ruta sobre el empuje (push)
    // para evitar que el usuario quede atrapado en una página de carga al presionar 'atrás'.
    if (!user) {
      router.replace("/login");
    } else {
      if (user.role === "SUPER_ADMIN") {
        router.replace("/dashboard");
      } else {
        router.replace("/admin");
      }
    }

    const t1 = performance.now();
    console.debug(`[Auth-Redirect] Logic executed in ${(t1 - t0).toFixed(4)}ms`);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="flex flex-col items-center gap-4">
        {/* CSS-only animation for zero JS main-thread blockage during spin */}
        <div className="text-4xl animate-spin">🍔</div>
        <p className="text-xs font-black uppercase tracking-[0.3em] opacity-50">Sincronizando Terminal...</p>
      </div>
    </div>
  );
}
