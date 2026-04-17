"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function IdleGuard({ timeoutMs = 90_000 }: { timeoutMs?: number }) {
  const router = useRouter();
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function reset() {
      if (t.current) clearTimeout(t.current);
      t.current = setTimeout(() => {
        sessionStorage.removeItem("kiosk-cart");
        router.replace("/");
      }, timeoutMs);
    }
    const events = ["touchstart", "touchmove", "click", "keydown"];
    events.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    reset();
    return () => {
      if (t.current) clearTimeout(t.current);
      events.forEach((ev) => window.removeEventListener(ev, reset));
    };
  }, [router, timeoutMs]);

  return null;
}
