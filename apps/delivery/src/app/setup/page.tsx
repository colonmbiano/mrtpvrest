"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// La página de IDs crudos quedó deprecada: el vinculado del dispositivo se hace
// ahora desde la home (SetupScreen: login admin + elegir sucursal de una lista).
// Mantenemos la ruta solo para redirigir cualquier enlace/bookmark viejo a /.
// Client-side para que funcione también en el APK (output: export, sin redirect server).
export default function DeliverySetupRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return null;
}
