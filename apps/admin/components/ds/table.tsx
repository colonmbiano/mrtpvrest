"use client";
import type { CSSProperties, ReactNode } from "react";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { Card } from "./card";
import { EmptyState } from "./states";

export type Col<T> = {
  key: string;
  header: ReactNode;
  render?: (row: T, index: number) => ReactNode;
  align?: "left" | "right" | "center";
  width?: string;
  mono?: boolean;
  /** Oculta la columna en pantallas < md. */
  hideBelowMd?: boolean;
};

/**
 * Tabla de datos estándar del panel: header sticky opcional, filas
 * clicables, paginación y estados loading/empty integrados.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  empty,
  onRowClick,
  pagination,
  stickyHeader = false,
  footer,
}: {
  columns: Col<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string | number;
  loading?: boolean;
  empty?: { icon?: LucideIcon; title: string; hint?: string; cta?: ReactNode };
  onRowClick?: (row: T) => void;
  pagination?: { page: number; pageCount: number; onPage: (next: number) => void; total?: number };
  stickyHeader?: boolean;
  footer?: ReactNode;
}) {
  const alignCls = (a?: "left" | "right" | "center") =>
    a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

  if (loading) {
    return (
      <Card className="overflow-hidden">
        <div className="p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="mb-2 h-11 animate-pulse rounded-ds-sm bg-surf-2" />
          ))}
        </div>
      </Card>
    );
  }

  if (!rows.length && empty) {
    return <EmptyState icon={empty.icon} title={empty.title} hint={empty.hint} action={empty.cta} />;
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead className={stickyHeader ? "sticky top-0 z-10" : ""}>
            <tr style={{ background: "var(--surf-2)" }}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`whitespace-nowrap px-4 py-3 font-mono text-[10px] font-semibold uppercase tracking-[.1em] text-tx-mut ${alignCls(col.align)} ${col.hideBelowMd ? "hidden md:table-cell" : ""}`}
                  style={{ width: col.width, borderBottom: "1px solid var(--bd-1)" }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={rowKey(row, index)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={onRowClick ? "cursor-pointer transition-colors hover:bg-surf-2" : ""}
                style={{ borderBottom: index < rows.length - 1 ? "1px solid var(--bd-1)" : "none" }}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 text-tx ${alignCls(col.align)} ${col.mono ? "font-mono" : ""} ${col.hideBelowMd ? "hidden md:table-cell" : ""}`}
                  >
                    {col.render ? col.render(row, index) : String((row as Record<string, unknown>)[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer}
      {pagination && pagination.pageCount > 1 && (
        <div className="px-4 pb-3">
          <TablePagination {...pagination} />
        </div>
      )}
    </Card>
  );
}

export function TablePagination({
  page,
  pageCount,
  onPage,
  total,
}: {
  page: number;
  pageCount: number;
  onPage: (next: number) => void;
  total?: number;
}) {
  const canPrev = page > 1;
  const canNext = page < pageCount;
  const btn = "grid h-9 w-9 place-items-center rounded-xl border text-tx-mid transition-colors disabled:opacity-40";
  const btnStyle: CSSProperties = { borderColor: "var(--bd-1)", background: "var(--surf-1)" };
  return (
    <div className="flex items-center justify-between gap-3 px-1 pt-3">
      <span className="text-[12px] text-tx-mut">
        {total != null ? `${total} resultados · ` : ""}Página {page} de {Math.max(1, pageCount)}
      </span>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} style={btnStyle} disabled={!canPrev} onClick={() => canPrev && onPage(page - 1)} aria-label="Página anterior">
          <ChevronLeft size={16} />
        </button>
        <button type="button" className={btn} style={btnStyle} disabled={!canNext} onClick={() => canNext && onPage(page + 1)} aria-label="Página siguiente">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
