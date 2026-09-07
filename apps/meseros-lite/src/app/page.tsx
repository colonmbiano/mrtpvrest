import { redirect } from "next/navigation";
import { APP_HOME } from "@/lib/app-mode";

export default function HomePage() {
  redirect(APP_HOME);
}
