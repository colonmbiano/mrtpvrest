"use client";

/**
 * SeatTabs — barra de pestañas por comensal en el POS DINE_IN.
 *
 * Solo se muestra cuando el ticket activo es DINE_IN y tiene
 * `numberOfGuests` >= 2. Cada tab corresponde a un seat (1..N) y un tab
 * extra "Compartido" para items que cubren a toda la mesa
 * (entradas, postre común). Tap cambia `activeSeat` en el ticket
 * store, que es lo que el `addItemToActive` usa para etiquetar items
 * nuevos con `seatNumber`.
 *
 * El conteo a la derecha de cada tab muestra cuántos items lleva ese
 * comensal (por unidades, no por líneas) — refuerzo visual para no
 * cargar todo a un solo seat por accidente.
 */

import { Users, Share2 } from "lucide-react";
import { useTicketStore, type CartItem } from "@/store/ticketStore";

function unitsForSeat(items: CartItem[], seat: number | null): number {
  return items
    .filter((it) => (it.seatNumber ?? null) === seat)
    .reduce((s, it) => s + it.quantity, 0);
}

export default function SeatTabs() {
  const { getActiveTicket, updateTicket } = useTicketStore();
  const ticket = getActiveTicket();

  if (ticket.type !== "DINE_IN") return null;
  const total = ticket.numberOfGuests ?? 0;
  if (total < 2) return null;

  const active = ticket.activeSeat ?? null;
  const sharedUnits = unitsForSeat(ticket.items, null);

  const seats = Array.from({ length: total }, (_, i) => i + 1);

  return (
    <div
      className="flex items-center gap-2 overflow-x-auto px-3 sm:px-4 lg:px-6 pt-2 pb-2 scrollbar-hide"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 flex-shrink-0 pr-2">
        <Users size={12} /> Comensal
      </span>

      {seats.map((n) => {
        const isActive = active === n;
        const units = unitsForSeat(ticket.items, n);
        return (
          <button
            key={n}
            type="button"
            onClick={() => updateTicket({ activeSeat: n })}
            className="inline-flex items-center gap-2 px-4 h-11 rounded-2xl text-sm font-black tracking-tight active:scale-95 transition-transform flex-shrink-0"
            style={{
              background: isActive ? "var(--brand)" : "rgba(255,255,255,0.05)",
              color:      isActive ? "var(--brand-fg)" : "rgba(255,255,255,0.85)",
              border:     `1px solid ${isActive ? "var(--brand)" : "rgba(255,255,255,0.10)"}`,
            }}
          >
            <span>{n}</span>
            {units > 0 && (
              <span
                className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-black"
                style={{
                  background: isActive ? "rgba(10,10,12,0.20)" : "var(--brand-soft)",
                  color:      isActive ? "var(--brand-fg)" : "var(--brand)",
                }}
              >
                {units}
              </span>
            )}
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => updateTicket({ activeSeat: null })}
        className="inline-flex items-center gap-2 px-4 h-11 rounded-2xl text-sm font-black tracking-tight active:scale-95 transition-transform flex-shrink-0"
        style={{
          background: active === null ? "#88D66C" : "rgba(255,255,255,0.05)",
          color:      active === null ? "#0a0a0c" : "rgba(255,255,255,0.85)",
          border:     `1px solid ${active === null ? "#88D66C" : "rgba(255,255,255,0.10)"}`,
        }}
        title="Items compartidos por toda la mesa"
      >
        <Share2 size={14} />
        <span className="hidden sm:inline">Compartido</span>
        {sharedUnits > 0 && (
          <span
            className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-black"
            style={{
              background: active === null ? "rgba(10,10,12,0.20)" : "rgba(136,214,108,0.20)",
              color:      active === null ? "#0a0a0c" : "#88D66C",
            }}
          >
            {sharedUnits}
          </span>
        )}
      </button>
    </div>
  );
}
