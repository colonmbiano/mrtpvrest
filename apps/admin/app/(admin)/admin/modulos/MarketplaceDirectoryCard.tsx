"use client";

import { useEffect, useState } from "react";
import { Store } from "lucide-react";
import api from "@/lib/api";
import { Button, Card, Pill, SectionLabel, useToast, type Tone } from "@/components/ds";

// Solicitud para aparecer en el directorio del marketplace. El módulo se activa
// arriba (Módulos); la plataforma revisa la solicitud y solo los comercios
// aprobados se publican.
type MembershipStatus = "NONE" | "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";

type MembershipInfo = {
  moduleEnabled: boolean;
  membership: { status: MembershipStatus; reviewNote: string | null };
};

const STATE: Record<MembershipStatus, { pill?: { label: string; tone: Tone }; text: string }> = {
  NONE: { text: "Pide a la plataforma que publique tu comercio en el directorio del marketplace." },
  PENDING: { pill: { label: "En revisión", tone: "warn" }, text: "La plataforma está revisando tu comercio." },
  APPROVED: { pill: { label: "Publicado", tone: "ok" }, text: "Tu comercio aparece en el directorio del marketplace." },
  REJECTED: { pill: { label: "Rechazado", tone: "err" }, text: "Corrige lo que te indicaron y vuelve a solicitarlo." },
  SUSPENDED: { pill: { label: "Suspendido", tone: "err" }, text: "La plataforma suspendió tu comercio en el directorio. Contacta a soporte." },
};

export default function MarketplaceDirectoryCard({ marketplaceActive }: { marketplaceActive: boolean }) {
  const [info, setInfo] = useState<MembershipInfo | null>(null);
  const [requesting, setRequesting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    api.get("/api/modules/marketplace/membership")
      .then(({ data }) => { if (!cancelled) setInfo(data); })
      .catch(() => { if (!cancelled) setInfo(null); });
    return () => { cancelled = true; };
    // El estado del módulo cambia desde el toggle de arriba: se vuelve a leer.
  }, [marketplaceActive]);

  async function requestListing() {
    if (requesting) return;
    setRequesting(true);
    try {
      const { data } = await api.post("/api/modules/marketplace/membership");
      setInfo((prev) => ({ moduleEnabled: true, membership: data.membership ?? prev?.membership }));
      toast.success("Solicitud enviada. La plataforma revisará tu comercio.");
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "No se pudo enviar la solicitud";
      toast.error(msg);
    } finally {
      setRequesting(false);
    }
  }

  if (!info) return null;
  const status = info.membership?.status ?? "NONE";
  const state = STATE[status] ?? STATE.NONE;
  const canRequest = info.moduleEnabled && (status === "NONE" || status === "REJECTED");

  return (
    <>
      <SectionLabel>Directorio del marketplace</SectionLabel>
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <Store size={20} className="mt-0.5 shrink-0 text-tx-mut" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-bold">Aparecer en el marketplace</span>
              {state.pill && <Pill tone={state.pill.tone}>{state.pill.label}</Pill>}
            </div>
            <p className="mt-1 text-[12px] text-tx-mut">
              {info.moduleEnabled ? state.text : "Activa el módulo Marketplace para pedir aparecer en el directorio."}
            </p>
            {info.membership?.reviewNote && (status === "REJECTED" || status === "SUSPENDED") && (
              <p className="mt-1 text-[12px] text-tx-mid">Nota de la plataforma: {info.membership.reviewNote}</p>
            )}
            {canRequest && (
              <div className="mt-3">
                <Button size="sm" onClick={requestListing} loading={requesting} disabled={requesting}>
                  {status === "REJECTED" ? "Volver a solicitar" : "Solicitar aparecer"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </Card>
    </>
  );
}
