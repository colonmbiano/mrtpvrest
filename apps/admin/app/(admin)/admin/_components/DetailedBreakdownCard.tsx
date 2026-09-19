"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/format";
import api from "@/lib/api";
import { Card, LoadingState, ErrorState } from "@/components/ds";
import { type Period } from "./types";

interface DailyBreakdown {
  date: string;
  orders: number;
  sales: number;
  expenses: number;
  expenseDetails: string[];
}

export default function DetailedBreakdownCard({ period }: { period: Period }) {
  const [data, setData] = useState<DailyBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(false);
      try {
        const res = await api.get<DailyBreakdown[]>(`/api/dashboard/detailed-breakdown?period=${period}`);
        setData(res.data);
      } catch (err) {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [period]);

  if (loading) {
    return (
      <Card className="p-5 flex items-center justify-center min-h-[200px]">
        <LoadingState title="Cargando desglose..." />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-5">
        <ErrorState title="Error al cargar desglose" />
      </Card>
    );
  }

  if (data.length === 0) {
    return null;
  }

  // Helper para mostrar un formato bonito como "Lunes 7" o "Viernes 11"
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00");
    const dayName = d.toLocaleDateString("es-MX", { weekday: "long" });
    const dayNumber = d.getDate();
    return `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${dayNumber}`;
  };

  return (
    <Card className="overflow-hidden p-4 md:p-6 mb-3 md:mb-5">
      <h3 className="font-display text-lg font-bold text-tx-hi mb-4">
        Resumen Detallado por Día
      </h3>
      <div className="space-y-4">
        {data.map((day) => {
          const net = day.sales - day.expenses;
          return (
            <div key={day.date} className="border border-border/40 rounded-lg p-4 bg-surf2/30">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-tx-hi">
                  📅 {formatDate(day.date)}
                </h4>
                <div className="text-right">
                  <div className="text-sm text-tx-mut">Neto</div>
                  <div className={`font-bold ${net >= 0 ? "text-ok" : "text-err"}`}>
                    {formatMoney(net)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm mt-3">
                <div>
                  <div className="text-tx-mut">Ventas ({day.orders} órdenes)</div>
                  <div className="font-medium text-tx-hi">{formatMoney(day.sales)}</div>
                </div>
                <div>
                  <div className="text-tx-mut">Gastos</div>
                  <div className="font-medium text-tx-hi">{formatMoney(day.expenses)}</div>
                </div>
              </div>

              {day.expenseDetails.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/40 text-xs text-tx-mut">
                  <strong className="block mb-1">Detalle de Gastos:</strong>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {day.expenseDetails.map((detail, idx) => (
                      <li key={idx}>{detail}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
