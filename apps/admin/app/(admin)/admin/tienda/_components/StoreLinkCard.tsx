"use client";
import { Power, Clock, Link2, Copy, Check, ExternalLink } from "lucide-react";
import { Card, SectionHead, StatTile, Button } from "@/components/ds";

/* Card destacada de la tienda online: URL + QR + estado. */
export function StoreLinkCard({
  storeUrl,
  isOpen,
  estimatedDelivery,
  copied,
  onCopy,
}: {
  storeUrl: string;
  isOpen: boolean;
  estimatedDelivery: number;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <Card className="mb-4 p-5 md:p-6">
      <SectionHead title="Tu tienda online" />
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(storeUrl)}`}
          alt="QR de la tienda"
          width={130}
          height={130}
          className="shrink-0 rounded-2xl bg-white p-2"
        />
        <div className="w-full min-w-0 flex-1">
          <div className="mb-3 flex items-center justify-between gap-3 rounded-xl px-3 py-3" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
            <Link2 size={15} className="shrink-0 text-tx-mut" />
            <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-primary">{storeUrl}</span>
          </div>
          {/* 2 stats: estado y tiempo estimado */}
          <div className="mb-3 grid grid-cols-2 gap-3">
            <StatTile
              icon={Power}
              value={<span style={{ color: isOpen ? "var(--ok)" : "var(--err)" }}>{isOpen ? "Abierta" : "Cerrada"}</span>}
              label={isOpen ? "Recibiendo pedidos" : "Pedidos bloqueados"}
            />
            <StatTile icon={Clock} value={`${estimatedDelivery} min`} label="Entrega estimada" />
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" icon={copied ? Check : Copy} onClick={onCopy}>{copied ? "¡Copiado!" : "Copiar enlace"}</Button>
            <Button icon={ExternalLink} href={storeUrl}>Ver tienda</Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
