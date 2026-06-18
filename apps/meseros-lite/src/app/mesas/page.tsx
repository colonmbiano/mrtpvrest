"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCw, Settings, ShoppingBag } from "lucide-react";
import api from "@/lib/api";
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

export default function MesasPage() {
  const router = useRouter();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const assignedTables = useWaiterOrderStore((state) => state.assignedTables);
  const activeTableId = useWaiterOrderStore((state) => state.activeTableId);
  const setActiveTable = useWaiterOrderStore((state) => state.setActiveTable);
  const setAssignedTables = useWaiterOrderStore((state) => state.setAssignedTables);

  // Fetch puro: sin setState síncrono antes del primer await, para que el
  // effect de montaje no dispare react-hooks/set-state-in-effect.
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

  // Wrapper para eventos (botón refrescar / reintentar): muestra el flash.
  const loadTables = () => {
    setLoadState("loading");
    setError("");
    void applyTables();
  };

  useEffect(() => {
    const cached = readCachedTables();
    if (cached.length > 0) setAssignedTables(cached);
    // applyTables sólo hace setState tras el await del fetch (microtask), no
    // es un cascading render síncrono; el rule lo marca por análisis estático.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void applyTables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groupedTables = useMemo(() => {
    return assignedTables.reduce<Record<string, AssignedTable[]>>((acc, table) => {
      const zone = table.zone || "Sin zona";
      acc[zone] = [...(acc[zone] || []), table];
      return acc;
    }, {});
  }, [assignedTables]);

  const stats = {
    total: assignedTables.length,
    free: assignedTables.filter((table) => table.status === "free").length,
    open: assignedTables.filter((table) => table.status === "open").length,
  };

  return (
    <section className="min-h-screen bg-[var(--bg)] px-5 py-5 pb-28 text-[var(--text-primary)]">
      <header className="mb-5 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase tracking-wide text-[var(--brand)]">Piso real</p>
          <h1 className="truncate text-3xl font-black text-[var(--text-primary)]">Mapa de salon</h1>
        </div>
        <button
          type="button"
          onClick={loadTables}
          className="flex min-h-[64px] min-w-[64px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--brand)] active:scale-95 transition-all duration-150"
          aria-label="Actualizar mesas"
        >
          <RotateCw size={26} />
        </button>
      </header>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3">
          <p className="text-xs font-black uppercase text-[var(--text-muted)]">Total</p>
          <p className="text-2xl font-black text-[var(--text-primary)]">{stats.total}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3">
          <p className="text-xs font-black uppercase text-[var(--text-muted)]">Libres</p>
          <p className="text-2xl font-black text-[var(--brand)]">{stats.free}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3">
          <p className="text-xs font-black uppercase text-[var(--text-muted)]">Abiertas</p>
          <p className="text-2xl font-black text-[var(--brand)]">{stats.open}</p>
        </div>
      </div>

      {/* Pedido para llevar: arranca una comanda SIN mesa (orderType TAKEOUT).
          Limpia cualquier mesa/ticket activo para empezar en limpio. */}
      <button
        type="button"
        onClick={() => {
          setActiveTable(null);
          router.push("/menu");
        }}
        className="mb-4 flex min-h-[68px] w-full items-center justify-center gap-3 rounded-lg border border-[var(--brand)] bg-[var(--brand)] text-xl font-black text-[var(--brand-fg)] active:scale-95 transition-all duration-150"
      >
        <ShoppingBag size={26} strokeWidth={2.4} />
        Pedido para llevar
      </button>

      {loadState === "offline" && (
        <p className="mb-4 rounded-lg border border-[var(--brand)] bg-[var(--surface-1)] p-4 text-base font-black text-[var(--brand)]">
          Mostrando mesas guardadas localmente.
        </p>
      )}

      {loadState === "error" && (
        <div className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4">
          <p className="text-base font-black text-[var(--brand)]">{error}</p>
          <Link
            href="/setup"
            className="flex min-h-[64px] items-center justify-center rounded-lg border border-[var(--brand)] bg-[var(--brand)] px-4 text-lg font-black text-[var(--brand-fg)] active:scale-95 transition-all duration-150"
          >
            Configurar tablet
          </Link>
        </div>
      )}

      {loadState !== "error" && assignedTables.length === 0 && (
        <div className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-5 text-center">
          <Settings className="mx-auto text-[var(--brand)]" size={34} />
          <p className="text-xl font-black text-[var(--text-primary)]">No hay mesas configuradas</p>
          <p className="text-base font-bold text-[var(--text-secondary)]">
            Crea mesas y zonas en el TPV completo, en Admin / Mesas y Zonas.
          </p>
        </div>
      )}

      <div className="grid gap-6">
        {Object.entries(groupedTables).map(([zone, tables]) => (
          <section key={zone}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="truncate text-lg font-black uppercase tracking-wide text-[var(--text-primary)]">
                {zone}
              </h2>
              <p className="shrink-0 text-sm font-black text-[var(--text-muted)]">{tables.length} mesas</p>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {tables.map((table) => {
                const selected = table.id === activeTableId;
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
                      // Mesa con cuenta abierta → ver primero lo ya pedido
                      // (items + total) y desde ahí "Agregar mas". Mesa libre
                      // → directo a la comanda nueva.
                      router.push(table.status === "open" ? "/cuenta" : "/menu");
                    }}
                    className={[
                      "min-h-[112px] rounded-lg border bg-[var(--surface-1)] p-4 text-left",
                      "active:scale-95 transition-all duration-150",
                      selected ? "border-[var(--brand)]" : "border-[var(--border)]",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xl font-black text-[var(--text-primary)]">{table.name}</p>
                      <span className="rounded-md border border-[var(--border)] bg-[var(--surface-3)] px-2 py-1 text-xs font-black text-[var(--text-secondary)]">
                        {table.guests || 4}p
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-bold text-[var(--text-secondary)]">{zone}</p>
                    <p className="mt-3 text-sm font-black uppercase text-[var(--brand)]">
                      {table.status === "free"
                        ? "Libre"
                        : table.status === "ready"
                          ? "Por limpiar"
                          : "Cuenta abierta"}
                    </p>
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
