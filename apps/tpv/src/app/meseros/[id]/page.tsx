import MeserosDetailClient from "./MeserosDetailClient";

// Pre-renderizamos UNA página placeholder con id="_". NO exportamos
// `dynamicParams`: Next 16 exige que sea un booleano literal (no admite
// un valor por env) y aborta el build estático de Capacitor
// (output 'export') si es `true` explícito. Sin la export, el default
// vale `true` en web (server) → sirve /meseros/<idReal> bajo demanda — y
// el build 'export' del APK solo emite el placeholder "_" sin error.
// Mismo planteamiento que /meseros/[id]/orden.
export function generateStaticParams() {
  return [{ id: "_" }];
}

// Next 16: `params` es un Promise. Hay que await-earlo en el server wrapper y
// pasar el id ya resuelto; el client component lo lee síncrono. Sin esto, en
// navegación client (tap a una mesa desde la sala) `params.id` llega undefined
// → GET /api/tables/undefined → la pantalla crashea/queda sin "Abrir comanda".
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MeserosDetailClient params={{ id }} />;
}
