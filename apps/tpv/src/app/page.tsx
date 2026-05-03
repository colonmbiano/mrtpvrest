import { redirect } from "next/navigation";

// force-dynamic evita que Next prerenderice esta respuesta y Vercel cachee un 307 sin Location.
// El middleware ya maneja las redirecciones; este page.tsx solo actúa como fallback.
export const dynamic = "force-dynamic";

export default function RootPage() {
  redirect("/pos/menu");
}
