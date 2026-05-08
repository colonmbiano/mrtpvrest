"use client";

import { useEffect, useState } from "react";
import LoginScreen from "./LoginScreen";
import KdsScreen from "./KdsScreen";

export default function HomePage() {
  // Auth determinada por presencia de accessToken válido en localStorage.
  // KDS app independiente: una sola pantalla — login o KDS.
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tok = localStorage.getItem("accessToken");
    const loc = localStorage.getItem("locationId");
    setHasSession(Boolean(tok && loc));
  }, []);

  if (hasSession === null) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0a0c]">
        <div className="w-12 h-12 border-4 border-amber-500/20 border-t-[#ffb84d] rounded-full animate-spin" />
      </div>
    );
  }

  if (!hasSession) {
    return <LoginScreen onSuccess={() => setHasSession(true)} />;
  }

  return <KdsScreen onLogout={() => setHasSession(false)} />;
}
