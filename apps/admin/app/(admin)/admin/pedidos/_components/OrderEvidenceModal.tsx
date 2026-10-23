"use client";

import { useState, useEffect } from "react";
import { AlertCircle, Calendar, FileImage, MessageSquare, X } from "lucide-react";
import { Modal, Button, Skeleton } from "@/components/ds";
import { formatMoney } from "@/lib/format";
import api from "@/lib/api";
import type { Order } from "./orders";

interface DeliveryIncident {
  id: string;
  type: string;
  reason: string;
  notes: string;
  callAttempts: number;
  occurredAt: string;
  loggedAt: string;
  photoMimeType?: string;
  photoBytes?: number;
}

interface DeliveryEvidence {
  id: string;
  photoBase64?: string;
  signatureBase64?: string;
  deliveredAt: string;
  recordedAt: string;
}

export default function OrderEvidenceModal({
  open,
  order,
  onClose,
}: {
  open: boolean;
  order: Order | null;
  onClose: () => void;
}) {
  const [evidence, setEvidence] = useState<DeliveryEvidence | null>(null);
  const [incidents, setIncidents] = useState<DeliveryIncident[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !order?.id) return;
    setLoading(true);
    Promise.all([
      api.get<DeliveryEvidence>(`/api/delivery/orders/${order.id}/evidence`).catch(() => null),
      api.get<{ incidents: DeliveryIncident[] }>(`/api/delivery/orders/${order.id}/incidents`).catch(() => null),
    ])
      .then(([evidenceRes, incidentsRes]) => {
        if (evidenceRes?.data) setEvidence(evidenceRes.data);
        if (incidentsRes?.data?.incidents) setIncidents(incidentsRes.data.incidents);
      })
      .finally(() => setLoading(false));
  }, [open, order?.id]);

  if (!order) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Evidencia de Entrega"
      subtitle={`${order.orderNumber} · ${formatMoney(order.total ?? 0)}`}
      className="max-w-2xl"
    >
      <div className="space-y-6">
        {loading ? (
          <>
            <Skeleton className="h-48 rounded-ds-lg" />
            <Skeleton className="h-32 rounded-ds-lg" />
          </>
        ) : (
          <>
            {/* Foto de entrega */}
            {evidence?.photoBase64 ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">
                  <FileImage size={13} /> Foto de entrega
                </div>
                <img
                  src={evidence.photoBase64}
                  alt="Evidencia de entrega"
                  className="w-full rounded-ds-lg border border-bd-1 max-h-96 object-cover"
                />
                {evidence.deliveredAt && (
                  <div className="text-[11px] text-tx-mut">
                    {new Date(evidence.deliveredAt).toLocaleString("es-MX", {
                      timeZone: "America/Mexico_City",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div
                className="rounded-ds-lg border border-bd-1 p-6 text-center text-tx-mut"
                style={{ background: "var(--surf-2)" }}
              >
                <FileImage size={20} className="mx-auto mb-2 opacity-50" />
                Sin foto de entrega
              </div>
            )}

            {/* Firma digital */}
            {evidence?.signatureBase64 ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">
                  <MessageSquare size={13} /> Firma digital
                </div>
                <img
                  src={evidence.signatureBase64}
                  alt="Firma digital"
                  className="w-full rounded-ds-lg border border-bd-1 max-h-48 object-cover"
                  style={{ background: "#fff" }}
                />
              </div>
            ) : (
              <div
                className="rounded-ds-lg border border-bd-1 p-6 text-center text-tx-mut"
                style={{ background: "var(--surf-2)" }}
              >
                <MessageSquare size={20} className="mx-auto mb-2 opacity-50" />
                Sin firma digital
              </div>
            )}

            {/* Historial de incidencias */}
            {incidents.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">
                  <AlertCircle size={13} /> Historial de incidencias ({incidents.length})
                </div>
                <div className="space-y-2">
                  {incidents.map((incident) => (
                    <div
                      key={incident.id}
                      className="rounded-ds-md border border-bd-1 p-3"
                      style={{ background: "var(--warn-soft)", borderColor: "var(--warn)" }}
                    >
                      <div className="flex items-start gap-2 mb-1.5">
                        <AlertCircle size={14} style={{ color: "var(--warn)", marginTop: 2 }} className="shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-xs text-tx-hi">{incident.type}</div>
                          <div className="text-[11px] text-tx-mut mt-0.5">{incident.reason}</div>
                        </div>
                      </div>
                      {incident.notes && (
                        <div className="text-[11px] text-tx ml-5 mb-1.5 p-2 rounded-ds-sm" style={{ background: "rgba(0,0,0,0.05)" }}>
                          {incident.notes}
                        </div>
                      )}
                      <div className="flex items-center justify-between text-[10px] text-tx-mut ml-5">
                        <span>{incident.callAttempts > 0 ? `${incident.callAttempts} llamada${incident.callAttempts > 1 ? "s" : ""}` : ""}</span>
                        <span className="flex items-center gap-1">
                          <Calendar size={11} />
                          {new Date(incident.loggedAt).toLocaleString("es-MX", {
                            timeZone: "America/Mexico_City",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div
                className="rounded-ds-lg border border-bd-1 p-4 text-center text-tx-mut text-sm"
                style={{ background: "var(--surf-2)" }}
              >
                Sin incidencias registradas
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" icon={X} onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </Modal>
  );
}
