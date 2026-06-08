import { redirect } from "next/navigation";

// Seguridad se fusionó en "Personal y Seguridad" como segundo tab.
// Mantenemos la ruta por compatibilidad de enlaces externos.
export default function SeguridadRedirectPage() {
  redirect("/admin/usuarios?tab=seguridad");
}
