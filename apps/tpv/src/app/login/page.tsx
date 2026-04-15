"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

const ACCENT = "#ff5c35";

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const minPin = 4;
  const maxPin = 6;

  useEffect(() => {
    // If device not configured, send to setup
    if (typeof window !== "undefined") {
      const loc = localStorage.getItem("locationId");
      if (!loc) router.replace("/setup");
    }
  }, [router]);

  useEffect(() => {
    // Auto-submit when minimum PIN length reached
    if (pin.length >= minPin) {
      submitPin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  async function submitPin() {
    if (pin.length < minPin || loading) return;
    setLoading(true);
    setError("");
    try {
      const restaurantId = localStorage.getItem("restaurantId");
      const body: any = { pin };
      if (restaurantId) body.restaurantId = restaurantId;
      const { data } = await api.post("/api/auth/pin", body);
      const token = data.token || data.accessToken;
      const user = data.user || data.employee || null;
      if (token) localStorage.setItem("accessToken", token);
      if (user) localStorage.setItem("user", JSON.stringify(user));
      router.push("/");
    } catch (err) {
      setError("PIN incorrecto");
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  function handleNum(n: string) {
    if (pin.length >= maxPin) return;
    setPin((p) => p + n);
  }
  function handleBack() {
    setPin((p) => p.slice(0, -1));
  }
  function handleClear() {
    setPin("");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-black tracking-tighter" style={{ color: ACCENT }}>
            MRTPVREST
          </h1>
          <p className="text-sm mt-1 font-medium" style={{ color: "var(--muted)" }}>
            Ingresa tu PIN para continuar
          </p>
        </div>

        <div className="rounded-3xl border p-8 shadow-2xl flex flex-col gap-6" style={{ background: "var(--surf)", borderColor: "var(--border)" }}>
          <div className="flex justify-center">
            <div className="flex gap-3">
              {Array.from({ length: maxPin }).map((_, i) => (
                <div
                  key={i}
                  className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-[var(--bg)] flex items-center justify-center"
                  style={{ border: i < pin.length ? `2px solid ${ACCENT}` : `1px solid var(--border)` }}
                >
                  {i < pin.length ? "•" : ""}
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-center text-sm text-red-400">{error}</p>}

          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <button
                key={n}
                onClick={() => handleNum(String(n))}
                className="py-6 rounded-2xl text-xl font-bold"
                style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
              >
                {n}
              </button>
            ))}

            <button
              onClick={handleClear}
              className="py-6 rounded-2xl text-xl font-bold"
              style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--muted)" }}
            >
              C
            </button>

            <button
              onClick={() => handleNum("0")}
              className="py-6 rounded-2xl text-xl font-bold"
              style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
            >
              0
            </button>

            <button
              onClick={handleBack}
              className="py-6 rounded-2xl text-xl font-bold"
              style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--muted)" }}
            >
              ⌫
            </button>
          </div>

          <button
            onClick={submitPin}
            disabled={pin.length < minPin || loading}
            className="w-full py-4 rounded-2xl font-black uppercase"
            style={{ background: ACCENT, color: "#000" }}
          >
            {loading ? "Verificando..." : "Ingresar"}
          </button>

          <button onClick={() => router.push("/setup")} className="text-xs text-center underline" style={{ color: "var(--muted)" }}>
            Configurar dispositivo
          </button>
        </div>
      </div>
    </div>
  );
}
