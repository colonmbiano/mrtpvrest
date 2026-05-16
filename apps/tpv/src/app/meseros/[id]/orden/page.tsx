import OrdenClient from "./OrdenClient";

// Sin export de `dynamicParams`: Next 16 lo exige booleano literal y el
// build 'export' de Capacitor aborta si es `true` explícito. Ver nota
// completa en ../page.tsx.
export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function Page({ params }: { params: { id: string } }) {
  return <OrdenClient params={params} />;
}
