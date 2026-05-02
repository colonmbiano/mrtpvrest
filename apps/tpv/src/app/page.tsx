import { redirect } from "next/navigation";

export default function RootPage() {
  // El middleware ya maneja las redirecciones, pero Next.js requiere un page.tsx en la raíz
  // para evitar errores 404 si el middleware llega a fallar o no se ejecuta.
  redirect("/pos/menu");
}
