import { redirect } from "next/navigation";

// El dashboard de gastos operativos + compras se movió a Finanzas
// (OperatingExpense no es inventario). Dejamos este archivo como redirect
// server-side para no romper bookmarks ni links antiguos.
export default function GastosMovedRedirect() {
  redirect("/admin/finanzas/gastos");
}
