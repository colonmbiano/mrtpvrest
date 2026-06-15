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
  logoUrl: string | null;
  showAddress: boolean;
  address: string;
  phone: string;
  // Datos fiscales del emisor (encabezado del recibo).
  businessType: string;
  rfc: string;
  // Bloque de autofactura por QR al pie del recibo.
  showInvoiceQr: boolean;
  invoiceUrl: string;
  invoiceFolioPrefix: string;
  // Bloque de QR de lealtad al pie del recibo: el cliente lo escanea para
  // registrarse en la tienda en línea y acumular puntos.
  showLoyaltyQr: boolean;
  loyaltyUrl: string;
  // Tipografía del recibo. fontFamily → Font A/B; fontSize → alto;
  // lineSpacing → interlineado; lineWeight → qué tan marcadas las líneas.
  paperWidth: string;
  fontFamily: string;
  fontSize: string;
  lineSpacing: string;
  lineWeight: string;
  // Opciones POR LÍNEA del recibo (de-clutter + detalle de cada producto).
  showItemsPrice: boolean;
  itemSpacing: string;        // "tight" | "normal" | "loose"
  showItemSeparator: boolean;
  modifierIndent: string;     // "none" | "normal" | "wide"
  receiptShowModifiers: boolean;
  receiptShowNotes: boolean;
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
  kitchenFontFamily: string;
  kitchenLineSpacing: string;
  kitchenLineWeight: string;
  kitchenTicketNameSize: string;
  kitchenFooter: string;
}

const EMPTY: TicketConfig = {
  businessName: "", header: "", subheader: "", footer: "Gracias por su preferencia",
  showLogo: true, logoUrl: null, showAddress: true, address: "", phone: "",
  businessType: "", rfc: "", showInvoiceQr: false, invoiceUrl: "", invoiceFolioPrefix: "",
  showLoyaltyQr: false, loyaltyUrl: "",
  paperWidth: "80mm", fontFamily: "monospace", fontSize: "medium",
  lineSpacing: "normal", lineWeight: "normal",
  showItemsPrice: true, itemSpacing: "normal", showItemSeparator: false,
  modifierIndent: "normal", receiptShowModifiers: true, receiptShowNotes: false,
  showPoints: true, showTip: true, tipSuggestions: "[10,15,20]",
  kitchenHeader: "", adminPin: "0000",
  kitchenShowCustomer: true, kitchenShowTable: true, kitchenShowType: true, kitchenShowTime: true,
  kitchenShowOrderNumber: true, kitchenShowModifiers: true, kitchenShowNotes: true,
  kitchenGroupBySeat: true, kitchenSeparateByGroup: false,
  kitchenFontSize: "large", kitchenFontFamily: "monospace",
  kitchenLineSpacing: "normal", kitchenLineWeight: "bold",
  kitchenTicketNameSize: "large", kitchenFooter: "",
};

type SubTab = "general" | "kitchen" | "security";

const inputCls = "w-full h-14 bg-[#121316] border border-white/5 rounded-2xl px-5 text-white font-bold focus:outline-none focus:border-amber-500 transition-colors";

export default function TicketFormatTab() {
  const [cfg, setCfg] = useState<TicketConfig>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sub, setSub] = useState<SubTab>("general");

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("image", file);
    try {
      const { data } = await api.post("/api/upload/image", fd);
      setCfg((c) => ({ ...c, logoUrl: data.url }));
      toast.success("Logo actualizado");
    } catch {
      toast.error("Error al subir el logo");
    } finally {
      setUploading(false);
    }
  };

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

            <Field label="Logo del ticket">
              <>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-[#121316] border border-white/5 flex items-center justify-center overflow-hidden shrink-0">
                    {cfg.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cfg.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-[9px] text-zinc-500 font-black uppercase text-center px-1">Sin logo</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="h-10 px-4 inline-flex items-center rounded-xl bg-[#121316] border border-white/5 text-[11px] font-black uppercase tracking-widest text-zinc-300 hover:border-iris-glow cursor-pointer transition-colors">
                      {uploading ? "Subiendo…" : "Subir logo"}
                      <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} disabled={uploading} />
                    </label>
                    {cfg.logoUrl && (
                      <button type="button" onClick={() => setCfg({ ...cfg, logoUrl: null })} className="text-[11px] font-bold text-red-400/80 hover:text-red-400 text-left">Eliminar logo</button>
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-zinc-500 mt-1.5 ml-1">Usa un logo monocromo (silueta) para mejor contraste térmico. El toggle &quot;Mostrar logo&quot; controla si se imprime.</p>
              </>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Encabezado línea 1"><input value={cfg.header} onChange={(e) => setCfg({ ...cfg, header: e.target.value })} className={inputCls} /></Field>
              <Field label="Encabezado línea 2"><input value={cfg.subheader} onChange={(e) => setCfg({ ...cfg, subheader: e.target.value })} className={inputCls} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Dirección"><input value={cfg.address} onChange={(e) => setCfg({ ...cfg, address: e.target.value })} className={inputCls} /></Field>
              <Field label="Teléfono"><input value={cfg.phone} onChange={(e) => setCfg({ ...cfg, phone: e.target.value })} className={inputCls} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Giro comercial"><input value={cfg.businessType} onChange={(e) => setCfg({ ...cfg, businessType: e.target.value })} className={inputCls} placeholder="Ej: Restaurante" /></Field>
              <Field label="RFC"><input value={cfg.rfc} onChange={(e) => setCfg({ ...cfg, rfc: e.target.value.toUpperCase() })} className={inputCls} placeholder="XAXX010101000" /></Field>
            </div>
            <Field label="Pie de página"><input value={cfg.footer} onChange={(e) => setCfg({ ...cfg, footer: e.target.value })} className={inputCls} /></Field>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <Toggle label="Mostrar logo" checked={cfg.showLogo} onChange={(v) => setCfg({ ...cfg, showLogo: v })} />
              <Toggle label="Mostrar dirección" checked={cfg.showAddress} onChange={(v) => setCfg({ ...cfg, showAddress: v })} />
              <Toggle label="Puntos de lealtad" checked={cfg.showPoints} onChange={(v) => setCfg({ ...cfg, showPoints: v })} />
              <Toggle label="Sugerir propinas" checked={cfg.showTip} onChange={(v) => setCfg({ ...cfg, showTip: v })} />
            </div>

            <SectionLabel>Factura (QR al pie del recibo)</SectionLabel>
            <Toggle label="Imprimir QR de autofactura" checked={cfg.showInvoiceQr} onChange={(v) => setCfg({ ...cfg, showInvoiceQr: v })} />
            {cfg.showInvoiceQr && (
              <div className="grid grid-cols-2 gap-4">
                <Field label="URL del portal de facturación"><input value={cfg.invoiceUrl} onChange={(e) => setCfg({ ...cfg, invoiceUrl: e.target.value })} className={inputCls} placeholder="https://facturacion.midominio.com" /></Field>
                <Field label="Prefijo de folio"><input value={cfg.invoiceFolioPrefix} onChange={(e) => setCfg({ ...cfg, invoiceFolioPrefix: e.target.value })} className={inputCls} placeholder="MB-" /></Field>
              </div>
            )}

            <SectionLabel>Puntos de lealtad (QR de registro)</SectionLabel>
            <Toggle label="Imprimir QR para acumular puntos" checked={cfg.showLoyaltyQr} onChange={(v) => setCfg({ ...cfg, showLoyaltyQr: v })} />
            {cfg.showLoyaltyQr && (
              <Field label="URL de la tienda / registro">
                <input value={cfg.loyaltyUrl} onChange={(e) => setCfg({ ...cfg, loyaltyUrl: e.target.value })} className={inputCls} placeholder="https://mitienda.mrtpvrest.com" />
              </Field>
            )}
            <p className="text-[10px] text-zinc-500 -mt-2 ml-1">El cliente escanea el QR al pie del recibo para registrarse en tu tienda en línea y acumular puntos.</p>

            <SectionLabel>Tipografía del recibo</SectionLabel>
            <Field label="Fuente — así se ve impresa">
              <FontPicker value={cfg.fontFamily} onChange={(v) => setCfg({ ...cfg, fontFamily: v })} />
            </Field>
            <Field label="Tamaño de letra">
              <SizePicker value={cfg.fontSize} onChange={(v) => setCfg({ ...cfg, fontSize: v })} />
            </Field>
            <Field label="Espaciado entre líneas">
              <Segmented value={cfg.lineSpacing} onChange={(v) => setCfg({ ...cfg, lineSpacing: v })} options={SPACING_OPTS} />
            </Field>
            <Field label="Líneas (negritas)">
              <Segmented value={cfg.lineWeight} onChange={(v) => setCfg({ ...cfg, lineWeight: v })} options={WEIGHT_OPTS} />
            </Field>

            <SectionLabel>Productos (cada línea)</SectionLabel>
            <div className="grid grid-cols-2 gap-3">
              <Toggle label="Mostrar precio por línea" checked={cfg.showItemsPrice} onChange={(v) => setCfg({ ...cfg, showItemsPrice: v })} />
              <Toggle label="Mostrar modificadores" checked={cfg.receiptShowModifiers} onChange={(v) => setCfg({ ...cfg, receiptShowModifiers: v })} />
              <Toggle label="Mostrar notas del producto" checked={cfg.receiptShowNotes} onChange={(v) => setCfg({ ...cfg, receiptShowNotes: v })} />
              <Toggle label="Línea separadora entre productos" checked={cfg.showItemSeparator} onChange={(v) => setCfg({ ...cfg, showItemSeparator: v })} />
            </div>
            <Field label="Espacio entre productos">
              <Segmented value={cfg.itemSpacing === "loose" ? "loose" : "normal"} onChange={(v) => setCfg({ ...cfg, itemSpacing: v })} options={ITEM_GAP_OPTS} />
            </Field>
            <Field label="Sangría de modificadores / notas">
              <Segmented value={cfg.modifierIndent} onChange={(v) => setCfg({ ...cfg, modifierIndent: v })} options={INDENT_OPTS} />
            </Field>

            <SectionLabel>Vista previa</SectionLabel>
            <ReceiptPreview cfg={cfg} />
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Papel térmico: la fuente real es A (estándar) o B (compacta); el tamaño escala el
              alto sin descuadrar los importes. &quot;Marcado&quot; usa negrita + doble golpe para líneas más negras.
            </p>
          </>
        )}

        {sub === "kitchen" && (
          <>
            <Field label="Título ticket cocina"><input value={cfg.kitchenHeader} onChange={(e) => setCfg({ ...cfg, kitchenHeader: e.target.value })} className={inputCls} placeholder="COMANDA" /></Field>

            {/* NOMBRE DEL TICKET — elemento principal */}
            <SectionLabel>Nombre del ticket (Mesa / cliente)</SectionLabel>
            <Field label="Tamaño del nombre — se imprime arriba y en grande">
              <Segmented value={cfg.kitchenTicketNameSize} onChange={(v) => setCfg({ ...cfg, kitchenTicketNameSize: v })} options={NAME_SIZE_OPTS} />
            </Field>

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
                    className={`flex flex-col items-center justify-center gap-0.5 h-16 rounded-2xl border transition-all ${active ? "bg-iris-500 border-iris-500 text-iris-fg" : "bg-[#121316] border-white/5 text-zinc-300 hover:border-iris-glow"}`}
                  >
                    <span className="text-xs font-black uppercase tracking-widest">{opt.label}</span>
                    <span className={`text-[10px] font-bold ${active ? "text-[#0a0a0c]/70" : "text-zinc-500"}`}>{opt.hint} ancho</span>
                  </button>
                );
              })}
            </div>

            <SectionLabel>Tipografía de la comanda</SectionLabel>
            <Field label="Fuente — así se ve impresa">
              <FontPicker value={cfg.kitchenFontFamily} onChange={(v) => setCfg({ ...cfg, kitchenFontFamily: v })} />
            </Field>
            <Field label="Espaciado entre líneas">
              <Segmented value={cfg.kitchenLineSpacing} onChange={(v) => setCfg({ ...cfg, kitchenLineSpacing: v })} options={SPACING_OPTS} />
            </Field>
            <Field label="Líneas (negritas)">
              <Segmented value={cfg.kitchenLineWeight} onChange={(v) => setCfg({ ...cfg, kitchenLineWeight: v })} options={WEIGHT_OPTS} />
            </Field>

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
          className="h-14 px-8 rounded-2xl bg-iris-500 text-iris-fg font-black uppercase tracking-widest text-xs active:scale-95 transition-transform disabled:opacity-60">
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}

function SubPill({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${active ? "bg-iris-500 text-iris-fg" : "bg-[#121316] text-zinc-400 hover:text-white"}`}>
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
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-[#121316] border border-white/5 hover:border-iris-glow transition-all">
      <span className="text-xs font-bold text-zinc-300 text-left leading-tight">{label}</span>
      <div className={`shrink-0 w-11 h-6 rounded-full relative transition-colors ${checked ? "bg-iris-500" : "bg-zinc-700"}`}>
        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${checked ? "right-1" : "left-1"}`} />
      </div>
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-black text-iris-500 uppercase tracking-[0.2em] pt-3 pb-1">
      {children}
    </p>
  );
}

/** Selector segmentado reutilizable para las opciones de tipografía. */
function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string; hint?: string }[];
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`flex flex-col items-center justify-center gap-0.5 h-14 rounded-2xl border transition-all ${active ? "bg-iris-500 border-iris-500 text-iris-fg" : "bg-[#121316] border-white/5 text-zinc-300 hover:border-iris-glow"}`}
          >
            <span className="text-[11px] font-black uppercase tracking-widest">{opt.label}</span>
            {opt.hint && <span className={`text-[9px] font-bold ${active ? "text-[#0a0a0c]/70" : "text-zinc-500"}`}>{opt.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Selector de FUENTE con vista previa. La térmica solo tiene 2 tipografías
 * físicas (A estándar y B compacta) — una tercera imprimiría idéntica a la A.
 * Cada tile renderiza un mini-recibo para que el ancho/tamaño real se vea
 * ANTES de elegir (la compacta cabe más pero sale más chica).
 */
function FontPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const opts = [
    { id: "monospace", label: "Estándar", note: "Tamaño normal", fontPx: 13, scaleX: 1, ls: 0 },
    { id: "sans-serif", label: "Compacta", note: "Más chica, cabe más", fontPx: 10, scaleX: 0.82, ls: -0.4 },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {opts.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`flex flex-col gap-1 p-3 rounded-2xl border text-left transition-all ${active ? "bg-iris-500/10 border-iris-500" : "bg-[#121316] border-white/5 hover:border-iris-glow"}`}
          >
            <span className={`text-[11px] font-black uppercase tracking-widest ${active ? "text-iris-500" : "text-zinc-300"}`}>{o.label}</span>
            <span className="text-[9px] font-bold text-zinc-500">{o.note}</span>
            <div className="mt-1 rounded-md bg-white text-black px-2 py-1.5 overflow-hidden">
              <div style={{ fontFamily: "'Courier New', ui-monospace, monospace", fontSize: o.fontPx, lineHeight: 1.3, letterSpacing: o.ls, transform: `scaleX(${o.scaleX})`, transformOrigin: "left" }}>
                <div className="flex justify-between gap-1"><span>Hamburguesa</span><span>$210</span></div>
                <div style={{ opacity: 0.65 }}>2 x $105.00</div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Selector de TAMAÑO con vista previa: 3 alturas reales (Normal/Grande/Extra)
 * mostrando el importe al alto que saldrá impreso, para que el tamaño no sea
 * sorpresa (caso "quedó muy pequeña").
 */
function SizePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const opts = [
    { id: "medium", label: "Normal", px: 13 },
    { id: "large", label: "Grande", px: 19 },
    { id: "xlarge", label: "Extra", px: 27 },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {opts.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`flex flex-col gap-1.5 p-2 rounded-2xl border transition-all ${active ? "bg-iris-500/10 border-iris-500" : "bg-[#121316] border-white/5 hover:border-iris-glow"}`}
          >
            <span className={`text-[11px] font-black uppercase tracking-widest text-center ${active ? "text-iris-500" : "text-zinc-300"}`}>{o.label}</span>
            <div className="rounded-md bg-white text-black flex items-center justify-center h-11 overflow-hidden">
              <span style={{ fontFamily: "'Courier New', ui-monospace, monospace", fontSize: o.px, fontWeight: 700, lineHeight: 1 }}>$210</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Mapeo tipografía → CSS para los previews ──────────────────────────────
const TYPO_FONT_CSS: Record<string, string> = {
  monospace: "'Courier New', ui-monospace, monospace",
  "sans-serif": "ui-sans-serif, system-ui, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
};
const typoLineHeight = (s: string) => (s === "tight" ? 1.2 : s === "loose" ? 1.85 : 1.5);
const reciboFontPx = (s: string) => (s === "xlarge" ? 17 : s === "large" ? 15 : s === "small" ? 11 : 13);

// Opciones de los selectores (alineadas a los enums de la DB). La fuente y el
// tamaño del recibo usan FontPicker/SizePicker (con vista previa); el resto
// siguen con el Segmented simple.
const SPACING_OPTS = [
  { id: "tight", label: "Compacto" },
  { id: "normal", label: "Normal" },
  { id: "loose", label: "Amplio" },
];
const WEIGHT_OPTS = [
  { id: "light", label: "Sencillo" },
  { id: "normal", label: "Normal" },
  { id: "bold", label: "Marcado" },
];
const NAME_SIZE_OPTS = [
  { id: "normal", label: "Normal", hint: "1×" },
  { id: "large", label: "Grande", hint: "2×" },
  { id: "xlarge", label: "Extra", hint: "3×" },
];
// Espacio vertical entre productos del recibo. "loose" mete una línea en blanco
// entre ítems (anti-amontonado); "normal" los deja juntos.
const ITEM_GAP_OPTS = [
  { id: "normal", label: "Juntos" },
  { id: "loose", label: "Con espacio" },
];
// Sangría de los modificadores/notas bajo cada producto.
const INDENT_OPTS = [
  { id: "none", label: "Ninguna" },
  { id: "normal", label: "Normal" },
  { id: "wide", label: "Amplia" },
];

/**
 * Vista previa del recibo del cliente. Refleja en pantalla la fuente, tamaño,
 * interlineado y peso elegidos (lo que el ESC/POS aplica al imprimir). Usa un
 * pedido de muestra fijo — no consulta datos reales.
 */
function ReceiptPreview({ cfg }: { cfg: TicketConfig }) {
  const fontCss = TYPO_FONT_CSS[cfg.fontFamily] ?? TYPO_FONT_CSS.monospace;
  const basePx = reciboFontPx(cfg.fontSize);
  const lh = typoLineHeight(cfg.lineSpacing);
  const bodyWeight = cfg.lineWeight === "bold" ? 700 : 400;
  const totalWeight = cfg.lineWeight === "light" ? 400 : 700;
  // Separador punteado al ancho del papel (espejo del builder ESC/POS).
  const dots = <div className="text-black/40 select-none tracking-tighter overflow-hidden whitespace-nowrap my-1">{".".repeat(48)}</div>;
  const indentPx = cfg.modifierIndent === "none" ? 0 : cfg.modifierIndent === "wide" ? 18 : 10;
  const itemGap = cfg.itemSpacing === "tight" ? 0 : 8;
  const SAMPLE = [
    { qty: 2, name: "Hamburguesa", unit: "$105.00", amount: "$210.00", mods: [{ name: "Tocino", add: "+$20.00" }], note: "Término medio" },
    { qty: 1, name: "Refresco", unit: "$35.00", amount: "$35.00", mods: [] as { name: string; add: string }[], note: "Sin hielo" },
  ];
  return (
    <div className="rounded-2xl bg-zinc-300/10 border border-white/5 p-4">
      <div
        className="mx-auto w-full max-w-[280px] bg-white text-black rounded-sm shadow-inner px-4 py-4"
        style={{ fontFamily: fontCss, fontSize: basePx, lineHeight: lh, fontWeight: bodyWeight }}
      >
        <div className="text-center" style={{ fontWeight: 700, fontSize: basePx + 3 }}>
          {cfg.businessName.trim() || "MI NEGOCIO"}
        </div>
        {cfg.showAddress && cfg.address.trim() && <div className="text-center">{cfg.address}</div>}
        {cfg.phone.trim() && <div className="text-center">Tel: {cfg.phone}</div>}
        <div className="text-center mt-2">{cfg.footer.trim() || "Gracias por su preferencia"}</div>
        <div className="text-center mt-2" style={{ fontWeight: 700 }}>RECIBO</div>
        {dots}
        <div className="flex justify-between gap-2"><span>Pedido:</span><span>#1042</span></div>
        <div className="flex justify-between gap-2"><span>Fecha:</span><span>11/06/2026 13:05</span></div>
        <div className="flex justify-between gap-2"><span>Empleado:</span><span>Propietario</span></div>
        {dots}
        <div>Para llevar</div>
        {dots}
        {SAMPLE.map((it, i) => (
          <div key={i} style={{ marginBottom: i < SAMPLE.length - 1 ? itemGap : 0 }}>
            <div className="flex justify-between gap-2">
              <span>{it.name}</span>
              {cfg.showItemsPrice && <span>{it.amount}</span>}
            </div>
            <div style={{ paddingLeft: 10, opacity: 0.75 }}>
              {cfg.showItemsPrice ? `${it.qty} x ${it.unit}` : `x ${it.qty}`}
            </div>
            {cfg.receiptShowModifiers && it.mods.map((m, j) => (
              <div key={j} className="flex justify-between gap-2" style={{ paddingLeft: indentPx, opacity: 0.75 }}>
                <span>+ {m.name}</span>
                {cfg.showItemsPrice && <span>{m.add}</span>}
              </div>
            ))}
            {cfg.receiptShowNotes && it.note && (
              <div style={{ paddingLeft: indentPx, opacity: 0.75 }}>&gt; {it.note}</div>
            )}
            {i < SAMPLE.length - 1 && cfg.showItemSeparator && dots}
          </div>
        ))}
        {dots}
        <div className="flex justify-between gap-2" style={{ fontWeight: 700 }}><span>Subtotal:</span><span>$211.21</span></div>
        <div className="flex justify-between gap-2"><span>IVA (16% incl.):</span><span>$33.79</span></div>
        {dots}
        <div className="flex justify-between gap-2" style={{ fontWeight: totalWeight, fontSize: basePx + 2 }}><span>TOTAL</span><span>$245.00</span></div>
        {dots}
        {cfg.showLoyaltyQr && (
          <div className="text-center mt-1">
            <div style={{ fontWeight: 700 }}>Acumula puntos</div>
            <div style={{ opacity: 0.75 }}>Escanea y regístrate</div>
            <div className="mx-auto mt-1 w-14 h-14 bg-black" style={{ clipPath: "polygon(0 0,100% 0,100% 100%,0 100%)" }} aria-label="QR" />
          </div>
        )}
      </div>
    </div>
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
  const itemWeight = cfg.kitchenLineWeight === "light" ? 600 : 900;
  const nameSizePx = cfg.kitchenTicketNameSize === "xlarge" ? 34 : cfg.kitchenTicketNameSize === "large" ? 24 : 13;

  const sep = <div className="text-zinc-400 select-none">{"-".repeat(32)}</div>;

  const seats = Array.from(new Set(SAMPLE.items.map((i) => i.seat))).sort((a, b) => a - b);
  const grouped = cfg.kitchenGroupBySeat && seats.length >= 2;

  const renderItem = (it: typeof SAMPLE.items[number], key: React.Key) => (
    <div key={key}>
      <div className={`text-black ${itemSizeCls}`} style={{ fontWeight: itemWeight }}>{it.quantity}x {it.name}</div>
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
        className="mx-auto w-full max-w-[260px] bg-white text-black rounded-sm shadow-inner px-4 py-4"
        style={{ fontFamily: TYPO_FONT_CSS[cfg.kitchenFontFamily] ?? TYPO_FONT_CSS.monospace, lineHeight: typoLineHeight(cfg.kitchenLineSpacing) }}
      >
        <div className="text-center">
          {cfg.kitchenHeader.trim() && (
            <div className="font-black text-[18px] tracking-wide">{cfg.kitchenHeader.trim()}</div>
          )}
          {cfg.kitchenSeparateByGroup && (
            <div className="font-black text-[16px]">COCINA</div>
          )}
          {cfg.kitchenShowTable && (
            <div className="font-black leading-tight text-black" style={{ fontSize: nameSizePx }}>Mesa {SAMPLE.tableNumber}</div>
          )}
          {cfg.kitchenShowCustomer && (
            <div className="font-black leading-tight text-black" style={{ fontSize: nameSizePx }}>{SAMPLE.customerName}</div>
          )}
          {cfg.kitchenShowOrderNumber && <div className="text-[13px]">#{SAMPLE.orderNumber}</div>}
          {cfg.kitchenShowTime && <div className="text-[13px]">{SAMPLE.time}</div>}
          {cfg.kitchenShowType && <div className="text-[13px]">{SAMPLE.orderTypeLabel}</div>}
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
