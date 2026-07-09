"use client";
import { useEffect, useState, useCallback } from "react";
import { Store, TrendingUp, Receipt, Wallet, Bike } from "lucide-react";
import api from "@/lib/api";
import {
  Card, SectionHead, StatTile, Button, Field, Input, LoadingState, ErrorState,
  useToast,
} from "@/components/ds";
import { formatMoney } from "@/lib/format";
import type { Report } from "./types";

export default function ReportsTab() {
  const toast = useToast();
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params: Record<string, string> = {};
      if (from) params.from = from;
      if (to) params.to = to;
      const { data } = await api.get("/api/whatsapp/marketing/reports", { params });
      setData(data);
    } catch {
      setError(true);
      toast.error("Error al cargar reportes");
    } finally {
      setLoading(false);
    }
  }, [from, to, toast]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <LoadingState label="Cargando reportes…" />;
  if (error && !data) return <ErrorState hint="No pudimos cargar los reportes del canal WhatsApp." onRetry={load} />;

  const wa = data?.whatsapp;
  return (
    <div className="space-y-2">
      <Card className="flex flex-wrap items-end gap-3 p-3">
        <Field label="Desde" className="mb-0">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Hasta" className="mb-0">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Button onClick={load}>Aplicar</Button>
      </Card>

      <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-4">
        <StatTile icon={Wallet} value={formatMoney(wa?.totalRevenue || 0)} label="Ingresos" />
        <StatTile icon={Receipt} value={String(wa?.totalOrders || 0)} label="Pedidos" />
        <StatTile icon={TrendingUp} value={formatMoney(wa?.averageTicket || 0)} label="Ticket prom." />
        <StatTile icon={Bike} value={formatMoney(wa?.deliveryFees || 0)} label="Envíos" />
      </div>

      <div>
        <SectionHead title="Por sucursal" />
        {data?.byLocation.length ? (
          <div className="space-y-2">
            {data.byLocation.map((l) => (
              <Card key={l.locationId || "none"} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-bold text-tx-hi">
                  <Store size={15} className="text-tx-mut" /> {l.locationName}
                </div>
                <div className="text-right">
                  <div className="font-display text-sm font-extrabold text-primary">{formatMoney(l.revenue)}</div>
                  <div className="text-[10px] text-tx-mut">{l.orders} pedidos</div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-tx-mut">Aún no hay pedidos de WhatsApp en este periodo.</p>
        )}
      </div>

      <div>
        <SectionHead title="WhatsApp vs. otros canales" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(data?.bySource || []).map((s) => (
            <Card key={s.source} className="p-4">
              <div className="font-mono text-[10px] uppercase tracking-widest text-tx-mut">{s.source}</div>
              <div className="mt-1 font-display text-lg font-extrabold text-tx-hi">{formatMoney(s.revenue)}</div>
              <div className="text-[10px] text-tx-mut">{s.orders} pedidos</div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
