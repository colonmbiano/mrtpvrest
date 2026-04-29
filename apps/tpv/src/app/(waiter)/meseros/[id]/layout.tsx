// Layout server component para el segmento dinámico [id]. Su único trabajo
// es exportar `generateStaticParams` para que `output: 'export'` (Capacitor /
// APK build) genere un placeholder estático del segmento. Los IDs reales se
// resuelven en runtime desde el cliente — el placeholder es un page shell que
// React rehidrata con el id de la URL al navegar.
//
// Sin esto, Next.js falla el build con:
//   "Page is missing generateStaticParams() so it cannot be used with
//    output: export config".
//
// Aplica también a hijos como /meseros/[id]/orden — Next.js comparte los
// params del segmento padre.
import React from "react";

export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function MesaIdLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
