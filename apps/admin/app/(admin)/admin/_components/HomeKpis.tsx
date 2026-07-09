"use client";

import { CircleDollarSign, Clock3, ReceiptText, UsersRound } from "lucide-react";
import { StatCard } from "@/components/ds";
import { formatMoney } from "@/lib/format";
import type { Stats } from "./types";

const trendOf = (delta?: number) =>
  delta === undefined ? undefined : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`;

/* KPIs de operación: pedidos, ticket promedio, preparación y personal. */
export default function HomeKpis({ stats, staffCount }: { stats: Stats | null; staffCount: number }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-3 md:mt-5 md:grid-cols-4 md:gap-4">
      <StatCard
        title="Pedidos"
        value={(stats?.orders.value || 0).toLocaleString("es-MX")}
        icon={ReceiptText}
        trend={trendOf(stats?.orders.delta)}
        trendUp={(stats?.orders.delta ?? 0) >= 0}
      />
      <StatCard
        title="Ticket prom."
        value={formatMoney(stats?.averageTicket.value || 0, false)}
        icon={CircleDollarSign}
        trend={trendOf(stats?.averageTicket.delta)}
        trendUp={(stats?.averageTicket.delta ?? 0) >= 0}
      />
      <StatCard
        title="Prep. prom."
        value={`${Math.round(stats?.prepMinutes.value || 0)} min`}
        icon={Clock3}
      />
      <StatCard title="Personal en turno" value={staffCount.toString()} icon={UsersRound} />
    </div>
  );
}
