"use client";
import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import api from "@/lib/api";
import { Card, Button, Field, Select, Textarea, useToast, useConfirm } from "@/components/ds";
import { SEGMENT_LABELS } from "./types";

export default function CampaignsTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [segments, setSegments] = useState<string[]>(["ALL"]);
  const [segment, setSegment] = useState("ALL");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/api/whatsapp/marketing/segments");
        if (Array.isArray(data.segments) && data.segments.length) setSegments(data.segments);
      } catch { /* usa default */ }
    })();
  }, []);

  const send = async () => {
    setSending(true);
    try {
      const { data } = await api.post("/api/whatsapp/marketing/campaigns", { segment, message });
      toast.success(`Enviado a ${data.sent}/${data.total} contactos${data.failed ? ` (${data.failed} fallaron)` : ""}`);
      setMessage("");
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Error al enviar la campaña");
    } finally {
      setSending(false);
    }
  };

  const onSend = async () => {
    if (!message.trim()) return;
    const ok = await confirm({
      title: "¿Enviar campaña?",
      body: `Se enviará el mensaje por WhatsApp a los clientes del segmento «${SEGMENT_LABELS[segment] || segment}». Esta acción no se puede deshacer.`,
      confirmLabel: "Sí, enviar",
    });
    if (ok) send();
  };

  return (
    <div className="max-w-2xl space-y-5">
      <Card className="space-y-4 p-5">
        <Field label="Segmento de clientes" className="mb-0">
          <Select value={segment} onChange={(e) => setSegment(e.target.value)}>
            {segments.map((s) => (
              <option key={s} value={s}>{SEGMENT_LABELS[s] || s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Mensaje" className="mb-0">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            placeholder="Ej: ¡Hola {nombre}! Hoy 2x1 en hamburguesas hasta las 8pm. Escríbenos para pedir."
          />
          <p className="mt-1.5 text-[10px] text-tx-dim">
            Usa <code className="text-tx-mut">{"{nombre}"}</code> y se reemplaza por el nombre de cada cliente.
          </p>
        </Field>
        <Button icon={Send} onClick={onSend} disabled={sending || !message.trim()} loading={sending}>
          {sending ? "Enviando…" : "Enviar campaña"}
        </Button>
      </Card>
    </div>
  );
}
