"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff } from "lucide-react";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { SpeechRecognition as NativeSpeech } from "@capacitor-community/speech-recognition";
import api from "@/lib/api";
import { hapticError, hapticLight, hapticSuccess } from "@/lib/haptics";
import {
  COMPLEMENT_MODIFIER_PREFIX,
  VARIANT_MODIFIER_PREFIX,
} from "@/lib/modifiers";
import {
  useTicketStore,
  type CartItem,
  type ModifierSelection,
  type Product,
} from "@/store/ticketStore";

type SpeechRecognition = any;
type Status = "idle" | "listening" | "processing" | "error";

type DictationItem = {
  menuItemId: string;
  quantity: number;
  notes?: string;
  needsReview?: boolean;
  selections?: {
    selectedVariant?: { id: string; name: string; price: number } | null;
    selectedVariants?: { id: string; name: string; price: number }[];
    selectedModifiers?: {
      id: string;
      groupId: string;
      name: string;
      priceAdd: number;
    }[];
    selectedComplements?: { id: string; name: string; price: number }[];
    unitPrice?: number;
  };
  product: Product;
};

export default function VoiceOrderDictation() {
  const [status, setStatus] = useState<Status>("idle");
  const [supported, setSupported] = useState<boolean | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isNative = Capacitor.isNativePlatform();

  const addItemToActive = useTicketStore((s) => s.addItemToActive);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    // En Android (WebView) la Web Speech API no existe; usamos el plugin nativo
    // que delega en el servicio de reconocimiento del sistema. En escritorio/dev
    // caemos al webkitSpeechRecognition del navegador.
    if (isNative) {
      NativeSpeech.available()
        .then(({ available }) => {
          if (!cancelled) setSupported(Boolean(available));
        })
        .catch(() => {
          if (!cancelled) setSupported(false);
        });
      return () => {
        cancelled = true;
      };
    }

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
  }, [isNative]);

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
        const selections = item.selections;
        const selectedVariant = selections?.selectedVariant || null;
        const modifiers: ModifierSelection[] = [
          ...(selections?.selectedModifiers || []).map((modifier) => ({
            id: modifier.id,
            groupId: modifier.groupId,
            name: modifier.name,
            priceAdd: Number(modifier.priceAdd || 0),
          })),
          ...(selections?.selectedVariants || []).map((variant) => ({
            id: `${VARIANT_MODIFIER_PREFIX}${variant.id}`,
            groupId: "__variants",
            name: variant.name,
            priceAdd: Number(variant.price || 0),
          })),
          ...(selections?.selectedComplements || []).map((complement) => ({
            id: `${COMPLEMENT_MODIFIER_PREFIX}${complement.id}`,
            groupId: "__complements",
            name: complement.name,
            priceAdd: Number(complement.price || 0),
          })),
        ];
        const unit = Number(
          selections?.unitPrice ??
            selectedVariant?.price ??
            product.promoPrice ??
            product.price ??
            0,
        );
        const quantity = Math.max(1, Math.min(99, Number(item.quantity || 1)));
        const notes = item.notes?.trim() || undefined;
        const baseName = product.name;

        for (let i = 0; i < quantity; i += 1) {
          const cartItem: CartItem = {
            ...product,
            menuItemId: item.menuItemId,
            quantity: 1,
            subtotal: unit,
            price: unit,
            originalPrice: product.price,
            baseName,
            variantId: selectedVariant?.id ?? null,
            variantName: selectedVariant?.name ?? null,
            name: selectedVariant ? `${baseName} (${selectedVariant.name})` : baseName,
            modifiers,
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

  async function startNativeDictation() {
    try {
      const perm = await NativeSpeech.requestPermissions();
      if (perm.speechRecognition !== "granted") {
        hapticError();
        toast.error("Permiso de microfono denegado");
        return;
      }

      hapticLight();
      setStatus("listening");
      // partialResults:false → la promesa resuelve con el texto final al callar.
      // popup:false para no abrir el diálogo de Google y mantener el flujo del TPV.
      const { matches } = await NativeSpeech.start({
        language: "es-MX",
        maxResults: 1,
        partialResults: false,
        popup: false,
      });
      const text = String(matches?.[0] || "").trim();
      if (text) await sendDictation(text);
      else setStatus("idle");
    } catch (err: any) {
      setStatus("error");
      hapticError();
      toast.error(`Error de dictado: ${err?.message || "desconocido"}`);
      setTimeout(() => setStatus("idle"), 900);
    }
  }

  function handleClick() {
    if (!supported) {
      toast.error("Dictado por voz no disponible en este dispositivo");
      hapticError();
      return;
    }
    if (status === "processing") return;
    if (status === "listening") {
      if (isNative) NativeSpeech.stop().catch(() => {});
      else recognitionRef.current?.stop();
      return;
    }

    if (isNative) {
      startNativeDictation();
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
