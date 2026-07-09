"use client";
import { CalendarDays, Link2, Pencil, Trash2 } from "lucide-react";
import { Card, Pill, Toggle } from "@/components/ds";
import { type Banner, LINK_TYPES, scheduleLabel } from "./types";

export function BannerCard({
  banner,
  onToggle,
  onEdit,
  onDelete,
}: {
  banner: Banner;
  onToggle: (banner: Banner) => void;
  onEdit: (banner: Banner) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Card className="overflow-hidden" style={banner.isActive ? undefined : { opacity: 0.6 }}>
      <div className="flex flex-col sm:flex-row">
        {/* preview */}
        <div className="relative h-36 w-full shrink-0 sm:h-auto sm:w-48" style={{ background: "var(--surf-2)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={banner.imageUrl} alt={banner.title || "banner"} className="h-full w-full object-cover" />
          <div className="absolute left-2 top-2">
            <Pill tone={banner.isActive ? "ok" : "neutral"} live={banner.isActive}>
              {banner.isActive ? "Activo" : "Borrador"}
            </Pill>
          </div>
        </div>

        {/* info */}
        <div className="flex flex-1 flex-col justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="font-display text-sm font-extrabold text-tx-hi">{banner.title || "Sin título"}</div>
            {banner.description && <div className="mt-0.5 text-xs text-tx-mut">{banner.description}</div>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-primary"
                style={{ background: "var(--accent-soft)" }}
              >
                <CalendarDays size={12} /> {scheduleLabel(banner)}
              </span>
              {banner.linkType && banner.linkType !== "NONE" && (
                <span className="inline-flex items-center gap-1 text-[11px] text-tx-mut">
                  <Link2 size={12} />
                  {LINK_TYPES.find((t) => t.value === banner.linkType)?.label}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div
              className="flex items-center gap-2 rounded-ds-md px-3 py-1.5"
              style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
            >
              <span className="text-[11px] font-semibold text-tx-mut">
                {banner.isActive ? "Activo" : "Borrador"}
              </span>
              <Toggle
                checked={banner.isActive}
                onChange={() => onToggle(banner)}
                label={banner.isActive ? "Desactivar banner" : "Activar banner"}
              />
            </div>
            <button
              type="button"
              onClick={() => onEdit(banner)}
              aria-label="Editar"
              className="grid h-11 w-11 place-items-center rounded-ds-md text-tx-mid"
              style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
            >
              <Pencil size={16} />
            </button>
            <button
              type="button"
              onClick={() => onDelete(banner.id)}
              aria-label="Eliminar"
              className="grid h-11 w-11 place-items-center rounded-ds-md"
              style={{ background: "var(--err-soft)", color: "var(--err)" }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
