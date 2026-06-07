"use client";

/**
 * TicketFormatTab — configuración global del formato de tickets (recibo y
 * comanda) + PIN admin. Rescata el contenido del antiguo TicketConfigModal
 * (que estaba huérfano, sin entrada en la UI) y lo unifica al estilo de la
 * pantalla de impresión. Persiste en /api/printers/ticket-config.
 */

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import { Receipt, Printer as PrinterIcon, ShieldCheck } from "lucide-react";

interface TicketConfig {
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
}

const EMPTY: TicketConfig = {
  businessName: "", header: "", subheader: "", footer: "Gracias por su preferencia",
  showLogo: true, showAddress: true, address: "", phone: "",
  showPoints: true, showTip: true, tipSuggestions: "[10,15,20]",
  kitchenHeader: "*** COCINA ***", adminPin: "0000",
  kitchenShowCustomer: true, kitchenShowTable: true, kitchenShowType: true, kitchenShowTime: true,
};

type SubTab = "general" | "kitchen" | "security";

const inputCls = "w-full h-14 bg-[#121316] border border-white/5 rounded-2xl px-5 text-white font-bold focus:outline-none focus:border-amber-500 transition-colors";

export default function TicketFormatTab() {
  const [cfg, setCfg] = useState<TicketConfig>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sub, setSub] = useState<SubTab>("general");

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(async () => {
      try {
        const { data } = await api.get("/api/printers/ticket-config");
        if (!cancelled) setCfg({ ...EMPTY, ...data });
      } catch {
        if (!cancelled) toast.error("No se pudo cargar la configuración");
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const save = async () => {
    setSaving(true);
    const tid = toast.loading("Guardando…");
    try {
      await api.put("/api/printers/ticket-config", cfg);
      toast.success("Configuración guardada", { id: tid });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      toast.error("Error: " + (err.response?.data?.error || "fallo"), { id: tid });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="max-w-2xl">
      <div className="flex gap-2 mb-6">
        <SubPill active={sub === "general"} onClick={() => setSub("general")} icon={<Receipt size={14} />} label="General" />
        <SubPill active={sub === "kitchen"} onClick={() => setSub("kitchen")} icon={<PrinterIcon size={14} />} label="Cocina" />
        <SubPill active={sub === "security"} onClick={() => setSub("security")} icon={<ShieldCheck size={14} />} label="Seguridad" />
      </div>

      <div className="space-y-5">
        {sub === "general" && (
          <>
            <Field label="Nombre del negocio"><input value={cfg.businessName} onChange={(e) => setCfg({ ...cfg, businessName: e.target.value })} className={inputCls} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Encabezado línea 1"><input value={cfg.header} onChange={(e) => setCfg({ ...cfg, header: e.target.value })} className={inputCls} /></Field>
              <Field label="Encabezado línea 2"><input value={cfg.subheader} onChange={(e) => setCfg({ ...cfg, subheader: e.target.value })} className={inputCls} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Dirección"><input value={cfg.address} onChange={(e) => setCfg({ ...cfg, address: e.target.value })} className={inputCls} /></Field>
              <Field label="Teléfono"><input value={cfg.phone} onChange={(e) => setCfg({ ...cfg, phone: e.target.value })} className={inputCls} /></Field>
            </div>
            <Field label="Pie de página"><input value={cfg.footer} onChange={(e) => setCfg({ ...cfg, footer: e.target.value })} className={inputCls} /></Field>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <Toggle label="Mostrar logo" checked={cfg.showLogo} onChange={(v) => setCfg({ ...cfg, showLogo: v })} />
              <Toggle label="Mostrar dirección" checked={cfg.showAddress} onChange={(v) => setCfg({ ...cfg, showAddress: v })} />
              <Toggle label="Puntos de lealtad" checked={cfg.showPoints} onChange={(v) => setCfg({ ...cfg, showPoints: v })} />
              <Toggle label="Sugerir propinas" checked={cfg.showTip} onChange={(v) => setCfg({ ...cfg, showTip: v })} />
            </div>
          </>
        )}

        {sub === "kitchen" && (
          <>
            <Field label="Título ticket cocina"><input value={cfg.kitchenHeader} onChange={(e) => setCfg({ ...cfg, kitchenHeader: e.target.value })} className={inputCls} /></Field>
            <div className="space-y-3 pt-2">
              <Toggle label="Mostrar nombre del cliente" checked={cfg.kitchenShowCustomer} onChange={(v) => setCfg({ ...cfg, kitchenShowCustomer: v })} />
              <Toggle label="Mostrar número de mesa" checked={cfg.kitchenShowTable} onChange={(v) => setCfg({ ...cfg, kitchenShowTable: v })} />
              <Toggle label="Mostrar tipo de orden" checked={cfg.kitchenShowType} onChange={(v) => setCfg({ ...cfg, kitchenShowType: v })} />
              <Toggle label="Mostrar hora de impresión" checked={cfg.kitchenShowTime} onChange={(v) => setCfg({ ...cfg, kitchenShowTime: v })} />
            </div>
          </>
        )}

        {sub === "security" && (
          <>
            <Field label="PIN de administrador (4-6 dígitos)">
              <input type="password" value={cfg.adminPin} maxLength={6} onChange={(e) => setCfg({ ...cfg, adminPin: e.target.value })} className={inputCls} />
            </Field>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Se solicita en el TPV para acciones sensibles: anulación de pedidos pagados, apertura manual del cajón de dinero y descuentos especiales.
            </p>
          </>
        )}
      </div>

      <div className="pt-8">
        <button onClick={save} disabled={saving}
          className="h-14 px-8 rounded-2xl bg-amber-500 text-[#0a0a0c] font-black uppercase tracking-widest text-xs active:scale-95 transition-transform disabled:opacity-60">
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}

function SubPill({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${active ? "bg-amber-500 text-[#0a0a0c]" : "bg-[#121316] text-zinc-400 hover:text-white"}`}>
      {icon}{label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider ml-1">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center justify-between p-4 rounded-2xl bg-[#121316] border border-white/5 hover:border-amber-500/30 transition-all">
      <span className="text-xs font-bold text-zinc-300">{label}</span>
      <div className={`w-11 h-6 rounded-full relative transition-colors ${checked ? "bg-amber-500" : "bg-zinc-700"}`}>
        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${checked ? "right-1" : "left-1"}`} />
      </div>
    </button>
  );
}
