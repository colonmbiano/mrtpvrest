"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import MeserosDetailClient from "./MeserosDetailClient";

// Ruta ESTÁTICA (sin segmento dinámico [id]): el TPV móvil es un export
// estático de Next (`output: 'export'`) y una ruta `[id]` solo generaba un
// placeholder `_`, así que abrir una mesa real (`/meseros/<cuid>`) caía en
// 404 en el WebView de Capacitor y rebotaba a la planta. Aquí el id viaja
// como query param (`/meseros/detalle/?id=<cuid>`), que SÍ resuelve porque
// el archivo estático `detalle/index.html` existe para cualquier id.
//
// useSearchParams exige Suspense en el build estático (Next lo requiere).
function DetalleInner() {
  const params = useSearchParams();
  const id = params.get("id") || "";
  if (!id) return null;
  return <MeserosDetailClient params={{ id }} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DetalleInner />
    </Suspense>
  );
}
