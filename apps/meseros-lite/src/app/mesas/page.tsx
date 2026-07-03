"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCw, Settings, ShoppingBag, UsersRound } from "lucide-react";
import AppHeader, { type ConnectionStatus } from "@/components/AppHeader";
import StatusBadge, { type OperationalStatus } from "@/components/StatusBadge";
import api from "@/lib/api";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import { useOfflineQueueStore } from "@/store/useOfflineQueueStore";
import { type AssignedTable, useWaiterOrderStore } from "@/store/useWaiterOrderStore";

interface ApiTable {
  id: string;
  name: string;
  capacity?: number | null;
  status: "AVAILABLE" | "OCCUPIED" | "DIRTY";
  zoneId?: string | null;
  zone?: { id: string; name: string; icon?: string | null } | null;
  activeOrder?: { id: string; total: number; orderNumber: string; _count?: { items: number } } | null;
}

type LoadState = "idle" | "loading" | "ready" | "offline" | "error";

const tablesCacheKey = "meseros-lite-real-tables";

function money(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function tableStatus(status: ApiTable["status"]): AssignedTable["status"] {
  if (status === "AVAILABLE") return "free";
  if (status === "DIRTY") return "ready";
  return "open";
}

function readCachedTables() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(tablesCacheKey);
    return raw ? (JSON.parse(raw) as AssignedTable[]) : [];
  } catch {
    return [];
  }
}

function writeCachedTables(tables: AssignedTable[]) {
  try {
    localStorage.setItem(tablesCacheKey, JSON.stringify(tables));
  } catch {
    return;
  }
}

function mapTables(rows: ApiTable[]): AssignedTable[] {
  return rows.map((table) => ({
    id: table.id,
    name: table.name,
    zone: table.zone?.name || "Sin zona",
    guests: table.capacity || 4,
    status: tableStatus(table.status),
    activeOrderId: table.activeOrder?.id || null,
    activeOrderItemCount: table.activeOrder?._count?.items || 0,
    activeOrderTotal: table.activeOrder?.total || 0,
  }));
}

function badgeFor(table: AssignedTable): { status: OperationalStatus; label: string } {
  if (table.status === "ready") return { status: "cleaning", label: "Por limpiar" };
  if (table.status === "blocked") return { status: "urgent", label: "Bloqueada" };
  if (table.status === "open") {
    return {
      status: table.activeOrderItemCount && table.activeOrderItemCount > 6 ? "kitchen" : "open",
      label: table.activeOrderItemCount && table.activeOrderItemCount > 6 ? "En cocina" : "Cuenta abierta",
    };
  }
  return { status: "free", label: "Libre" };
}

function sortPriority(table: AssignedTable) {
  if (table.status === "blocked") return 0;
  if (table.status === "ready") return 1;
  if (table.status === "open") return 2;
  return 3;
}

export default function MesasPage() {
  const router = useRouter();
  const online = useOnlineStatus();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const assignedTables = useWaiterOrderStore((state) => state.assignedTables);
  const activeTableId = useWaiterOrderStore((state) => state.activeTableId);
  const setActiveTable = useWaiterOrderStore((state) => state.setActiveTable);
  const setAssignedTables = useWaiterOrderStore((state) => state.setAssignedTables);
  const pendingCount = useOfflineQueueStore(
    (state) => state.queue.filter((t) => !t.synced && !t.failedPermanently).length,
  );
  const failedCount = useOfflineQueueStore(
    (state) => state.queue.filter((t) => t.failedPermanently).length,
  );
  const syncing = useOfflineQueueStore((state) => state.syncInProgress);

  const applyTables = async () => {
    try {
      const { data } = await api.get<ApiTable[]>("/api/tables");
      const tables = mapTables(Array.isArray(data) ? data : []);
      setAssignedTables(tables);
      writeCachedTables(tables);
      setLoadState("ready");
    } catch (err: unknown) {
      const cached = readCachedTables();
      if (cached.length > 0) {
        setAssignedTables(cached);
        setLoadState("offline");
        return;
      }

      const message =
        typeof err === "object" &&
        err !== null &&
        "response" in err &&
        typeof (err as { response?: { data?: { error?: string } } }).response?.data?.error === "string"
          ? (err as { response: { data: { error: string } } }).response.data.error
          : "No se pudieron cargar las mesas reales. Configura la tablet o revisa sesion.";
      setError(
        message.toLowerCase().includes("token")
          ? "Sesion vencida. Vuelve a ingresar tu PIN (no hace falta reconfigurar la tablet)."
          : message,
      );
      setLoadState("error");
    }
  };

  const loadTables = () => {
    setLoadState("loading");
    setError("");
    void applyTables();
  };

  useEffect(() => {
    const cached = readCachedTables();
    if (cached.length > 0) setAssignedTables(cached);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void applyTables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectionStatus: ConnectionStatus = !online
    ? "offline"
    : failedCount > 0
      ? "error"
      : syncing || pendingCount > 0
        ? "syncing"
        : "online";

  const groupedTables = useMemo(() => {
    return [...assignedTables]
      .sort((a, b) => sortPriority(a) - sortPriority(b) || (b.activeOrderTotal || 0) - (a.activeOrderTotal || 0))
      .reduce<Record<string, AssignedTable[]>>((acc, table) => {
        const zone = table.zone || "Sin zona";
        acc[zone] = [...(acc[zone] || []), table];
        return acc;
      }, {});
  }, [assignedTables]);

  const stats = {
    total: assignedTables.length,
    open: assignedTables.filter((table) => table.status === "open").length,
    attention: assignedTables.filter((table) => table.status === "ready" || table.status === "blocked").length,
  };

  return (
    <section className="min-h-screen bg-[var(--bg)] px-4 py-5 pb-28 text-[var(--text-primary)]">
      <AppHeader
        title="Mis mesas"
        subtitle="Ana · Mesero"
        connectionStatus={connectionStatus}
        rightAction={
          <button
            type="button"
            onClick={loadTables}
            className="flex min-h-[52px] min-w-[52px] items-center justify-center rounded-soft border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-primary)] active:scale-95 transition-all duration-150"
            aria-label="Actualizar mesas"
          >
            <RotateCw size={23} className={loadState === "loading" ? "animate-spin" : undefined} />
          </button>
        }
      />

      {(loadState === "offline" || !online || pendingCount > 0) && (
        <div className="mb-4 rounded-card border border-[var(--warning)] bg-[rgba(246,178,59,0.1)] p-3">
          <StatusBadge status="offline" label={pendingCount > 0 ? `${pendingCount} en cola` : "Sin WiFi"} />
          <p className="mt-2 text-sm font-bold text-[var(--text-secondary)]">
            Las rondas se guardan localmente y se enviaran al reconectar.
          </p>
        </div>
      )}

      <div className="mb-4 grid grid-cols-3 gap-2">
        <article className="rounded-card border border-[var(--border)] bg-[var(--surface-1)] p-3">
          <p className="text-xs font-black uppercase text-[var(--text-muted)]">Total</p>
          <p className="mt-1 text-2xl font-black">{stats.total}</p>
        </article>
        <article className="rounded-card border border-[var(--border)] bg-[var(--surface-1)] p-3">
          <p className="text-xs font-black uppercase text-[var(--text-muted)]">Abiertas</p>
          <p className="mt-1 text-2xl font-black text-[var(--warning)]">{stats.open}</p>
        </article>
        <article className="rounded-card border border-[var(--border)] bg-[var(--surface-1)] p-3">
          <p className="text-xs font-black uppercase text-[var(--text-muted)]">Atencion</p>
          <p className="mt-1 text-2xl font-black text-[var(--danger)]">{stats.attention}</p>
        </article>
      </div>

      <button
        type="button"
        onClick={() => {
          setActiveTable(null);
          router.push("/menu");
        }}
        className="mb-4 flex min-h-[64px] w-full items-center justify-center gap-3 rounded-card border border-[var(--brand)] bg-[var(--brand)] text-lg font-black text-[var(--brand-fg)] shadow-soft active:scale-[0.99] transition-all duration-150"
      >
        <ShoppingBag size={24} strokeWidth={2.4} />
        Pedido para llevar
      </button>

      {loadState === "error" && (
        <div className="grid gap-3 rounded-card border border-[var(--danger)] bg-[var(--surface-1)] p-4">
          <StatusBadge status="error" label="Error sync" />
          <p className="text-base font-black text-[var(--text-primary)]">{error}</p>
          <Link
            href="/setup"
            className="flex min-h-[60px] items-center justify-center rounded-soft border border-[var(--brand)] bg-[var(--brand)] px-4 text-lg font-black text-[var(--brand-fg)] active:scale-95 transition-all duration-150"
          >
            Configurar tablet
          </Link>
        </div>
      )}

      {loadState !== "error" && assignedTables.length === 0 && (
        <div className="grid gap-3 rounded-card border border-[var(--border)] bg-[var(--surface-1)] p-5 text-center">
          <Settings className="mx-auto text-[var(--text-muted)]" size={34} />
          <p className="text-xl font-black">No hay mesas configuradas</p>
          <p className="text-base font-bold text-[var(--text-secondary)]">
            Crea mesas y zonas en el TPV completo, en Admin / Mesas y Zonas.
          </p>
        </div>
      )}

      <div className="grid gap-6">
        {Object.entries(groupedTables).map(([zone, tables]) => (
          <section key={zone}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="truncate text-sm font-black uppercase tracking-widest text-[var(--text-muted)]">
                {zone}
              </h2>
              <p className="shrink-0 text-sm font-black text-[var(--text-muted)]">{tables.length} mesas</p>
            </div>

            <div className="grid gap-3">
              {tables.map((table) => {
                const selected = table.id === activeTableId;
                const badge = badgeFor(table);
                const isOpen = table.status === "open";
                return (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => {
                      setActiveTable(
                        table.id,
                        table.name,
                        table.activeOrderId
                          ? {
                              id: table.activeOrderId,
                              itemCount: table.activeOrderItemCount || 0,
                              total: table.activeOrderTotal || 0,
                            }
                          : null,
                      );
                      router.push(table.status === "open" ? "/cuenta" : "/menu");
                    }}
                    className={[
                      "min-h-[104px] rounded-card border bg-[var(--surface-1)] p-4 text-left shadow-soft",
                      "active:scale-[0.99] transition-all duration-150",
                      selected ? "border-[var(--brand)] bg-[var(--surface-3)]" : "border-[var(--border)]",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-2xl font-black">{table.name}</p>
                          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-3)] px-2 py-1 text-xs font-black text-[var(--text-secondary)]">
                            <UsersRound size={13} /> {table.guests || 4}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <StatusBadge status={badge.status} label={badge.label} />
                          <span className="text-sm font-bold text-[var(--text-secondary)]">
                            {isOpen
                              ? `${table.activeOrderItemCount || 0} productos`
                              : table.status === "free"
                                ? "Toca para abrir"
                                : "Revisar antes de abrir"}
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs font-black uppercase text-[var(--text-muted)]">
                          {isOpen ? "Total" : zone}
                        </p>
                        <p className="mt-1 text-xl font-black tnum">
                          {isOpen ? money(table.activeOrderTotal || 0) : ""}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
