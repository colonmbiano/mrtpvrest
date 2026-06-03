"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { hapticError, hapticLight, hapticSuccess } from "@/lib/haptics";
import { useTicketStore, type CartItem, type Product } from "@/store/ticketStore";

type SpeechRecognition = any;
type Status = "idle" | "listening" | "processing" | "error";

type DictationItem = {
  menuItemId: string;
  quantity: number;
  notes?: string;
  needsReview?: boolean;
  product: Product;
};

export default function VoiceOrderDictation() {
  const [status, setStatus] = useState<Status>("idle");
  const [supported, setSupported] = useState<boolean | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const addItemToActive = useTicketStore((s) => s.addItemToActive);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const SR =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      setSupported(Boolean(SR));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function sendDictation(prompt: string) {
    setStatus("processing");
    const toastId = toast.loading(`Escuchado: "${prompt}"`);
    try {
      const { data } = await api.post("/api/ai/order-dictation", { prompt });
      const items: DictationItem[] = Array.isArray(data?.items) ? data.items : [];
      if (items.length === 0) {
        hapticError();
        toast.error(data?.message || "No encontre productos del menu", { id: toastId });
        return;
      }

      let added = 0;
      let review = 0;
      for (const item of items) {
        const product = item.product;
        const unit = Number(product.promoPrice || product.price || 0);
        const quantity = Math.max(1, Math.min(99, Number(item.quantity || 1)));
        const notes = item.notes?.trim() || undefined;

        for (let i = 0; i < quantity; i += 1) {
          const cartItem: CartItem = {
            ...product,
            menuItemId: item.menuItemId,
            quantity: 1,
            subtotal: unit,
            price: unit,
            originalPrice: product.price,
            notes,
          };
          addItemToActive(cartItem);
          added += 1;
        }
        if (item.needsReview) review += 1;
      }

      const unresolved = Array.isArray(data?.unresolved) ? data.unresolved : [];
      const suffix = unresolved.length > 0 ? ` · sin reconocer: ${unresolved.join(", ")}` : "";
      if (review > 0) {
        toast.warning(`${added} agregado(s). Revisa variantes/modificadores${suffix}`, { id: toastId });
      } else {
        toast.success(`${added} producto(s) agregado(s) al ticket${suffix}`, { id: toastId });
      }
      hapticSuccess();
    } catch (err: any) {
      hapticError();
      toast.error(
        err?.response?.data?.error ||
          err?.message ||
          "No se pudo interpretar el dictado",
        { id: toastId },
      );
    } finally {
      setStatus("idle");
    }
  }

  function handleClick() {
    if (!supported) {
      toast.error("Tu navegador no soporta dictado por voz");
      hapticError();
      return;
    }
    if (status === "processing") return;
    if (status === "listening") {
      recognitionRef.current?.stop();
      return;
    }

    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    const rec: SpeechRecognition = new SR();
    rec.lang = "es-MX";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;

    rec.onstart = () => {
      hapticLight();
      setStatus("listening");
    };
    rec.onerror = (ev: any) => {
      setStatus("error");
      hapticError();
      toast.error(
        ev?.error === "not-allowed"
          ? "Permiso de microfono denegado"
          : `Error de dictado: ${ev?.error || "desconocido"}`,
      );
      setTimeout(() => setStatus("idle"), 900);
    };
    rec.onresult = (ev: any) => {
      const text = ev?.results?.[0]?.[0]?.transcript || "";
      if (text.trim()) sendDictation(text.trim());
      else setStatus("idle");
    };
    rec.onend = () => {
      setStatus((prev) => (prev === "listening" ? "idle" : prev));
    };

    recognitionRef.current = rec;
    try {
      rec.start();
    } catch {
      setStatus("idle");
    }
  }

  const active = status === "listening";
  const busy = status === "processing";

  return (
    <button
      type="button"
      onClick={handleClick}
      title={supported === false ? "Dictado no disponible" : "Dictar pedido"}
      aria-label="Dictar pedido"
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border-2 focus:outline-none focus:ring-2 focus:ring-slate-950 ${
        active
          ? "border-red-700 bg-red-600 text-white"
          : busy
            ? "border-blue-700 bg-blue-600 text-white"
            : "border-slate-300 bg-slate-100 text-slate-950 active:bg-slate-200"
      }`}
    >
      {busy ? (
        <Loader2 size={22} strokeWidth={3} className="animate-spin" />
      ) : active ? (
        <MicOff size={22} strokeWidth={3} />
      ) : (
        <Mic size={22} strokeWidth={3} />
      )}
    </button>
  );
}
