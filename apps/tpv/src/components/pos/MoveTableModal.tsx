"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRightLeft, X } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { reassignOrderTable } from "@/lib/order-repository";

interface DestinationTable {
  id: string;
  name: string;
  status: string;
  zone?: { name: string } | null;
  activeOrder?: { id: string } | null;
}

interface MoveTableModalProps {
  source: { id: string; orderNumber: string; table: { id: string; name: string } };
  onClose: () => void;
  onSuccess: (tableId: string) => void;
}

export default function MoveTableModal({ source, onClose, onSuccess }: MoveTableModalProps) {
  const [tables, setTables] = useState<DestinationTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [revision, setRevision] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const submittingRef = useRef(false);
  const selected = tables.find(table => table.id === selectedId);
  const available = (table: DestinationTable) => table.status === "AVAILABLE" && !table.activeOrder;

  useEffect(() => {
    let cancelled = false;
    async function loadTables() {
      setLoading(true);
      setError("");
      setSelectedId("");
      try {
        const { data } = await api.get<DestinationTable[]>("/api/tables");
        if (!Array.isArray(data)) throw new Error("Respuesta de mesas inválida");
        if (!cancelled) setTables(data.filter(table => table.id !== source.table.id));
      } catch {
        if (!cancelled) setError("No pudimos consultar las mesas. Revisa tu conexión e inténtalo de nuevo.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadTables();
    return () => { cancelled = true; };
  }, [source.table.id, revision]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    const previousModal = document.body.dataset.modalOpen;
    document.body.style.overflow = "hidden";
    document.body.dataset.modalOpen = "true";
    dialogRef.current?.focus();
    const close = () => { if (!submittingRef.current) onClose(); };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key !== "Tab") return;
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [tabindex="0"]',
      );
      if (!controls?.length) return;
      const first = controls[0]!;
      const last = controls[controls.length - 1]!;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
        event.preventDefault(); first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("hardware-back", close);
    return () => {
      document.body.style.overflow = overflow;
      if (previousModal === undefined) delete document.body.dataset.modalOpen;
      else document.body.dataset.modalOpen = previousModal;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("hardware-back", close);
      previousFocus?.focus();
    };
  }, [onClose]);

  async function confirmMove() {
    if (!selected || !available(selected) || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      await reassignOrderTable(source.id, source.table.id, selected.id);
    } catch (err) {
      const failure = err as { response?: { status?: number; data?: { error?: string } }; message?: string };
      setError(failure.response?.data?.error || failure.message || "No se pudo cambiar la cuenta de mesa");
      // Un destino puede haberse ocupado después de abrir el selector.
      if (failure.response?.status === 409) {
        setTables(current => current.map(table => table.id === selected.id ? { ...table, status: "OCCUPIED" } : table));
        setSelectedId("");
      }
      submittingRef.current = false;
      setSubmitting(false);
      return;
    }
    submittingRef.current = false;
    setSubmitting(false);
    toast.success(`Cuenta trasladada de ${source.table.name} a ${selected.name}`);
    onSuccess(selected.id);
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="move-table-title"
        aria-describedby="move-table-description" tabIndex={-1}
        className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/10 bg-[var(--bg)] text-white shadow-2xl outline-none">
        <header className="flex items-center gap-3 border-b border-white/10 p-5">
          <ArrowRightLeft className="shrink-0 text-[var(--brand)]" size={24} />
          <div className="min-w-0 flex-1">
            <h2 id="move-table-title" className="text-lg font-bold">Cambiar mesa</h2>
            <p className="text-sm text-white/60">{source.table.name} · #{source.orderNumber}</p>
          </div>
          <button type="button" aria-label="Cerrar" disabled={submitting} onClick={onClose}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-white/5 disabled:opacity-40">
            <X size={20} />
          </button>
        </header>
        <div className="overflow-y-auto p-5">
          <p id="move-table-description" className="mb-4 text-sm text-white/65">
            Elige una mesa libre. La cuenta conserva sus productos, rondas y total.
          </p>
          {error && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
          {loading ? <p role="status" className="py-6 text-center text-white/60">Consultando mesas…</p> : (
            <div role="group" aria-label="Mesa destino" className="grid grid-cols-2 gap-3">
              {tables.map(table => (
                <button key={table.id} type="button" disabled={!available(table) || submitting}
                  aria-pressed={selectedId === table.id} onClick={() => setSelectedId(table.id)}
                  className={`min-h-20 rounded-2xl border p-3 text-left disabled:opacity-40 ${selectedId === table.id
                    ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "border-white/10 bg-white/5"}`}>
                  <span className="block font-semibold">{table.name}</span>
                  <span className="block text-xs text-white/60">
                    {table.zone?.name ? `${table.zone.name} · ` : ""}
                    {available(table) ? "Libre" : table.status === "DIRTY" ? "Sucia" : "Ocupada"}
                  </span>
                </button>
              ))}
            </div>
          )}
          {!loading && !tables.some(available) && <p className="mt-4 text-sm text-white/60">No hay mesas libres para cambiar la cuenta.</p>}
          {!loading && <button type="button" disabled={submitting} onClick={() => setRevision(value => value + 1)}
            className="mt-3 min-h-11 text-sm text-[var(--brand)]">Actualizar mesas</button>}
        </div>
        <footer className="flex flex-col gap-2 border-t border-white/10 p-5">
          <button type="button" disabled={!selected || loading || submitting} onClick={confirmMove}
            className="min-h-14 rounded-2xl bg-[var(--brand)] px-4 font-bold text-[var(--brand-fg)] disabled:opacity-40">
            {submitting ? "Cambiando mesa…" : selected ? `Mover a ${selected.name}` : "Selecciona una mesa"}
          </button>
          <button type="button" disabled={submitting} onClick={onClose} className="min-h-11 text-sm text-white/60">Cancelar</button>
        </footer>
      </div>
    </div>
  );
}
