import OrdenClient from "./OrdenClient";

// Sin export de `dynamicParams`: Next 16 lo exige booleano literal y el
// build 'export' de Capacitor aborta si es `true` explícito. Ver nota
// completa en ../page.tsx.
export function generateStaticParams() {
  return [{ id: "_" }];
}

// Next 16: `params` es Promise — await en el server wrapper y pasar el id
// resuelto (igual que ../page.tsx). Sin esto la navegación client deja
// params.id undefined.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrdenClient params={{ id }} />;
}
