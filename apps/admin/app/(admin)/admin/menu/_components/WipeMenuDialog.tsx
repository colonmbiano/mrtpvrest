"use client";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Button, Card, IconBadge, Modal, SectionLabel } from "@/components/ds";

/* Zona de peligro: borrar TODO el menú. Confirmación de alta fricción — el
   usuario debe escribir "BORRAR" (más fuerte que un confirm simple). */
export function WipeMenuDialog({
  open,
  wipeConfirm,
  wiping,
  onOpen,
  onClose,
  onWipeConfirmChange,
  onConfirm,
}: {
  open: boolean;
  wipeConfirm: string;
  wiping: boolean;
  onOpen: () => void;
  onClose: () => void;
  onWipeConfirmChange: (v: string) => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <SectionLabel>Zona de peligro</SectionLabel>
      <Card className="mb-6 p-4 md:p-5" style={{ borderColor: "var(--err)", background: "var(--err-soft)" }}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <IconBadge icon={AlertTriangle} tone="err" size={34} />
            <div>
              <h3 className="font-display text-sm font-extrabold uppercase tracking-wider" style={{ color: "var(--err)" }}>Zona de peligro</h3>
              <p className="mt-1 text-xs text-tx-mut">
                Borra todo el menú del restaurante (platillos, categorías y grupos de variantes). Útil para volver a generarlo con IA desde cero.
              </p>
            </div>
          </div>
          <button type="button" onClick={onOpen}
            className="flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-ds-md px-4 text-xs font-bold transition-all"
            style={{ border: "1px solid var(--err)", color: "var(--err)" }}>
            <Trash2 size={14} /> Borrar todo el menú
          </button>
        </div>
      </Card>

      <Modal open={open} onClose={onClose} size="sm">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <IconBadge icon={AlertTriangle} tone="err" size={40} />
            <h2 className="font-display text-lg font-extrabold sm:text-xl" style={{ color: "var(--err)" }}>Borrar todo el menú</h2>
          </div>
          <p className="text-sm text-tx-mut">
            Esta acción <strong className="text-tx">no se puede deshacer</strong>. Se eliminarán todos los platillos, categorías y grupos de variantes de este restaurante, junto con sus referencias en órdenes pasadas.
          </p>
          <p className="text-xs text-tx-mut">Escribe <strong style={{ color: "var(--err)" }}>BORRAR</strong> para confirmar:</p>
          <input
            autoFocus
            value={wipeConfirm}
            onChange={e => onWipeConfirmChange(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && wipeConfirm === "BORRAR") onConfirm(); if (e.key === "Escape") onClose(); }}
            placeholder="BORRAR"
            className="min-h-11 w-full rounded-ds-md px-4 text-sm text-tx outline-none"
            style={{ background: "var(--surf-2)", border: "1.5px solid var(--bd-1)" }}
          />
          <div className="mt-2 flex gap-3">
            <Button variant="secondary" full onClick={onClose}>Cancelar</Button>
            <Button variant="danger" full onClick={onConfirm} disabled={wipeConfirm !== "BORRAR" || wiping}>
              {wiping ? "Borrando…" : "Borrar todo"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
