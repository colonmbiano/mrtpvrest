"use client";
import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";

// Tipado mínimo local para la Web Speech API (no está en lib.dom por defecto
// en todos los entornos TS). Usamos `any` puntualmente para evitar ruido.
type SpeechRecognition = any;
type Status = "idle" | "listening" | "processing" | "success" | "error";

type Toast = {
  kind: "success" | "error" | "info";
  text: string;
};

export default function FloatingVoiceAgent() {
  const [status, setStatus] = useState<Status>("idle");
  const [toast, setToast] = useState<Toast | null>(null);
  const [transcript, setTranscript] = useState("");
  const [supported, setSupported] = useState<boolean | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    setSupported(!!SR);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  async function sendToAgent(prompt: string) {
    setStatus("processing");
    try {
      const { data } = await api.post("/api/ai/agent", { prompt });
      if (data?.ok === false) {
        setStatus("error");
        setToast({ kind: "error", text: data?.message || "No se pudo ejecutar" });
      } else {
        setStatus("success");
        setToast({
          kind: data?.action ? "success" : "info",
          text: data?.message || "Listo",
        });
      }
    } catch (e: any) {
      setStatus("error");
      const msg =
        e?.response?.data?.error ||
        e?.message ||
        "Error de red al hablar con el agente";
      setToast({ kind: "error", text: msg });
    } finally {
      setTimeout(() => setStatus("idle"), 1200);
    }
  }

  function handleMicClick() {
    if (!supported) {
      setToast({
        kind: "error",
        text: "Tu navegador no soporta dictado por voz (usa Chrome o Edge).",
      });
      return;
    }
    if (status === "listening") {
      recognitionRef.current?.stop();
      return;
    }
    if (status === "processing") return;

    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    const rec: SpeechRecognition = new SR();
    rec.lang = "es-MX";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;

    rec.onstart = () => {
      setTranscript("");
      setStatus("listening");
    };
    rec.onerror = (ev: any) => {
      setStatus("error");
      setToast({
        kind: "error",
        text:
          ev?.error === "not-allowed"
            ? "Permiso de micrófono denegado."
            : `Error de reconocimiento: ${ev?.error || "desconocido"}`,
      });
      setTimeout(() => setStatus("idle"), 1200);
    };
    rec.onresult = (ev: any) => {
      const text = ev?.results?.[0]?.[0]?.transcript || "";
      setTranscript(text);
      if (text.trim()) sendToAgent(text.trim());
      else setStatus("idle");
    };
    rec.onend = () => {
      // Terminó el reconocimiento: si seguimos en "listening" (no se disparó
      // onresult con texto ni onerror), volvemos a idle. Usamos el updater
      // funcional porque el valor capturado en el closure puede estar stale.
      setStatus(prev => (prev === "listening" ? "idle" : prev));
    };

    recognitionRef.current = rec;
    try {
      rec.start();
    } catch {
      // Algunos navegadores lanzan si se llama start() mientras ya está escuchando.
      setStatus("idle");
    }
  }

  const bg =
    status === "listening"
      ? "#ef4444"
      : status === "processing"
      ? "#6366f1"
      : status === "success"
      ? "#10b981"
      : status === "error"
      ? "#f59e0b"
      : "#111827";

  return (
    <>
      <button
        type="button"
        onClick={handleMicClick}
        aria-label="Asistente de voz"
        title={
          supported === false
            ? "Dictado no soportado en este navegador"
            : "Dictar instrucción"
        }
        className="fixed z-40 bottom-5 right-5 md:bottom-8 md:right-8 w-14 h-14 md:w-16 md:h-16 rounded-full shadow-2xl flex items-center justify-center text-white transition-all active:scale-95"
        style={{
          background: bg,
          boxShadow:
            status === "listening"
              ? "0 0 0 8px rgba(239, 68, 68, 0.25), 0 10px 30px rgba(0,0,0,0.25)"
              : "0 10px 30px rgba(0,0,0,0.25)",
        }}
      >
        {status === "processing" ? (
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            className="animate-spin"
            aria-hidden
          >
            <circle
              cx="12"
              cy="12"
              r="9"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="40 20"
              opacity="0.85"
            />
          </svg>
        ) : (
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect x="9" y="3" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="8" y1="22" x2="16" y2="22" />
          </svg>
        )}
      </button>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed z-50 left-1/2 -translate-x-1/2 bottom-24 md:bottom-28 max-w-sm w-[92%] md:w-auto"
        >
          <div
            className="px-4 py-3 rounded-2xl shadow-2xl text-sm font-semibold text-white"
            style={{
              background:
                toast.kind === "success"
                  ? "#10b981"
                  : toast.kind === "error"
                  ? "#ef4444"
                  : "#3b82f6",
            }}
          >
            {toast.text}
          </div>
        </div>
      )}

      {transcript && status === "processing" && (
        <div
          className="fixed z-40 left-1/2 -translate-x-1/2 bottom-44 md:bottom-48 max-w-md w-[90%] px-4 py-2 rounded-full text-xs text-white/90"
          style={{ background: "rgba(17, 24, 39, 0.85)" }}
        >
          “{transcript}”
        </div>
      )}
    </>
  );
}
