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

type KitchenFontSize = "normal" | "large" | "xlarge";

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
  kitchenShowOrderNumber: boolean;
  kitchenShowModifiers: boolean;
  kitchenShowNotes: boolean;
  kitchenGroupBySeat: boolean;
  kitchenSeparateByGroup: boolean;
  kitchenFontSize: KitchenFontSize;
  kitchenFooter: string;
}

const EMPTY: TicketConfig = {
  businessName: "", header: "", subheader: "", footer: "Gracias por su preferencia",
  showLogo: true, showAddress: true, address: "", phone: "",
  showPoints: true, showTip: true, tipSuggestions: "[10,15,20]",
  kitchenHeader: "COMANDA", adminPin: "0000",
  kitchenShowCustomer: true, kitchenShowTable: true, kitchenShowType: true, kitchenShowTime: true,
  kitchenShowOrderNumber: true, kitchenShowModifiers: true, kitchenShowNotes: true,
  kitchenGroupBySeat: true, kitchenSeparateByGroup: false,
  kitchenFontSize: "large", kitchenFooter: "",
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
      window.dispatchEvent(new Event("ticket-config-changed"));
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
            <Field label="Título ticket cocina"><input value={cfg.kitchenHeader} onChange={(e) => setCfg({ ...cfg, kitchenHeader: e.target.value })} className={inputCls} placeholder="COMANDA" /></Field>

            {/* QUÉ SE IMPRIME — encabezado */}
            <SectionLabel>Datos del encabezado</SectionLabel>
            <div className="grid grid-cols-2 gap-3">
              <Toggle label="Número de orden" checked={cfg.kitchenShowOrderNumber} onChange={(v) => setCfg({ ...cfg, kitchenShowOrderNumber: v })} />
              <Toggle label="Hora de impresión" checked={cfg.kitchenShowTime} onChange={(v) => setCfg({ ...cfg, kitchenShowTime: v })} />
              <Toggle label="Tipo de orden" checked={cfg.kitchenShowType} onChange={(v) => setCfg({ ...cfg, kitchenShowType: v })} />
              <Toggle label="Número de mesa" checked={cfg.kitchenShowTable} onChange={(v) => setCfg({ ...cfg, kitchenShowTable: v })} />
              <Toggle label="Nombre del cliente" checked={cfg.kitchenShowCustomer} onChange={(v) => setCfg({ ...cfg, kitchenShowCustomer: v })} />
            </div>

            {/* QUÉ SE IMPRIME — productos */}
            <SectionLabel>Detalle de productos</SectionLabel>
            <div className="grid grid-cols-2 gap-3">
              <Toggle label="Modificadores (+ extra, sin…)" checked={cfg.kitchenShowModifiers} onChange={(v) => setCfg({ ...cfg, kitchenShowModifiers: v })} />
              <Toggle label="Notas del producto" checked={cfg.kitchenShowNotes} onChange={(v) => setCfg({ ...cfg, kitchenShowNotes: v })} />
              <Toggle label="Agrupar por comensal" checked={cfg.kitchenGroupBySeat} onChange={(v) => setCfg({ ...cfg, kitchenGroupBySeat: v })} />
              <Toggle label="Ticket separado por estación" checked={cfg.kitchenSeparateByGroup} onChange={(v) => setCfg({ ...cfg, kitchenSeparateByGroup: v })} />
            </div>

            {/* CÓMO SE IMPRIME — tamaño */}
            <SectionLabel>Tamaño de los productos</SectionLabel>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: "normal", label: "Normal", hint: "1×" },
                { id: "large", label: "Grande", hint: "2×" },
                { id: "xlarge", label: "Extra", hint: "3×" },
              ] as { id: KitchenFontSize; label: string; hint: string }[]).map((opt) => {
                const active = cfg.kitchenFontSize === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setCfg({ ...cfg, kitchenFontSize: opt.id })}
                    className={`flex flex-col items-center justify-center gap-0.5 h-16 rounded-2xl border transition-all ${active ? "bg-amber-500 border-amber-500 text-[#0a0a0c]" : "bg-[#121316] border-white/5 text-zinc-300 hover:border-amber-500/30"}`}
                  >
                    <span className="text-xs font-black uppercase tracking-widest">{opt.label}</span>
                    <span className={`text-[10px] font-bold ${active ? "text-[#0a0a0c]/70" : "text-zinc-500"}`}>{opt.hint} ancho</span>
                  </button>
                );
              })}
            </div>

            <Field label="Pie de comanda (opcional)">
              <input value={cfg.kitchenFooter} onChange={(e) => setCfg({ ...cfg, kitchenFooter: e.target.value })} className={inputCls} placeholder="Ej: Verificar antes de servir" />
            </Field>

            {/* VISTA PREVIA EN VIVO */}
            <SectionLabel>Vista previa</SectionLabel>
            <KitchenPreview cfg={cfg} />
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Simulación de la comanda en papel térmico. &quot;Separado por estación&quot; divide la
              comanda en un ticket por grupo de impresoras (Cocina, Barra…) según el ruteo configurado.
            </p>
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
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-[#121316] border border-white/5 hover:border-amber-500/30 transition-all">
      <span className="text-xs font-bold text-zinc-300 text-left leading-tight">{label}</span>
      <div className={`shrink-0 w-11 h-6 rounded-full relative transition-colors ${checked ? "bg-amber-500" : "bg-zinc-700"}`}>
        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${checked ? "right-1" : "left-1"}`} />
      </div>
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-black text-amber-500/80 uppercase tracking-[0.2em] pt-3 pb-1">
      {children}
    </p>
  );
}

/**
 * Vista previa de la comanda. Replica la lógica de buildKitchenTicket()
 * (printer-tcp.ts) en texto plano para que el admin vea exactamente qué y
 * cómo se imprime al cambiar las opciones. Usa un pedido de muestra fijo
 * (hora 14:32, DINE_IN, 2 comensales) — no consulta datos reales.
 */
function KitchenPreview({ cfg }: { cfg: TicketConfig }) {
  const SAMPLE = {
    orderNumber: "TPV-001234",
    time: "14:32",
    orderTypeLabel: "Comer aquí",
    tableNumber: "5",
    customerName: "Juan P.",
    items: [
      { quantity: 2, name: "Hamburguesa BBQ", seat: 1, modifiers: ["Sin cebolla", "Extra queso"], notes: "Término medio" },
      { quantity: 1, name: "Papas grandes", seat: 1, modifiers: [], notes: "" },
      { quantity: 1, name: "Refresco cola", seat: 2, modifiers: [], notes: "Sin hielo" },
    ],
  };

  // Tamaño visual de los renglones de producto según fontSize.
  const itemSizeCls =
    cfg.kitchenFontSize === "normal" ? "text-[13px]" :
    cfg.kitchenFontSize === "xlarge" ? "text-[22px] leading-tight" : "text-[17px] leading-snug";

  const sep = <div className="text-zinc-400 select-none">{"-".repeat(32)}</div>;

  const seats = Array.from(new Set(SAMPLE.items.map((i) => i.seat))).sort((a, b) => a - b);
  const grouped = cfg.kitchenGroupBySeat && seats.length >= 2;

  const renderItem = (it: typeof SAMPLE.items[number], key: React.Key) => (
    <div key={key}>
      <div className={`font-black text-black ${itemSizeCls}`}>{it.quantity}x {it.name}</div>
      {cfg.kitchenShowModifiers && it.modifiers.map((m, i) => (
        <div key={`m${i}`} className="text-[12px] text-zinc-700 pl-3">+ {m}</div>
      ))}
      {cfg.kitchenShowNotes && it.notes && (
        <div className="text-[12px] text-zinc-700 pl-3">&gt; {it.notes}</div>
      )}
    </div>
  );

  return (
    <div className="rounded-2xl bg-zinc-300/10 border border-white/5 p-4">
      <div
        className="mx-auto w-full max-w-[260px] bg-white text-black rounded-sm shadow-inner px-4 py-4 font-mono"
        style={{ fontFamily: "'Courier New', ui-monospace, monospace" }}
      >
        <div className="text-center">
          {cfg.kitchenHeader.trim() && (
            <div className="font-black text-[18px] tracking-wide">{cfg.kitchenHeader.trim()}</div>
          )}
          {cfg.kitchenSeparateByGroup && (
            <div className="font-black text-[16px]">COCINA</div>
          )}
          {cfg.kitchenShowOrderNumber && <div className="text-[13px]">#{SAMPLE.orderNumber}</div>}
          {cfg.kitchenShowTime && <div className="text-[13px]">{SAMPLE.time}</div>}
          {cfg.kitchenShowType && <div className="text-[13px]">{SAMPLE.orderTypeLabel}</div>}
          {cfg.kitchenShowTable && <div className="text-[13px]">Mesa {SAMPLE.tableNumber}</div>}
          {cfg.kitchenShowCustomer && <div className="text-[13px]">{SAMPLE.customerName}</div>}
        </div>

        {sep}

        <div className="space-y-1">
          {grouped ? (
            seats.map((seat) => (
              <div key={seat} className="space-y-0.5">
                <div className="font-black text-[13px] text-black">COMENSAL {seat}</div>
                {SAMPLE.items.filter((i) => i.seat === seat).map((it, idx) => renderItem(it, `${seat}-${idx}`))}
              </div>
            ))
          ) : (
            SAMPLE.items.map((it, idx) => renderItem(it, idx))
          )}
        </div>

        {sep}

        {cfg.kitchenFooter.trim() && (
          <div className="text-center text-[12px] pt-1">{cfg.kitchenFooter.trim()}</div>
        )}
      </div>
    </div>
  );
}
