import { redirect } from "next/navigation";

// Unificado: el dashboard regular se reemplaza por Reportes IA. Dejamos
// este archivo como redirect server-side para no romper bookmarks ni
// links internos antiguos que apunten a /admin/restaurant-dashboard.
export default function RestaurantDashboardPage() {
  redirect("/admin/reportes/ia");
}
