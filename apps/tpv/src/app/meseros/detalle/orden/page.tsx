"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import OrdenClient from "./OrdenClient";

// Ruta ESTÁTICA para tomar la comanda de una mesa. Mismo motivo que
// ../page.tsx: el id viaja por query param (`/meseros/detalle/orden/?id=<cuid>`)
// para resolver en el export estático del APK, no como segmento `[id]`.
function OrdenInner() {
  const params = useSearchParams();
  const id = params.get("id") || "";
  if (!id) return null;
  return <OrdenClient params={{ id }} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <OrdenInner />
    </Suspense>
  );
}
