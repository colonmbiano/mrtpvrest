import { redirect } from "next/navigation";

// El ruteo por grupos se fusionó en el centro de impresión unificado.
// Mantenemos la ruta por compatibilidad de enlaces externos.
export default function GruposImpresorasPage() {
  redirect("/admin/impresoras?tab=ruteo");
}
