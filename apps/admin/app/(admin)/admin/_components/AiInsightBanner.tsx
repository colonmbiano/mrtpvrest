"use client";

import Link from "next/link";
import { ArrowRight, Bot } from "lucide-react";
import { formatMoney } from "@/lib/format";
import type { Stats } from "./types";

/* Banner de Mesero IA con el insight del día sobre el acento del tenant. */
export default function AiInsightBanner({ stats }: { stats: Stats | null }) {
  return (
    <section
      className="mt-3 overflow-hidden rounded-ds-xl p-3.5 md:mt-5 md:flex md:items-center md:justify-between md:gap-8 md:p-6"
      style={{
        background: "linear-gradient(135deg,var(--brand-secondary),var(--brand-primary))",
        boxShadow: "0 8px 22px var(--accent-glow)",
        color: "var(--accent-contrast)",
      }}
    >
      <div className="md:max-w-3xl">
        <div className="flex items-center gap-2">
          <span
            className="grid h-8 w-8 place-items-center rounded-xl"
            style={{ background: "color-mix(in srgb, var(--accent-contrast) 15%, transparent)" }}
          >
            <Bot size={17} />
          </span>
          <div>
            <div className="font-display text-[15px] font-extrabold">Mesero IA</div>
            <div className="font-mono text-[9px] uppercase tracking-[.12em] opacity-65">
              Insight del día
            </div>
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed opacity-90">
          {stats?.orders.value
            ? `Llevas ${stats.orders.value} pedidos. Tu ticket promedio es ${formatMoney(stats.averageTicket.value, false)} y hay ${stats.prepMinutes.activeCount} órdenes activas.`
            : "Todavía no hay pedidos en este periodo. Es un buen momento para activar una promoción o revisar tu menú."}
        </p>
      </div>
      <Link
        href="/admin/reportes/ia"
        className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-ds-md px-4 text-xs font-extrabold"
        style={{ background: "var(--accent-contrast)", color: "var(--brand-secondary)" }}
      >
        Ver plan del día <ArrowRight size={15} />
      </Link>
    </section>
  );
}
