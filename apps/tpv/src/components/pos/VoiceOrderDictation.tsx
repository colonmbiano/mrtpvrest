"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff } from "lucide-react";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { SpeechRecognition as NativeSpeech } from "@capacitor-community/speech-recognition";
import api from "@/lib/api";
import { hapticError, hapticLight, hapticSuccess } from "@/lib/haptics";
import { useTicketStore, type CartItem, type Product } from "@/store/ticketStore";
import VoiceDictationReviewSheet, {
  type VoiceDictationItem,
  type VoiceReviewHandle,
} from "./VoiceDictationReviewSheet";

type SpeechRecognition = any;
type Status = "idle" | "listening" | "processing" | "error";

// Mismo cache que el catálogo del POS (app/pos/menu/page.tsx). Lo leemos para
// que la hoja de revisión pueda buscar productos y agregarlos a mano.
const CATALOG_CACHE_KEY = "tpv-catalog-cache-v1";

function readCatalogProducts(): Product[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CATALOG_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.products) ? (parsed.products as Product[]) : [];
  } catch {
    return [];
  }
}

export default function VoiceOrderDictation() {
  const [status, setStatus] = useState<Status>("idle");
  const [supported, setSupported] = useState<boolean | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isNative = Capacitor.isNativePlatform();

  const addItemToActive = useTicketStore((s) => s.addItemToActive);

  // Estado de la hoja de revisión. El dictado YA NO entra directo al ticket:
  // primero el cajero revisa/corrige en VoiceDictationReviewSheet y confirma.
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewItems, setReviewItems] = useState<VoiceDictationItem[]>([]);
  const [reviewUnresolved, setReviewUnresolved] = useState<string[]>([]);
  const [reviewTranscript, setReviewTranscript] = useState("");
  const [catalog, setCatalog] = useState<Product[]>([]);
  const sheetRef = useRef<VoiceReviewHandle>(null);

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

  function closeReview() {
    setReviewOpen(false);
    setReviewItems([]);
    setReviewUnresolved([]);
    setReviewTranscript("");
  }

  function handleConfirm(cartItems: CartItem[]) {
    cartItems.forEach((item) => addItemToActive(item));
    hapticSuccess();
    const n = cartItems.length;
    toast.success(`${n} producto${n === 1 ? "" : "s"} agregado${n === 1 ? "" : "s"} al ticket`);
    closeReview();
  }

  // append=true cuando viene de "Dictar más" dentro de la hoja: concatena los
  // nuevos items en vez de reemplazar la revisión en curso.
  async function sendDictation(prompt: string, append: boolean) {
    // En modo "Dictar más": primero probamos si es un COMANDO sobre la revisión
    // en curso (quita X, otra, que sea grande, sin cebolla…). Si la hoja lo
    // maneja, no hace falta llamar al backend a agregar.
    if (append && sheetRef.current?.applyVoiceCommand(prompt)) {
      hapticSuccess();
      setStatus("idle");
      return;
    }

    setStatus("processing");
    const toastId = toast.loading(`Escuchado: "${prompt}"`);
    try {
      const { data } = await api.post("/api/ai/order-dictation", { prompt });
      const items: VoiceDictationItem[] = Array.isArray(data?.items) ? data.items : [];
      const unresolved: string[] = Array.isArray(data?.unresolved) ? data.unresolved : [];

      if (items.length === 0) {
        hapticError();
        if (append) {
          toast.info("No agregué nada nuevo", { id: toastId });
        } else {
          toast.error(data?.message || "No encontré productos del menú", { id: toastId });
        }
        return;
      }

      toast.dismiss(toastId);
      if (append) {
        setReviewItems((prev) => [...prev, ...items]);
        setReviewUnresolved((prev) => [...prev, ...unresolved]);
      } else {
        setCatalog(readCatalogProducts());
        setReviewItems(items);
        setReviewUnresolved(unresolved);
        setReviewTranscript(prompt);
        setReviewOpen(true);
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

  async function startNativeDictation(append: boolean) {
    try {
      const perm = await NativeSpeech.requestPermissions();
      if (perm.speechRecognition !== "granted") {
        hapticError();
        toast.error("Permiso de micrófono denegado");
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
      if (text) await sendDictation(text, append);
      else setStatus("idle");
    } catch (err: any) {
      setStatus("error");
      hapticError();
      toast.error(`Error de dictado: ${err?.message || "desconocido"}`);
      setTimeout(() => setStatus("idle"), 900);
    }
  }

  function startWebRecognition(append: boolean) {
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
          ? "Permiso de micrófono denegado"
          : `Error de dictado: ${ev?.error || "desconocido"}`,
      );
      setTimeout(() => setStatus("idle"), 900);
    };
    rec.onresult = (ev: any) => {
      const text = ev?.results?.[0]?.[0]?.transcript || "";
      if (text.trim()) sendDictation(text.trim(), append);
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

  function startListening(append: boolean) {
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
    if (isNative) startNativeDictation(append);
    else startWebRecognition(append);
  }

  const active = status === "listening";
  const busy = status === "processing";

  return (
    <>
      <button
        type="button"
        onClick={() => startListening(false)}
        title={supported === false ? "Dictado no disponible" : "Dictar pedido"}
        aria-label="Dictar pedido"
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border-2 focus:outline-none focus:ring-2 focus:ring-iris-500 ${
          active
            ? "border-danger bg-danger text-white"
            : busy
              ? "border-iris-600 bg-iris-500 text-iris-fg"
              : "border-bd bg-surf-2 text-tx-pri active:bg-surf-3"
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

      {reviewOpen && (
        <VoiceDictationReviewSheet
          ref={sheetRef}
          transcript={reviewTranscript}
          items={reviewItems}
          unresolved={reviewUnresolved}
          catalog={catalog}
          listening={active}
          onConfirm={handleConfirm}
          onClose={closeReview}
          onDictateMore={() => startListening(true)}
        />
      )}
    </>
  );
}
