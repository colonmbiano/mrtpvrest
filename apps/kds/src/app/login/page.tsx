"use client";

import { useRouter } from "next/navigation";
import LoginScreen from "../LoginScreen";

export default function LoginPage() {
  const router = useRouter();

  return <LoginScreen onSuccess={() => router.replace("/")} />;
}
