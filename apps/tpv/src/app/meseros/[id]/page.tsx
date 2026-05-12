import MeserosDetailClient from "./MeserosDetailClient";

// Ruta dinámica para cualquier ID de mesa (M1, M2, M100, etc.). No
// pre-renderizamos por adelantado: las mesas se crean por restaurante y
// no las conocemos en build time. Next.js sirve la página dinámicamente.
export const dynamic = "force-dynamic";

export default function Page({ params }: { params: { id: string } }) {
  return <MeserosDetailClient params={params} />;
}
