"use client";
import { Button } from "@/components/ds";
import type { SuggestedAction } from "./types";

/* Acciones sugeridas (GET /api/dashboard/suggested-actions).
   El CTA manda el prompt de la acción al chat de Mesero. */
export function SuggestedActions({
  actions,
  loading,
  onAct,
}: {
  actions: SuggestedAction[];
  loading: boolean;
  onAct: (prompt: string) => void;
}) {
  if (actions.length === 0) {
    return (
      <div
        className="rounded-ds-md px-3.5 py-5 text-center text-xs text-tx-mut"
        style={{ background: "var(--surf-2)", border: "1px dashed var(--bd-1)" }}
      >
        {loading
          ? "Analizando señales del periodo…"
          : "Sin acciones automáticas para este periodo. Cuando haya caídas de ventas, productos top o stock bajo, aparecerán aquí."}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {actions.map((a) => (
        <div
          key={a.n}
          className="flex items-start gap-2.5 rounded-ds-md px-3.5 py-3"
          style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
        >
          <span
            className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md font-display text-[11px] font-bold text-primary"
            style={{ background: "var(--accent-soft)" }}
          >
            {a.n}
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 text-[13px] font-semibold text-tx">{a.title}</div>
            <div className="text-[11px] leading-relaxed text-tx-mut">{a.sub}</div>
            <Button size="sm" className="mt-2" onClick={() => onAct(a.prompt)}>
              {a.cta}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
