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

export default function Page({ params }: { params: { id: string } }) {
  return <MeserosDetailClient params={params} />;
}
