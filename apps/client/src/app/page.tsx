import { redirect } from "next/navigation";

export default function RootPage() {
  // Redirigir al dominio principal si alguien entra a client.mrtpvrest.com directamente
  redirect("https://mrtpvrest.com");
  return null;
}
