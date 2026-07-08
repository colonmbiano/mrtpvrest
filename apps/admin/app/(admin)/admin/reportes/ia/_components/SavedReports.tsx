"use client";
import { Bookmark, Plus, X } from "lucide-react";
import { Button } from "@/components/ds";
import type { SavedReport } from "./types";

/* Reportes guardados: mezcla los del backend (GET /api/reports/saved — hoy stub)
   con los persistidos en localStorage ("ia-saved-reports"). Solo los locales
   (id "local-...") se pueden eliminar. El tag usa colores que vienen en el dato
   (tagColor/tagBg guardan referencias var(--...) del token). */
export function SavedReports({
  reports,
  onNew,
  onDelete,
}: {
  reports: SavedReport[];
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-extrabold text-tx-hi">Reportes guardados</h2>
          <p className="mt-0.5 text-xs text-tx-mut">Reportes recurrentes y favoritos</p>
        </div>
        <Button variant="secondary" size="sm" icon={Plus} onClick={onNew}>
          Nuevo reporte
        </Button>
      </div>

      {reports.length === 0 ? (
        <div
          className="flex flex-col items-center gap-2 rounded-ds-lg px-5 py-7 text-center text-[13px] text-tx-mut"
          style={{ border: "1px dashed var(--bd-1)" }}
        >
          <Bookmark size={22} className="text-tx-dim" />
          Aún no has guardado reportes. Usa el botón de guardar del reporte para guardar uno.
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-2.5">
          {reports.map((s) => {
            const isLocal = String(s.id ?? "").startsWith("local-");
            return (
              <div
                key={s.id ?? s.title}
                className="relative rounded-ds-lg px-4 py-3.5"
                style={{
                  background: s.active ? "linear-gradient(90deg,var(--accent-soft),transparent)" : "var(--surf-1)",
                  border: `1px solid ${s.active ? "var(--brand-primary)" : "var(--bd-1)"}`,
                }}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[13px] font-semibold text-tx">{s.title}</span>
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-[.1em]"
                    style={{ color: s.tagColor, background: s.tagBg }}
                  >
                    {s.tag}
                  </span>
                </div>
                <div className="text-[11px] text-tx-mut">{s.sub}</div>
                {isLocal && (
                  <button
                    type="button"
                    onClick={() => onDelete(String(s.id))}
                    className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-md text-tx-dim transition-colors hover:text-tx"
                    title="Eliminar reporte guardado"
                    aria-label="Eliminar"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
