"use client";
import BaseModal from "@/components/ui/BaseModal";

export type ConfirmTone = "neutral" | "danger" | "warning";

export type ConfirmConfig = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  onConfirm: () => void | Promise<void>;
};

const TONE_BG: Record<ConfirmTone, string> = {
  neutral: "var(--brand)",
  danger:  "var(--danger)",
  warning: "var(--warning)",
};

export default function ConfirmModal({
  open,
  config,
  onClose,
}: {
  open: boolean;
  config: ConfirmConfig | null;
  onClose: () => void;
}) {
  if (!config) return null;
  const tone = config.tone ?? "neutral";

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      title={config.title}
      description={config.message}
      size="sm"
      footer={
        <>
          <button
            onClick={onClose}
            className="h-10 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
            style={{
              background: "transparent",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-strong)",
            }}
          >
            {config.cancelLabel ?? "Cancelar"}
          </button>
          <button
            onClick={async () => {
              await config.onConfirm();
              onClose();
            }}
            className="h-10 px-5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all hover:brightness-110"
            style={{ background: TONE_BG[tone], color: "var(--brand-fg)" }}
          >
            {config.confirmLabel ?? "Confirmar"}
          </button>
        </>
      }
    >
      <span />
    </BaseModal>
  );
}
