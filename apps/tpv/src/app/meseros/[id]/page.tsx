import MeserosDetailClient from "./MeserosDetailClient";

// Static export para Capacitor: pre-renderizamos UNA página placeholder
// con id="_" y dynamicParams=false. El cliente lee el id real con
// useParams() en runtime — la navegación client-side de Next no toca
// el filesystem, así que el mismo HTML sirve para cualquier mesa.
// Mismo truco que ya usa /meseros/[id]/orden.
export function generateStaticParams() {
  return [{ id: "_" }];
}

export const dynamicParams = true;

export default function Page({ params }: { params: { id: string } }) {
  return <MeserosDetailClient params={params} />;
}
