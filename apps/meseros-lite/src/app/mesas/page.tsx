"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCw, Settings } from "lucide-react";
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
  }));
}

export default function MesasPage() {
  const router = useRouter();
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [error, setError] = useState("");
  const assignedTables = useWaiterOrderStore((state) => state.assignedTables);
  const activeTableId = useWaiterOrderStore((state) => state.activeTableId);
  const setActiveTable = useWaiterOrderStore((state) => state.setActiveTable);
  const setAssignedTables = useWaiterOrderStore((state) => state.setAssignedTables);

  const loadTables = async () => {
    setLoadState("loading");
    setError("");

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

  useEffect(() => {
    const cached = readCachedTables();
    if (cached.length > 0) setAssignedTables(cached);
    void loadTables();
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
    <section className="min-h-screen bg-[#0a0a0c] px-5 py-5 pb-28 text-neutral-200">
      <header className="mb-5 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase tracking-wide text-[#ffb84d]">Piso real</p>
          <h1 className="truncate text-3xl font-black text-neutral-200">Mapa de salon</h1>
        </div>
        <button
          type="button"
          onClick={loadTables}
          className="flex min-h-[64px] min-w-[64px] items-center justify-center rounded-lg border border-neutral-800 bg-[#121214] text-[#ffb84d] active:scale-95 transition-all duration-150"
          aria-label="Actualizar mesas"
        >
          <RotateCw size={26} />
        </button>
      </header>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-neutral-800 bg-[#121214] p-3">
          <p className="text-xs font-black uppercase text-neutral-500">Total</p>
          <p className="text-2xl font-black text-neutral-100">{stats.total}</p>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-[#121214] p-3">
          <p className="text-xs font-black uppercase text-neutral-500">Libres</p>
          <p className="text-2xl font-black text-[#ffb84d]">{stats.free}</p>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-[#121214] p-3">
          <p className="text-xs font-black uppercase text-neutral-500">Abiertas</p>
          <p className="text-2xl font-black text-[#ffb84d]">{stats.open}</p>
        </div>
      </div>

      {loadState === "offline" && (
        <p className="mb-4 rounded-lg border border-[#ffb84d] bg-[#121214] p-4 text-base font-black text-[#ffb84d]">
          Mostrando mesas guardadas localmente.
        </p>
      )}

      {loadState === "error" && (
        <div className="grid gap-3 rounded-lg border border-neutral-800 bg-[#121214] p-4">
          <p className="text-base font-black text-[#ffb84d]">{error}</p>
          <Link
            href="/setup"
            className="flex min-h-[64px] items-center justify-center rounded-lg border border-[#ffb84d] bg-[#ffb84d] px-4 text-lg font-black text-[#0a0a0c] active:scale-95 transition-all duration-150"
          >
            Configurar tablet
          </Link>
        </div>
      )}

      {loadState !== "error" && assignedTables.length === 0 && (
        <div className="grid gap-3 rounded-lg border border-neutral-800 bg-[#121214] p-5 text-center">
          <Settings className="mx-auto text-[#ffb84d]" size={34} />
          <p className="text-xl font-black text-neutral-100">No hay mesas configuradas</p>
          <p className="text-base font-bold text-neutral-400">
            Crea mesas y zonas en el TPV completo, en Admin / Mesas y Zonas.
          </p>
        </div>
      )}

      <div className="grid gap-6">
        {Object.entries(groupedTables).map(([zone, tables]) => (
          <section key={zone}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="truncate text-lg font-black uppercase tracking-wide text-neutral-200">
                {zone}
              </h2>
              <p className="shrink-0 text-sm font-black text-neutral-500">{tables.length} mesas</p>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {tables.map((table) => {
                const selected = table.id === activeTableId;
                return (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => {
                      setActiveTable(table.id, table.name);
                      // Mesa con cuenta abierta → ver primero lo ya pedido
                      // (items + total) y desde ahí "Agregar mas". Mesa libre
                      // → directo a la comanda nueva.
                      router.push(table.status === "open" ? "/cuenta" : "/menu");
                    }}
                    className={[
                      "min-h-[112px] rounded-lg border bg-[#121214] p-4 text-left",
                      "active:scale-95 transition-all duration-150",
                      selected ? "border-[#ffb84d]" : "border-neutral-800",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xl font-black text-neutral-100">{table.name}</p>
                      <span className="rounded-md border border-neutral-800 bg-[#18181b] px-2 py-1 text-xs font-black text-neutral-400">
                        {table.guests || 4}p
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-bold text-neutral-400">{zone}</p>
                    <p className="mt-3 text-sm font-black uppercase text-[#ffb84d]">
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
