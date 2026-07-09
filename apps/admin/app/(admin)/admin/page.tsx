"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import api from "@/lib/api";
import { getUser } from "@/lib/auth";
import {
  Button, ErrorState, LoadingCards, PageHeader, PageShell, Segmented,
} from "@/components/ds";
import {
  PERIOD_DAYS, PERIOD_OPTIONS,
  type ActiveShift, type Period, type SalesDay, type Stats, type TopItem,
} from "./_components/types";
import SalesHero from "./_components/SalesHero";
import HomeKpis from "./_components/HomeKpis";
import AiInsightBanner from "./_components/AiInsightBanner";
import TopItemsCard from "./_components/TopItemsCard";
import QuickActions from "./_components/QuickActions";
import { AgentHealthCard, LiveDeliveryMap, PeakHoursHeatmap } from "@/components/dashboard/widgets";

export default function AdminHomePage() {
  const [period, setPeriod] = useState<Period>("HOY");
  const [stats, setStats] = useState<Stats | null>(null);
  const [series, setSeries] = useState<SalesDay[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [staffCount, setStaffCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Saludo calculado en cliente (localStorage + hora local) para evitar
  // desajustes de hidratación; mientras tanto un título neutro.
  const [greeting, setGreeting] = useState("Resumen del negocio");

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [statsResponse, salesResponse, topResponse, shiftResponse] = await Promise.all([
        api.get<Stats>(`/api/dashboard/stats?period=${period}`),
        api.get<{ series: SalesDay[] }>(`/api/dashboard/sales-by-day?days=${PERIOD_DAYS[period]}`),
        api.get<TopItem[]>(`/api/dashboard/top-items?period=${period}&limit=4`),
        api.get<ActiveShift>("/api/dashboard/active-shift"),
      ]);
      setStats(statsResponse.data);
      setSeries(salesResponse.data.series || []);
      setTopItems(topResponse.data || []);
      setStaffCount(shiftResponse.data.staff?.length || 0);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
    const refresh = () => load();
    window.addEventListener("locationChanged", refresh);
    return () => window.removeEventListener("locationChanged", refresh);
  }, [load]);

  useEffect(() => {
    const hour = new Date().getHours();
    const saludo = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
    const user = getUser() as { name?: string } | null;
    const firstName = user?.name?.trim().split(/\s+/)[0];
    setGreeting(firstName ? `${saludo}, ${firstName}` : saludo);
  }, []);

  const header = (
    <PageHeader
      eyebrow="Panel operativo"
      title={greeting}
      subtitle="Ventas, operación y recomendaciones de Mesero en un solo lugar."
      actions={
        <Button href="/admin/reportes/ia">
          Abrir Reportes IA <ArrowRight size={16} />
        </Button>
      }
    />
  );

  if (loading && !stats) {
    return (
      <PageShell>
        {header}
        <LoadingCards count={8} />
      </PageShell>
    );
  }

  if (error && !stats) {
    return (
      <PageShell>
        {header}
        <ErrorState title="No pudimos cargar el resumen" onRetry={load} />
      </PageShell>
    );
  }

  return (
    <PageShell>
      {header}

      <div className="mb-3 md:mb-5 md:max-w-[360px]">
        <Segmented options={PERIOD_OPTIONS} value={period} onChange={setPeriod} />
      </div>

      <SalesHero period={period} sales={stats?.sales ?? { value: 0, delta: 0 }} series={series} />
      <HomeKpis stats={stats} staffCount={staffCount} />
      <AiInsightBanner stats={stats} />

      {/* Operación en vivo: cerebro del agente IA + mapa de entregas + horas pico */}
      <div className="my-3 grid gap-3 md:my-5 md:grid-cols-2 md:gap-4">
        <AgentHealthCard />
        <LiveDeliveryMap />
      </div>
      <div className="mb-3 md:mb-5">
        <PeakHoursHeatmap />
      </div>

      <div className="md:grid md:grid-cols-[minmax(0,1.45fr)_minmax(300px,.55fr)] md:gap-5">
        <TopItemsCard items={topItems} />
        <QuickActions />
      </div>
    </PageShell>
  );
}
