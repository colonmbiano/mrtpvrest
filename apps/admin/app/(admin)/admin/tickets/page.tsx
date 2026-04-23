"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";

// Editor completo del TicketConfig de la sucursal activa. Comparte los
// endpoints GET/PUT /api/printers/ticket-config con el modal del TPV, así que
// editar desde aquí o desde el TPV produce el mismo resultado.

type TicketConfig = {
  businessName: string;
  header: string;
  subheader: string;
  footer: string;
  showLogo: boolean;
  showAddress: boolean;
  address: string;
  phone: string;
  showPoints: boolean;
  showTip: boolean;
  tipSuggestions: string;
  kitchenHeader: string;
  adminPin: string;
  kitchenShowCustomer: boolean;
  kitchenShowTable: boolean;
  kitchenShowType: boolean;
  kitchenShowTime: boolean;
};

const EMPTY: TicketConfig = {
  businessName: "", header: "", subheader: "", footer: "Gracias por su preferencia",
  showLogo: true, showAddress: true, address: "", phone: "",
  showPoints: true, showTip: true, tipSuggestions: "[10,15,20]",
  kitchenHeader: "*** COCINA ***", adminPin: "0000",
  kitchenShowCustomer: true, kitchenShowTable: true, kitchenShowType: true, kitchenShowTime: true,
};

export default function TicketConfigPage() {
  const [cfg, setCfg] = useState<TicketConfig>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/api/printers/ticket-config");
        setCfg({ ...EMPTY, ...data });
      } catch (e: any) {
        setError(e?.response?.data?.error || "No se pudo cargar la configuración");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function set<K extends keyof TicketConfig>(key: K, value: TicketConfig[K]) {
    setCfg(prev => ({ ...prev, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.put("/api/printers/ticket-config", cfg);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(e?.response?.data?.error || "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-gray-500">Cargando configuración…</div>;
  }

  return (
    <form onSubmit={handleSave} className="p-6 md:p-8 max-w-3xl mx-auto flex flex-col gap-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-black">Configuración de Tickets</h1>
        <p className="text-sm text-gray-500 mt-1">
          Estos cambios aplican a todos los tickets que imprima esta sucursal.
          Se comparten con la configuración del TPV.
        </p>
      </header>

      {/* Datos del negocio */}
      <section className="rounded-3xl border border-gray-200 bg-white p-5 md:p-6 shadow-sm flex flex-col gap-4">
        <h2 className="text-lg font-black">Datos del negocio</h2>

        <Field label="Nombre (aparece en el encabezado)">
          <input
            value={cfg.businessName}
            onChange={e => set("businessName", e.target.value)}
            className={inputCls}
            required
          />
        </Field>

        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Línea 2 (subheader, opcional)">
            <input value={cfg.header} onChange={e => set("header", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Línea 3 (opcional)">
            <input value={cfg.subheader} onChange={e => set("subheader", e.target.value)} className={inputCls} />
          </Field>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Dirección">
            <input value={cfg.address} onChange={e => set("address", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Teléfono">
            <input value={cfg.phone} onChange={e => set("phone", e.target.value)} className={inputCls} />
          </Field>
        </div>

        <Field label="Pie de página del ticket">
          <input value={cfg.footer} onChange={e => set("footer", e.target.value)} className={inputCls} />
        </Field>

        <div className="flex flex-wrap gap-3 pt-1">
          <Toggle label="Mostrar logo" checked={cfg.showLogo} onChange={v => set("showLogo", v)} />
          <Toggle label="Mostrar dirección" checked={cfg.showAddress} onChange={v => set("showAddress", v)} />
          <Toggle label="Mostrar puntos de lealtad" checked={cfg.showPoints} onChange={v => set("showPoints", v)} />
          <Toggle label="Sugerir propinas" checked={cfg.showTip} onChange={v => set("showTip", v)} />
        </div>

        <Field label='Sugerencias de propina (JSON array, ej. "[10,15,20]")'>
          <input
            value={cfg.tipSuggestions}
            onChange={e => set("tipSuggestions", e.target.value)}
            className={inputCls}
            placeholder="[10,15,20]"
          />
        </Field>
      </section>

      {/* Ticket de cocina */}
      <section className="rounded-3xl border border-gray-200 bg-white p-5 md:p-6 shadow-sm flex flex-col gap-4">
        <h2 className="text-lg font-black">Ticket de cocina</h2>

        <Field label="Encabezado">
          <input
            value={cfg.kitchenHeader}
            onChange={e => set("kitchenHeader", e.target.value)}
            className={inputCls}
          />
        </Field>

        <div className="flex flex-wrap gap-3 pt-1">
          <Toggle label="Mostrar cliente" checked={cfg.kitchenShowCustomer} onChange={v => set("kitchenShowCustomer", v)} />
          <Toggle label="Mostrar mesa" checked={cfg.kitchenShowTable} onChange={v => set("kitchenShowTable", v)} />
          <Toggle label="Mostrar tipo de orden" checked={cfg.kitchenShowType} onChange={v => set("kitchenShowType", v)} />
          <Toggle label="Mostrar hora" checked={cfg.kitchenShowTime} onChange={v => set("kitchenShowTime", v)} />
        </div>

        <p className="text-xs text-gray-400">
          Para editar la disposición visual exacta de los campos (drag-and-drop),
          usa el tab “Cocina” del modal de Configuración del TPV.
        </p>
      </section>

      {/* Seguridad */}
      <section className="rounded-3xl border border-gray-200 bg-white p-5 md:p-6 shadow-sm flex flex-col gap-4">
        <h2 className="text-lg font-black">Seguridad</h2>
        <Field label="PIN de administrador (4–6 dígitos)">
          <input
            type="password"
            inputMode="numeric"
            pattern="\d{4,6}"
            value={cfg.adminPin}
            onChange={e => set("adminPin", e.target.value)}
            className={inputCls}
          />
        </Field>
        <p className="text-xs text-gray-400">
          Se usa para desbloquear acciones sensibles en el TPV (anular cobros,
          abrir cajón manualmente).
        </p>
      </section>

      {/* Errors + save */}
      {error && (
        <div className="rounded-2xl border border-red-300 bg-red-50 text-red-800 p-4 text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 justify-end sticky bottom-0 py-3 bg-gray-50/80 backdrop-blur">
        {saved && <span className="text-sm font-bold text-green-600">✓ Guardado</span>}
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-black text-white text-sm font-black uppercase tracking-wide disabled:opacity-50 active:scale-95 transition-transform"
        >
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-gray-400";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-gray-500 mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  label, checked, onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="w-4 h-4"
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}
