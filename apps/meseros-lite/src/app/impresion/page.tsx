"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Delete, LockKeyhole, Printer, RefreshCw, RotateCcw } from "lucide-react";
import api from "@/lib/api";
import { usePrinterStore } from "@/store/usePrinterStore";
import { printTestTicket, type KitchenTicketConfig, type PrinterRecord, type PrinterStation } from "@/lib/printer";

// GET /api/printers exige rol ADMIN/SUPER_ADMIN en el backend, así que solo
// esos PINs desbloquean este panel.
const ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN"];
const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

type RawPrinter = PrinterRecord & {
  printerGroups?: Array<{ printerGroup?: { id: string } }>;
};

type TicketConfigDTO = {
  kitchenHeader?: string;
  kitchenFooter?: string;
  kitchenShowOrderNumber?: boolean;
  kitchenShowTime?: boolean;
  kitchenShowType?: boolean;
  kitchenShowTable?: boolean;
  kitchenShowCustomer?: boolean;
  kitchenShowModifiers?: boolean;
  kitchenShowNotes?: boolean;
  kitchenGroupBySeat?: boolean;
  kitchenFontSize?: string;
};

function normalizePrinters(list: RawPrinter[]): PrinterRecord[] {
  return list.map((p) => ({
    ...p,
    printerGroupIds: (p.printerGroups ?? [])
      .map((m) => m.printerGroup?.id)
      .filter((id): id is string => Boolean(id)),
  }));
}

function mapKitchenConfig(dto: TicketConfigDTO | null): KitchenTicketConfig | null {
  if (!dto) return null;
  const fs =
    dto.kitchenFontSize === "normal" || dto.kitchenFontSize === "xlarge"
      ? (dto.kitchenFontSize as "normal" | "xlarge")
      : "large";
  return {
    header: dto.kitchenHeader ?? undefined,
    footer: dto.kitchenFooter ?? undefined,
    showOrderNumber: dto.kitchenShowOrderNumber,
    showTime: dto.kitchenShowTime,
    showOrderType: dto.kitchenShowType,
    showTableNumber: dto.kitchenShowTable,
    showCustomerName: dto.kitchenShowCustomer,
    showModifiers: dto.kitchenShowModifiers,
    showNotes: dto.kitchenShowNotes,
    groupBySeat: dto.kitchenGroupBySeat,
    fontSize: fs,
  };
}

function stationOf(printer: PrinterRecord): PrinterStation {
  const t = String(printer.type || "").toUpperCase();
  if (t === "CASHIER" || t === "BAR") return t;
  return "KITCHEN";
}

function apiErrorMessage(err: unknown, fallback: string) {
  return typeof err === "object" &&
    err !== null &&
    "response" in err &&
    typeof (err as { response?: { data?: { error?: string } } }).response?.data?.error === "string"
    ? (err as { response: { data: { error: string } } }).response.data.error
    : fallback;
}

export default function ImpresionPage() {
  const router = useRouter();
  const printers = usePrinterStore((state) => state.printers);
  const autoPrint = usePrinterStore((state) => state.autoPrint);
  const lastSync = usePrinterStore((state) => state.lastSync);
  const setPrinters = usePrinterStore((state) => state.setPrinters);
  const setKitchenConfig = usePrinterStore((state) => state.setKitchenConfig);
  const setAutoPrint = usePrinterStore((state) => state.setAutoPrint);

  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);

  const unlocked = Boolean(adminToken);

  const appendDigit = (digit: string) => {
    setError("");
    setPin((current) => (current.length >= 8 ? current : `${current}${digit}`));
  };

  const submitPin = async () => {
    if (pin.length < 4) {
      setError("Ingresa el PIN de administrador.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post<{ employee: { role: string }; token: string }>(
        "/api/employees/login",
        { pin },
      );
      if (!ADMIN_ROLES.includes(data.employee.role)) {
        setError("Ese PIN no tiene rol de administrador.");
        setPin("");
        return;
      }
      setAdminToken(data.token);
      setPin("");
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "No se pudo validar el PIN."));
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  const syncPrinters = async () => {
    if (!adminToken) return;
    setLoading(true);
    setError("");
    setMessage("");
    const authConfig = { headers: { Authorization: `Bearer ${adminToken}` } };
    try {
      const [printersRes, configRes] = await Promise.all([
        api.get<RawPrinter[]>("/api/printers", authConfig),
        api.get<TicketConfigDTO>("/api/printers/ticket-config", authConfig).catch(() => ({ data: null })),
      ]);
      const list = Array.isArray(printersRes.data) ? normalizePrinters(printersRes.data) : [];
      setPrinters(list);
      setKitchenConfig(mapKitchenConfig(configRes.data));
      setMessage(`Sincronizadas ${list.length} impresora${list.length === 1 ? "" : "s"}.`);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "No se pudieron sincronizar las impresoras."));
    } finally {
      setLoading(false);
    }
  };

  const testPrinter = async (printer: PrinterRecord) => {
    setTestingId(printer.id);
    setError("");
    setMessage("");
    try {
      await printTestTicket({ ip: printer.ip || "", port: printer.port }, stationOf(printer));
      setMessage(`Prueba enviada a ${printer.name}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Fallo al imprimir.";
      setError(`${printer.name}: ${msg}`);
    } finally {
      setTestingId(null);
    }
  };

  // ── Pantalla de PIN ───────────────────────────────────────────────────────
  if (!unlocked) {
    return (
      <section className="min-h-screen bg-[#0a0a0c] px-5 py-5 text-neutral-200">
        <div className="mx-auto grid max-w-md gap-4">
          <button
            type="button"
            onClick={() => router.replace("/perfil")}
            className="flex min-h-[56px] items-center gap-2 rounded-lg border border-neutral-800 bg-[#121214] px-4 text-base font-black text-neutral-300 active:scale-95 transition-all duration-150"
          >
            <ArrowLeft size={22} />
            Volver
          </button>

          <header className="rounded-lg border border-neutral-800 bg-[#121214] p-5 text-center">
            <LockKeyhole className="mx-auto mb-3 text-[#ffb84d]" size={42} />
            <p className="text-sm font-black uppercase tracking-wide text-[#ffb84d]">Solo administrador</p>
            <h1 className="mt-1 text-3xl font-black text-neutral-100">Impresión</h1>
            <p className="mt-2 text-base font-bold text-neutral-400">
              Ingresa el PIN de un administrador para configurar las impresoras de esta tablet.
            </p>
          </header>

          <div className="rounded-lg border border-neutral-800 bg-[#121214] p-4">
            <div className="mb-4 flex min-h-[72px] items-center justify-center rounded-lg border border-neutral-800 bg-[#0a0a0c]">
              <span className="text-4xl font-black tracking-wide text-neutral-100">
                {pin ? "•".repeat(pin.length) : "----"}
              </span>
            </div>

            {error && (
              <p className="mb-4 rounded-lg border border-[#ffb84d] bg-[#18181b] p-3 text-center text-sm font-black text-[#ffb84d]">
                {error}
              </p>
            )}

            <div className="grid grid-cols-3 gap-3">
              {digits.slice(0, 9).map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => appendDigit(digit)}
                  disabled={loading}
                  className="min-h-[72px] rounded-lg border border-neutral-800 bg-[#18181b] text-3xl font-black text-neutral-100 active:scale-95 transition-all duration-150"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPin((current) => current.slice(0, -1))}
                disabled={loading}
                className="flex min-h-[72px] items-center justify-center rounded-lg border border-neutral-800 bg-[#18181b] text-neutral-200 active:scale-95 transition-all duration-150"
                aria-label="Borrar digito"
              >
                <Delete size={30} />
              </button>
              <button
                type="button"
                onClick={() => appendDigit("0")}
                disabled={loading}
                className="min-h-[72px] rounded-lg border border-neutral-800 bg-[#18181b] text-3xl font-black text-neutral-100 active:scale-95 transition-all duration-150"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setPin("");
                }}
                disabled={loading}
                className="flex min-h-[72px] items-center justify-center rounded-lg border border-neutral-800 bg-[#18181b] text-neutral-200 active:scale-95 transition-all duration-150"
                aria-label="Limpiar PIN"
              >
                <RotateCcw size={30} />
              </button>
            </div>

            <button
              type="button"
              onClick={submitPin}
              disabled={loading}
              className={[
                "mt-3 min-h-[72px] w-full rounded-lg border px-5 text-xl font-black",
                "active:scale-95 transition-all duration-150",
                loading
                  ? "border-neutral-800 bg-[#18181b] text-neutral-500"
                  : "border-[#ffb84d] bg-[#ffb84d] text-[#0a0a0c]",
              ].join(" ")}
            >
              {loading ? "Validando..." : "Desbloquear"}
            </button>
          </div>
        </div>
      </section>
    );
  }

  // ── Panel admin ─────────────────────────────────────────────────────────────
  return (
    <section className="min-h-screen bg-[#0a0a0c] px-5 py-5 pb-28 text-neutral-200">
      <header className="mb-5 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase tracking-wide text-[#ffb84d]">Administrador</p>
          <h1 className="truncate text-3xl font-black text-neutral-200">Impresión</h1>
        </div>
        <button
          type="button"
          onClick={() => router.replace("/perfil")}
          className="flex min-h-[56px] items-center gap-2 rounded-lg border border-neutral-800 bg-[#121214] px-4 text-base font-black text-neutral-300 active:scale-95 transition-all duration-150"
        >
          <ArrowLeft size={20} />
          Salir
        </button>
      </header>

      {(error || message) && (
        <p
          className={[
            "mb-4 rounded-lg border p-4 text-base font-black",
            error ? "border-[#ff6b6b] bg-[#121214] text-[#ff6b6b]" : "border-[#ffb84d] bg-[#121214] text-[#ffb84d]",
          ].join(" ")}
        >
          {error || message}
        </p>
      )}

      <article className="mb-4 rounded-lg border border-neutral-800 bg-[#121214] p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-black text-neutral-100">Auto-imprimir comanda</p>
            <p className="mt-1 text-sm font-bold text-neutral-400">
              Al guardar el ticket, imprime la comanda a cocina/barra desde esta tablet.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoPrint}
            onClick={() => setAutoPrint(!autoPrint)}
            className={[
              "relative h-11 w-20 shrink-0 rounded-full border transition-all duration-150",
              autoPrint ? "border-[#88d66c] bg-[#88d66c]" : "border-neutral-700 bg-[#18181b]",
            ].join(" ")}
            aria-label="Activar auto-impresión"
          >
            <span
              className={[
                "absolute top-1 h-8 w-8 rounded-full bg-[#0a0a0c] transition-all duration-150",
                autoPrint ? "left-11" : "left-1",
              ].join(" ")}
            />
          </button>
        </div>
      </article>

      <article className="mb-4 rounded-lg border border-neutral-800 bg-[#121214] p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-black text-neutral-100">Impresoras de la sucursal</p>
            <p className="mt-1 text-sm font-bold text-neutral-400">
              {lastSync
                ? `${printers.length} guardadas · sync ${new Date(lastSync).toLocaleTimeString("es-MX")}`
                : "Aún sin sincronizar"}
            </p>
          </div>
          <button
            type="button"
            onClick={syncPrinters}
            disabled={loading}
            className="flex min-h-[64px] items-center gap-2 rounded-lg border border-[#ffb84d] bg-[#18181b] px-4 text-base font-black text-[#ffb84d] active:scale-95 transition-all duration-150"
          >
            <RefreshCw size={22} />
            {loading ? "..." : "Sincronizar"}
          </button>
        </div>
      </article>

      {printers.length === 0 ? (
        <div className="grid gap-3 rounded-lg border border-neutral-800 bg-[#121214] p-5 text-center">
          <Printer className="mx-auto text-[#ffb84d]" size={34} />
          <p className="text-xl font-black text-neutral-100">No hay impresoras guardadas</p>
          <p className="text-base font-bold text-neutral-400">
            Sincroniza para traer las impresoras configuradas en Admin / Impresoras.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {printers.map((printer) => (
            <article
              key={printer.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-[#121214] p-4"
            >
              <div className="min-w-0">
                <p className="truncate text-lg font-black text-neutral-100">{printer.name}</p>
                <p className="mt-1 text-sm font-bold text-neutral-400">
                  {stationOf(printer)} · {printer.ip || "sin IP"}
                  {printer.port ? `:${printer.port}` : ""} · {printer.connectionType}
                  {printer.isActive ? "" : " · inactiva"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => testPrinter(printer)}
                disabled={testingId === printer.id || printer.connectionType !== "NETWORK"}
                className={[
                  "flex min-h-[64px] shrink-0 items-center justify-center rounded-lg border px-4 text-base font-black",
                  "active:scale-95 transition-all duration-150",
                  printer.connectionType !== "NETWORK"
                    ? "border-neutral-800 bg-[#18181b] text-neutral-600"
                    : "border-[#ffb84d] bg-[#18181b] text-[#ffb84d]",
                ].join(" ")}
              >
                {testingId === printer.id ? "Enviando..." : "Probar"}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
