import { redirect } from "next/navigation";

// Unificado: el reporte regular se reemplaza por Reportes IA. Dejamos
// este archivo como redirect server-side para no romper bookmarks ni
// links internos antiguos que apunten a /admin/reportes.
export default function ReportesIndexPage() {
  redirect("/admin/reportes/ia");
}
