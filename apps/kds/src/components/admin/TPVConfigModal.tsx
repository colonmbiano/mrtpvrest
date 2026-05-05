"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";

type DisplaySettings = {
  gridSize?: number;
  gridCols?: number;
  sound?: string;
  showImages?: boolean;
  fontSize?: "xs" | "sm" | "md" | "lg" | "xl";
};

interface Props {
  onClose: () => void;
  settings?: DisplaySettings;
  onUpdate?: (settings: DisplaySettings) => void;
}

const PRINTER_TYPES = [
  { value:"KITCHEN",  label:"🍳 Cocina",   color:"#ef4444" },
  { value:"BAR",      label:"🍹 Barra",    color:"#3b82f6" },
  { value:"FRYER",    label:"🍟 Freidora", color:"#f97316" },
  { value:"CASHIER",  label:"💵 Caja",     color:"#22c55e" },
];

const CONNECTION_TYPES = [
  { value:"NETWORK",   label:"🌐 Red / WiFi",   desc:"IP + Puerto TCP (más común)" },
  { value:"USB",       label:"🔌 USB",           desc:"Conectada directo a esta PC" },
  { value:"BLUETOOTH", label:"📶 Bluetooth",     desc:"Conexión inalámbrica cercana" },
];

const GRID_OPTIONS = [
  { value:3, label:"3×3", desc:"Compacto" },
  { value:4, label:"4×4", desc:"Estándar" },
  { value:5, label:"5×5", desc:"Amplio" },
  { value:6, label:"6×6", desc:"Máximo" },
];

const SOUND_OPTIONS = [
  { value:"none",  label:"🔇 Sin sonido" },
  { value:"ding",  label:"🔔 Timbre" },
  { value:"chime", label:"🎵 Campanita" },
  { value:"beep",  label:"📳 Beep" },
];

const FONT_SIZES = [
  { value:"xs", label:"XS" },
  { value:"sm", label:"S"  },
  { value:"md", label:"M"  },
  { value:"lg", label:"L"  },
  { value:"xl", label:"XL" },
];

const KITCHEN_FIELDS = [
  { key:"kitchenHeader", label:"Encabezado",   defaultVal:"*** COCINA ***" },
  { key:"orderNumber",   label:"# Orden",       defaultVal:"ORD-0022" },
  { key:"customerName",  label:"👤 Cliente",     defaultVal:"Juan García" },
  { key:"tableNumber",   label:"🪑 Mesa",        defaultVal:"Mesa 5" },
  { key:"orderType",     label:"📦 Tipo",        defaultVal:"Para llevar" },
  { key:"orderTime",     label:"🕐 Hora",        defaultVal:"14:35" },
  { key:"items",         label:"🍔 Productos",   defaultVal:"2x BODEGON\n1x PAPAS" },
];

const PREVIEW_SIZE: Record<string,string> = {
  xs:"0.6rem", sm:"0.75rem", md:"0.875rem", lg:"1.1rem", xl:"1.4rem"
};

const emptyPrinter = {
  name:"", type:"KITCHEN", connectionType:"NETWORK",
  ip:"", port:9100, usbPort:"", bluetoothAddress:"", isActive:true, categories:[] as string[],
};

export default function TPVConfigModal({ onClose, settings, onUpdate }: Props) {
  const [tab, setTab] = useState<"printers"|"ticket"|"kitchen"|"display"|"zones">("printers");
  const [printers, setPrinters] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [config, setConfig] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState<string|null>(null);

  // Zones (áreas configurables del salón)
  const [zones, setZones] = useState<any[]>([]);
  const [zoneName, setZoneName] = useState("");
  const [zoneIcon, setZoneIcon] = useState("");
  const [zoneSaving, setZoneSaving] = useState(false);
  const [zoneError, setZoneError] = useState<string|null>(null);
  const [zoneEditing, setZoneEditing] = useState<string|null>(null);
  const [zoneEditName, setZoneEditName] = useState("");
  const [zoneEditIcon, setZoneEditIcon] = useState("");

  // Printer form
  const [showForm, setShowForm] = useState(false);
  const [editPrinter, setEditPrinter] = useState<any>(null);
  const [form, setForm] = useState<any>(emptyPrinter);
  const [savingPrinter, setSavingPrinter] = useState(false);

  // Bluetooth devices
  const [btDevices, setBtDevices] = useState<any[]>([]);
  const [scanningBt, setScanningBt] = useState(false);

  // Kitchen layout
  const [kitchenLayout, setKitchenLayout] = useState<any[]>([
    { key:"kitchenHeader", show:true, align:"center", size:"md", bold:true },
    { key:"orderNumber",   show:true, align:"center", size:"xl", bold:true },
    { key:"customerName",  show:true, align:"left",   size:"sm", bold:false },
    { key:"tableNumber",   show:true, align:"left",   size:"md", bold:true },
    { key:"orderType",     show:true, align:"left",   size:"sm", bold:false },
    { key:"orderTime",     show:true, align:"left",   size:"xs", bold:false },
    { key:"items",         show:true, align:"left",   size:"md", bold:true },
  ]);
  const [dragging, setDragging] = useState<number|null>(null);
  const [dragOver, setDragOver] = useState<number|null>(null);

  // Display
  const [gridSize, setGridSize] = useState(4);
  const [sound, setSound] = useState("ding");
  const [showImages, setShowImages] = useState(true);
  const [fontSize, setFontSize] = useState<"xs"|"sm"|"md"|"lg"|"xl">("md");

  useEffect(() => {
    const saved = localStorage.getItem("tpv-display-config");
    if (saved) {
      try {
        const cfg = JSON.parse(saved);
        setGridSize(cfg.gridSize || 4);
        setSound(cfg.sound || "ding");
        setShowImages(cfg.showImages !== false);
        setFontSize(cfg.fontSize || "md");
      } catch {}
    }
    fetchAll();
  }, []);

  useEffect(() => {
    if (!settings) return;
    const nextGrid = settings.gridSize || settings.gridCols;
    if (nextGrid) setGridSize(nextGrid);
    if (settings.fontSize) setFontSize(settings.fontSize);
    if (settings.showImages !== undefined) setShowImages(settings.showImages);
  }, [settings]);

  async function fetchAll() {
    try {
      const [p, c, cfg, z] = await Promise.all([
        api.get("/api/printers"),
        api.get("/api/menu/categories"),
        api.get("/api/printers/ticket-config"),
        api.get("/api/zones").catch(() => ({ data: [] })),
      ]);
      setPrinters(p.data || []);
      setCategories(c.data || []);
      const cfgData = cfg.data || {};
      setConfig(cfgData);
      if (cfgData.kitchenLayout) {
        try { setKitchenLayout(JSON.parse(cfgData.kitchenLayout)); } catch {}
      }
      setZones(z.data || []);
    } catch { setConfig({}); }
  }

  async function refreshZones() {
    try {
      const { data } = await api.get("/api/zones");
      setZones(data || []);
    } catch {}
  }

  async function createZone() {
    const name = zoneName.trim();
    if (!name) { setZoneError("Nombre requerido"); return; }
    setZoneSaving(true);
    setZoneError(null);
    try {
      await api.post("/api/zones", { name, icon: zoneIcon.trim() || null });
      setZoneName("");
      setZoneIcon("");
      await refreshZones();
    } catch (e: any) {
      setZoneError(e?.response?.data?.error || "No se pudo crear la zona");
    } finally {
      setZoneSaving(false);
    }
  }

  function startEditZone(z: any) {
    setZoneEditing(z.id);
    setZoneEditName(z.name);
    setZoneEditIcon(z.icon || "");
  }

  async function saveEditZone(id: string) {
    const name = zoneEditName.trim();
    if (!name) { setZoneError("Nombre requerido"); return; }
    setZoneError(null);
    try {
      await api.patch(`/api/zones/${id}`, { name, icon: zoneEditIcon.trim() || null });
      setZoneEditing(null);
      await refreshZones();
    } catch (e: any) {
      setZoneError(e?.response?.data?.error || "No se pudo actualizar");
    }
  }

  async function deleteZone(z: any) {
    if (!confirm(`¿Desactivar la zona "${z.name}"?\nLas mesas vinculadas quedarán "sin zona".`)) return;
    try {
      await api.delete(`/api/zones/${z.id}`);
      await refreshZones();
    } catch (e: any) {
      setZoneError(e?.response?.data?.error || "No se pudo desactivar");
    }
  }

  async function moveZone(idx: number, delta: number) {
    const next = idx + delta;
    if (next < 0 || next >= zones.length) return;
    const reordered = [...zones];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(next, 0, moved);
    setZones(reordered);
    try {
      await Promise.all(reordered.map((z, i) =>
        z.order === i ? null : api.patch(`/api/zones/${z.id}`, { order: i })
      ).filter(Boolean));
    } catch {
      await refreshZones();
    }
  }

  function openForm(printer?: any) {
    if (printer) {
      setEditPrinter(printer);
      setForm({
        name: printer.name,
        type: printer.type,
        connectionType: printer.connectionType || "NETWORK",
        ip: printer.ip || "",
        port: printer.port || 9100,
        usbPort: printer.usbPort || "",
        bluetoothAddress: printer.bluetoothAddress || "",
        isActive: printer.isActive,
        categories: Array.isArray(printer.categories) ? printer.categories : [],
      });
    } else {
      setEditPrinter(null);
      setForm({ ...emptyPrinter, categories: [] });
    }
    setShowForm(true);
  }

  async function savePrinter() {
    if (!form.name) { alert("Ingresa un nombre"); return; }
    setSavingPrinter(true);
    try {
      const payload = { ...form };
      // Según el tipo de conexión, limpiar campos irrelevantes
      if (form.connectionType === "NETWORK") { payload.usbPort = ""; payload.bluetoothAddress = ""; }
      if (form.connectionType === "USB") { payload.ip = ""; payload.bluetoothAddress = ""; }
      if (form.connectionType === "BLUETOOTH") { payload.ip = ""; payload.usbPort = ""; }

      if (editPrinter) await api.put(`/api/printers/${editPrinter.id}`, payload);
      else await api.post("/api/printers", payload);
      setShowForm(false);
      fetchAll();
    } catch (err: any) { alert(err.response?.data?.error || "Error al guardar"); }
    finally { setSavingPrinter(false); }
  }

  async function deletePrinter(id: string) {
    if (!confirm("¿Eliminar esta impresora?")) return;
    try { await api.delete(`/api/printers/${id}`); fetchAll(); }
    catch (err: any) { alert(err.response?.data?.error || "Error"); }
  }

  async function testPrinter(printer: any) {
    setTesting(printer.id);
    try { await api.post(`/api/printers/${printer.id}/test`); alert(`✅ Prueba enviada a ${printer.name}`); }
    catch { alert("❌ No se pudo conectar a la impresora"); }
    finally { setTesting(null); }
  }

  async function scanBluetooth() {
    setScanningBt(true);
    try {
      if (!(navigator as any).bluetooth) { alert("Este navegador no soporta Bluetooth Web API\nUsa Chrome en Android/PC"); setScanningBt(false); return; }
      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
      });
      setBtDevices(p => [...p, { name: device.name, id: device.id }]);
      setForm((f: any) => ({ ...f, bluetoothAddress: device.id, name: f.name || device.name }));
    } catch (e: any) {
      if (!e.message?.includes('cancelled')) alert("No se encontró impresora Bluetooth");
    } finally { setScanningBt(false); }
  }

  async function saveTicketConfig() {
    setSaving(true);
    try { await api.put("/api/printers/ticket-config", config); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    catch (err: any) { alert(err.response?.data?.error || "Error"); }
    finally { setSaving(false); }
  }

  async function saveKitchenConfig() {
    setSaving(true);
    try {
      await api.put("/api/printers/ticket-config", { ...config, kitchenLayout: JSON.stringify(kitchenLayout) });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (err: any) { alert(err.response?.data?.error || "Error"); }
    finally { setSaving(false); }
  }

  function publishDisplayConfig(patch: DisplaySettings = {}) {
    const next = {
      gridSize,
      gridCols: gridSize,
      sound,
      showImages,
      fontSize,
      ...patch,
    };
    if (patch.gridSize) next.gridCols = patch.gridSize;
    if (patch.gridCols) next.gridSize = patch.gridCols;
    localStorage.setItem("tpv-display-config", JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("tpv-config-changed", { detail: next }));
    onUpdate?.(next);
  }

  function saveDisplayConfig() {
    publishDisplayConfig();
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  function updateField(idx: number, patch: any) {
    setKitchenLayout(p => p.map((f, i) => i === idx ? { ...f, ...patch } : f));
  }

  function moveField(from: number, to: number) {
    const next = [...kitchenLayout];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setKitchenLayout(next);
  }

  function toggleCategory(catId: string) {
    setForm((p: any) => ({
      ...p,
      categories: p.categories.includes(catId)
        ? p.categories.filter((c: string) => c !== catId)
        : [...p.categories, catId]
    }));
  }

  const tabs = [
    { id:"printers", label:"🖨️ Impresoras" },
    { id:"ticket",   label:"🧾 Cobro" },
    { id:"kitchen",  label:"🍳 Cocina" },
    { id:"display",  label:"🖥️ Pantalla" },
    { id:"zones",    label:"🏷️ Zonas" },
  ];

  const connTypeColor: Record<string,string> = { NETWORK:"#3b82f6", USB:"#f97316", BLUETOOTH:"#8b5cf6" };
  const connTypeLabel: Record<string,string> = { NETWORK:"🌐 Red", USB:"🔌 USB", BLUETOOTH:"📶 BT" };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-3xl border overflow-hidden flex flex-col"
        style={{background:"var(--surf)", borderColor:"var(--border)", maxHeight:"88vh"}}>

        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b flex-shrink-0"
          style={{borderColor:"var(--border)", background:"var(--bg)"}}>
          <h2 className="font-syne font-black text-xl">⚙️ Configuración TPV</h2>
          <button onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center font-bold"
            style={{background:"rgba(239,68,68,0.1)",color:"#ef4444"}}>✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b flex-shrink-0 overflow-x-auto" style={{borderColor:"var(--border)"}}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              className="flex-1 py-3 text-xs font-bold transition-all whitespace-nowrap px-2"
              style={{
                background: tab===t.id ? "var(--surf)" : "var(--surf2)",
                color: tab===t.id ? "var(--gold)" : "var(--muted)",
                borderBottom: tab===t.id ? "2px solid var(--gold)" : "2px solid transparent",
                minWidth:"80px"
              }}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">

          {/* ══ IMPRESORAS ══ */}
          {tab === "printers" && (
            <div className="flex flex-col gap-4">

              {/* Botón agregar */}
              <button onClick={() => openForm()}
                className="w-full py-3 rounded-2xl font-syne font-black text-sm flex items-center justify-center gap-2"
                style={{background:"rgba(245,166,35,0.1)",color:"var(--gold)",border:"2px dashed rgba(245,166,35,0.3)"}}>
                ➕ Agregar nueva impresora
              </button>

              {/* Lista */}
              {printers.length === 0 ? (
                <div className="text-center py-10 rounded-2xl border border-dashed" style={{borderColor:"var(--border)",color:"var(--muted)"}}>
                  <div className="text-4xl mb-2">🖨️</div>
                  <div className="text-sm font-bold">No hay impresoras</div>
                </div>
              ) : printers.map((printer: any) => {
                const typeInfo = PRINTER_TYPES.find(t => t.value === printer.type);
                const connType = printer.connectionType || "NETWORK";
                return (
                  <div key={printer.id} className="rounded-2xl border overflow-hidden"
                    style={{background:"var(--surf2)", borderColor: printer.isActive ? (typeInfo?.color || "#888")+"40" : "var(--border)", opacity: printer.isActive ? 1 : 0.6}}>
                    <div className="p-4 flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                        style={{background:(typeInfo?.color||"#888")+"15"}}>🖨️</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold">{printer.name}</div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                            style={{background:(typeInfo?.color||"#888")+"15",color:typeInfo?.color||"#888"}}>
                            {typeInfo?.label || printer.type}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                            style={{background:(connTypeColor[connType]||"#888")+"15",color:connTypeColor[connType]||"#888"}}>
                            {connTypeLabel[connType] || connType}
                          </span>
                          {connType === "NETWORK" && printer.ip && (
                            <span className="text-xs" style={{color:"var(--muted)"}}>{printer.ip}:{printer.port}</span>
                          )}
                          {connType === "USB" && printer.usbPort && (
                            <span className="text-xs" style={{color:"var(--muted)"}}>{printer.usbPort}</span>
                          )}
                          {connType === "BLUETOOTH" && printer.bluetoothAddress && (
                            <span className="text-xs font-mono" style={{color:"var(--muted)"}}>{printer.bluetoothAddress.slice(0,8)}...</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <div className="w-2 h-2 rounded-full" style={{background: printer.isActive ? "#22c55e" : "#ef4444"}} />
                        <span className="text-xs font-bold" style={{color: printer.isActive ? "#22c55e" : "#ef4444"}}>
                          {printer.isActive ? "Activa" : "Inactiva"}
                        </span>
                      </div>
                    </div>
                    {/* Acciones */}
                    <div className="flex border-t" style={{borderColor:"var(--border)"}}>
                      <button onClick={() => testPrinter(printer)} disabled={testing === printer.id}
                        className="flex-1 py-2 text-xs font-bold"
                        style={{color:"var(--muted)"}}>
                        {testing === printer.id ? "⏳ Probando..." : "🖨️ Probar"}
                      </button>
                      <div className="w-px" style={{background:"var(--border)"}} />
                      <button onClick={() => openForm(printer)}
                        className="flex-1 py-2 text-xs font-bold"
                        style={{color:"var(--gold)"}}>✏️ Editar</button>
                      <div className="w-px" style={{background:"var(--border)"}} />
                      <button onClick={() => deletePrinter(printer.id)}
                        className="flex-1 py-2 text-xs font-bold"
                        style={{color:"#ef4444"}}>🗑️ Eliminar</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ══ TICKET DE COBRO ══ */}
          {tab === "ticket" && config && (
            <div className="flex flex-col gap-4">
              <div className="rounded-2xl border p-4" style={{background:"var(--surf2)",borderColor:"var(--border)"}}>
                <div className="text-xs font-black uppercase tracking-wider mb-3" style={{color:"var(--gold)"}}>Encabezado</div>
                <div className="flex flex-col gap-3">
                  {[
                    {label:"Nombre del negocio", field:"businessName", placeholder:"Master Burger's"},
                    {label:"Encabezado",          field:"header",       placeholder:"¡Bienvenido!"},
                    {label:"Dirección",           field:"address",      placeholder:"Calle, Ciudad"},
                    {label:"Teléfono",            field:"phone",        placeholder:"722 000 0000"},
                    {label:"Pie de página",       field:"footer",       placeholder:"¡Gracias por su visita!"},
                  ].map(f => (
                    <div key={f.field}>
                      <label className="block text-xs font-bold mb-1" style={{color:"var(--muted)"}}>{f.label}</label>
                      <input value={config[f.field]||""} onChange={e => setConfig((p: any) => ({...p,[f.field]:e.target.value}))}
                        placeholder={f.placeholder}
                        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                        style={{background:"var(--surf)",border:"1px solid var(--border)",color:"var(--text)"}} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border overflow-hidden" style={{borderColor:"var(--border)"}}>
                <div className="px-4 py-3 border-b" style={{borderColor:"var(--border)",background:"var(--surf2)"}}>
                  <div className="text-xs font-black uppercase tracking-wider" style={{color:"var(--gold)"}}>Opciones</div>
                </div>
                {[
                  {label:"Mostrar nombre del negocio", field:"showLogo"},
                  {label:"Mostrar dirección",          field:"showAddress"},
                  {label:"Propina sugerida (10/15/20%)", field:"showTip"},
                ].map(opt => (
                  <div key={opt.field} className="flex items-center justify-between px-4 py-3 border-b last:border-0" style={{borderColor:"var(--border)"}}>
                    <div className="text-sm font-medium">{opt.label}</div>
                    <button onClick={() => setConfig((p: any) => ({...p,[opt.field]:!p?.[opt.field]}))}
                      className="w-12 h-6 rounded-full transition-all relative flex-shrink-0"
                      style={{background:config[opt.field]?"var(--gold)":"var(--surf2)"}}>
                      <div className="w-5 h-5 rounded-full absolute top-0.5 transition-all bg-white"
                        style={{left:config[opt.field]?"26px":"2px"}} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl border p-4" style={{background:"var(--surf2)",borderColor:"var(--border)"}}>
                <div className="text-xs font-black uppercase tracking-wider mb-3" style={{color:"var(--muted)"}}>Preview</div>
                <div className="rounded-xl p-4 font-mono text-xs mx-auto max-w-xs" style={{background:"#1a1a1a",color:"white",border:"1px solid var(--border)"}}>
                  <div className="text-center font-bold text-sm">{config.businessName||"Master Burger's"}</div>
                  {config.showLogo&&config.header&&<div className="text-center">{config.header}</div>}
                  {config.showAddress&&config.address&&<div className="text-center text-xs opacity-70">{config.address}</div>}
                  {config.phone&&<div className="text-center text-xs opacity-70">Tel: {config.phone}</div>}
                  <div className="border-t my-2 opacity-30"/>
                  <div className="flex justify-between"><span>1x Bodegon</span><span>$120</span></div>
                  <div className="border-t my-2 opacity-30"/>
                  <div className="flex justify-between font-bold"><span>TOTAL:</span><span>$120</span></div>
                  {config.showTip&&<div className="text-center mt-1 opacity-70">10%=$12 · 15%=$18 · 20%=$24</div>}
                  {config.footer&&<div className="text-center mt-2 font-bold">{config.footer}</div>}
                </div>
              </div>
              <button onClick={saveTicketConfig} disabled={saving}
                className="w-full py-3 rounded-2xl font-syne font-black"
                style={{background:saved?"#22c55e":saving?"var(--muted)":"var(--gold)",color:"#000"}}>
                {saved?"✅ Guardado":saving?"Guardando...":"💾 Guardar"}
              </button>
            </div>
          )}

          {/* ══ TICKET DE COCINA ══ */}
          {tab === "kitchen" && config && (
            <div className="flex flex-col gap-4">
              <div className="rounded-2xl border p-4" style={{background:"var(--surf2)",borderColor:"var(--border)"}}>
                <div className="text-xs font-black uppercase tracking-wider mb-3" style={{color:"var(--gold)"}}>Encabezado cocina</div>
                <input value={config.kitchenHeader||""} onChange={e => setConfig((p: any) => ({...p,kitchenHeader:e.target.value}))}
                  placeholder="*** COCINA ***"
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{background:"var(--surf)",border:"1px solid var(--border)",color:"var(--text)"}} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-black uppercase tracking-wider mb-3 flex justify-between" style={{color:"var(--gold)"}}>
                    <span>Campos</span><span className="font-normal normal-case" style={{color:"var(--muted)"}}>↕ arrastra</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {kitchenLayout.map((field, idx) => {
                      const meta = KITCHEN_FIELDS.find(f => f.key===field.key);
                      return (
                        <div key={field.key} draggable
                          onDragStart={() => setDragging(idx)}
                          onDragOver={e => { e.preventDefault(); setDragOver(idx); }}
                          onDrop={() => { if (dragging!==null) moveField(dragging,idx); setDragging(null); setDragOver(null); }}
                          onDragEnd={() => { setDragging(null); setDragOver(null); }}
                          className="rounded-xl border p-3 cursor-grab"
                          style={{background:dragOver===idx?"rgba(245,166,35,0.08)":"var(--surf2)",borderColor:dragOver===idx?"var(--gold)":"var(--border)",opacity:dragging===idx?0.5:1}}>
                          <div className="flex items-center gap-2 mb-2">
                            <span>⠿</span>
                            <span className="text-xs font-bold flex-1">{meta?.label}</span>
                            <button onClick={() => updateField(idx,{show:!field.show})}
                              className="w-9 h-5 rounded-full transition-all relative"
                              style={{background:field.show?"var(--gold)":"var(--surf)"}}>
                              <div className="w-4 h-4 rounded-full absolute top-0.5 transition-all bg-white"
                                style={{left:field.show?"20px":"2px"}} />
                            </button>
                          </div>
                          {field.show && (
                            <div className="flex gap-2">
                              <div className="flex-1">
                                <div className="flex gap-1">
                                  {FONT_SIZES.map(s => (
                                    <button key={s.value} onClick={() => updateField(idx,{size:s.value})}
                                      className="flex-1 py-1 rounded-lg text-xs font-bold"
                                      style={{background:field.size===s.value?"var(--gold)":"var(--surf)",color:field.size===s.value?"#000":"var(--muted)"}}>
                                      {s.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <button onClick={() => updateField(idx,{bold:!field.bold})}
                                className="px-3 py-1 rounded-lg text-xs font-black"
                                style={{background:field.bold?"var(--gold)":"var(--surf)",color:field.bold?"#000":"var(--muted)"}}>B</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-black uppercase tracking-wider mb-3" style={{color:"var(--gold)"}}>Preview</div>
                  <div className="rounded-xl border p-4 font-mono sticky top-0" style={{background:"#1a1a1a",borderColor:"var(--border)",minHeight:"200px"}}>
                    {kitchenLayout.filter(f => f.show).map((field, idx) => {
                      const meta = KITCHEN_FIELDS.find(f => f.key===field.key);
                      const val = field.key==="kitchenHeader"?(config.kitchenHeader||meta?.defaultVal):meta?.defaultVal;
                      return (
                        <div key={idx} style={{textAlign:field.align as any,fontSize:PREVIEW_SIZE[field.size]||"0.875rem",fontWeight:field.bold?"bold":"normal",color:"white",marginBottom:"4px",borderBottom:field.key==="kitchenHeader"?"1px solid #444":"none",paddingBottom:field.key==="kitchenHeader"?"4px":"0"}}>
                          {field.key==="items"?(
                            <div>
                              <div style={{fontWeight:field.bold?"bold":"normal"}}>2x BODEGON</div>
                              <div style={{fontSize:"0.6rem",opacity:0.7}}>*** Sin cebolla ***</div>
                              <div>1x PAPAS</div>
                            </div>
                          ):val}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <button onClick={saveKitchenConfig} disabled={saving}
                className="w-full py-3 rounded-2xl font-syne font-black"
                style={{background:saved?"#22c55e":saving?"var(--muted)":"var(--gold)",color:"#000"}}>
                {saved?"✅ Guardado":saving?"Guardando...":"💾 Guardar ticket de cocina"}
              </button>
            </div>
          )}

          {/* ══ PANTALLA ══ */}
          {tab === "display" && (
            <div className="flex flex-col gap-4">
              <div className="rounded-2xl border p-4" style={{background:"var(--surf2)",borderColor:"var(--border)"}}>
                <div className="text-xs font-black uppercase tracking-wider mb-3" style={{color:"var(--gold)"}}>Cuadrícula de productos</div>
                <div className="grid grid-cols-4 gap-2">
                  {GRID_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => { setGridSize(opt.value); publishDisplayConfig({ gridSize: opt.value, gridCols: opt.value }); }}
                      className="py-3 rounded-xl flex flex-col items-center gap-1 border-2 transition-all"
                      style={{background:gridSize===opt.value?"rgba(245,166,35,0.1)":"var(--surf)",borderColor:gridSize===opt.value?"var(--gold)":"var(--border)"}}>
                      <span className="font-syne font-black text-lg" style={{color:gridSize===opt.value?"var(--gold)":"var(--text)"}}>{opt.label}</span>
                      <span className="text-xs" style={{color:"var(--muted)"}}>{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border p-4" style={{background:"var(--surf2)",borderColor:"var(--border)"}}>
                <div className="text-xs font-black uppercase tracking-wider mb-3" style={{color:"var(--gold)"}}>Tamaño de texto</div>
                <div className="grid grid-cols-3 gap-2">
                  {[{value:"sm",label:"Pequeño"},{value:"md",label:"Mediano"},{value:"lg",label:"Grande"}].map(opt => (
                    <button key={opt.value} onClick={() => { setFontSize(opt.value as any); publishDisplayConfig({ fontSize: opt.value as any }); }}
                      className="py-2.5 rounded-xl font-bold text-sm border-2 transition-all"
                      style={{background:fontSize===opt.value?"rgba(245,166,35,0.1)":"var(--surf)",borderColor:fontSize===opt.value?"var(--gold)":"var(--border)",color:fontSize===opt.value?"var(--gold)":"var(--muted)"}}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border overflow-hidden" style={{borderColor:"var(--border)"}}>
                <div className="px-4 py-3 border-b" style={{borderColor:"var(--border)",background:"var(--surf2)"}}>
                  <div className="text-xs font-black uppercase tracking-wider" style={{color:"var(--gold)"}}>Visual</div>
                </div>
                <div className="flex items-center justify-between px-4 py-3" style={{borderColor:"var(--border)"}}>
                  <div>
                    <div className="text-sm font-medium">Mostrar imágenes</div>
                    <div className="text-xs" style={{color:"var(--muted)"}}>Ocultar para un TPV más rápido</div>
                  </div>
                  <button onClick={() => { const next = !showImages; setShowImages(next); publishDisplayConfig({ showImages: next }); }}
                    className="w-12 h-6 rounded-full transition-all relative"
                    style={{background:showImages?"var(--gold)":"var(--surf2)"}}>
                    <div className="w-5 h-5 rounded-full absolute top-0.5 transition-all bg-white"
                      style={{left:showImages?"26px":"2px"}} />
                  </button>
                </div>
              </div>
              <div className="rounded-2xl border p-4" style={{background:"var(--surf2)",borderColor:"var(--border)"}}>
                <div className="text-xs font-black uppercase tracking-wider mb-3" style={{color:"var(--gold)"}}>Sonido al recibir pedido</div>
                <div className="flex flex-col gap-2">
                  {SOUND_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => { setSound(opt.value); publishDisplayConfig({ sound: opt.value }); }}
                      className="py-2.5 px-4 rounded-xl text-sm font-bold text-left border-2 transition-all"
                      style={{background:sound===opt.value?"rgba(245,166,35,0.1)":"var(--surf)",borderColor:sound===opt.value?"var(--gold)":"var(--border)",color:sound===opt.value?"var(--gold)":"var(--muted)"}}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={saveDisplayConfig}
                className="w-full py-3 rounded-2xl font-syne font-black"
                style={{background:saved?"#22c55e":"var(--gold)",color:"#000"}}>
                {saved?"✅ Guardado":"💾 Guardar configuración"}
              </button>
            </div>
          )}

          {/* ══ ZONAS ══ */}
          {tab === "zones" && (
            <div className="flex flex-col gap-4">
              <div className="rounded-2xl border p-4" style={{background:"var(--surf2)",borderColor:"var(--border)"}}>
                <div className="text-xs font-black uppercase tracking-wider mb-1" style={{color:"var(--gold)"}}>Áreas del salón</div>
                <p className="text-xs mb-3" style={{color:"var(--muted)"}}>
                  Crea las zonas de tu negocio: <b>Mostrador</b>, <b>Terraza</b>, <b>Barra</b>, <b>Patio</b>, etc. Cada mesa puede asignarse a una. Las mesas sin zona aparecen como <i>Sin zona</i>.
                </p>

                {/* Form crear */}
                <div className="flex gap-2 mb-3">
                  <input
                    value={zoneIcon}
                    onChange={e => setZoneIcon(e.target.value)}
                    maxLength={4}
                    placeholder="🌴"
                    className="w-14 px-2 py-2 rounded-xl text-center text-lg outline-none"
                    style={{background:"var(--surf)",border:"1px solid var(--border)",color:"var(--text)"}}
                  />
                  <input
                    value={zoneName}
                    onChange={e => setZoneName(e.target.value)}
                    placeholder="Nombre (ej. Terraza)"
                    onKeyDown={e => { if (e.key === 'Enter') createZone(); }}
                    className="flex-1 px-3 py-2 rounded-xl text-sm outline-none"
                    style={{background:"var(--surf)",border:"1px solid var(--border)",color:"var(--text)"}}
                  />
                  <button
                    onClick={createZone}
                    disabled={zoneSaving || !zoneName.trim()}
                    className="px-4 py-2 rounded-xl font-bold text-sm"
                    style={{background:zoneSaving?"var(--muted)":"var(--gold)",color:"#000",opacity:!zoneName.trim()?0.5:1}}>
                    {zoneSaving?"…":"➕ Crear"}
                  </button>
                </div>

                {zoneError && (
                  <div className="text-xs p-2 rounded-xl mb-3" style={{background:"rgba(239,68,68,0.1)",color:"#ef4444"}}>
                    {zoneError}
                  </div>
                )}

                {/* Lista */}
                {zones.length === 0 ? (
                  <div className="text-xs text-center py-6" style={{color:"var(--muted)"}}>
                    Aún no hay zonas. Empieza creando la primera arriba.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {zones.map((z, idx) => (
                      <div key={z.id}
                        className="flex items-center gap-2 p-2 rounded-xl"
                        style={{background:"var(--surf)",border:"1px solid var(--border)"}}>
                        {zoneEditing === z.id ? (
                          <>
                            <input
                              value={zoneEditIcon}
                              onChange={e => setZoneEditIcon(e.target.value)}
                              maxLength={4}
                              className="w-12 px-2 py-1.5 rounded-lg text-center text-base outline-none"
                              style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}}
                            />
                            <input
                              value={zoneEditName}
                              onChange={e => setZoneEditName(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveEditZone(z.id); if (e.key === 'Escape') setZoneEditing(null); }}
                              autoFocus
                              className="flex-1 px-2 py-1.5 rounded-lg text-sm outline-none"
                              style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}}
                            />
                            <button onClick={() => saveEditZone(z.id)}
                              className="w-8 h-8 rounded-lg text-sm" style={{background:"var(--gold)",color:"#000"}}>✓</button>
                            <button onClick={() => setZoneEditing(null)}
                              className="w-8 h-8 rounded-lg text-sm" style={{background:"var(--surf2)",color:"var(--muted)"}}>✕</button>
                          </>
                        ) : (
                          <>
                            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0"
                              style={{background:"var(--surf2)"}}>
                              {z.icon || "📍"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-sm truncate">{z.name}</div>
                              <div className="text-xs" style={{color:"var(--muted)"}}>
                                {z.tablesCount ?? 0} mesa{(z.tablesCount ?? 0) === 1 ? "" : "s"}
                              </div>
                            </div>
                            <button onClick={() => moveZone(idx, -1)}
                              disabled={idx === 0}
                              className="w-7 h-7 rounded-lg text-xs"
                              style={{background:"var(--surf2)",color:"var(--muted)",opacity:idx===0?0.3:1}}>↑</button>
                            <button onClick={() => moveZone(idx, 1)}
                              disabled={idx === zones.length - 1}
                              className="w-7 h-7 rounded-lg text-xs"
                              style={{background:"var(--surf2)",color:"var(--muted)",opacity:idx===zones.length-1?0.3:1}}>↓</button>
                            <button onClick={() => startEditZone(z)}
                              className="w-8 h-8 rounded-lg text-sm" style={{background:"var(--surf2)",color:"var(--muted)"}}>✏️</button>
                            <button onClick={() => deleteZone(z)}
                              className="w-8 h-8 rounded-lg text-sm" style={{background:"rgba(239,68,68,0.1)",color:"#ef4444"}}>🗑</button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══ MODAL FORMULARIO IMPRESORA ══ */}
      {showForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{background:"rgba(0,0,0,0.9)"}}>
          <div className="w-full max-w-md rounded-3xl border overflow-hidden flex flex-col"
            style={{background:"var(--surf)",borderColor:"var(--border)",maxHeight:"90vh"}}>
            <div className="px-6 py-4 flex items-center justify-between border-b flex-shrink-0"
              style={{borderColor:"var(--border)",background:"var(--bg)"}}>
              <h3 className="font-syne font-black text-lg">{editPrinter ? "✏️ Editar" : "➕ Nueva"} impresora</h3>
              <button onClick={() => setShowForm(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{background:"rgba(239,68,68,0.1)",color:"#ef4444"}}>✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">

              {/* Nombre */}
              <div>
                <label className="block text-xs font-bold mb-1" style={{color:"var(--muted)"}}>Nombre de la impresora</label>
                <input value={form.name} onChange={e => setForm((p: any) => ({...p,name:e.target.value}))}
                  placeholder="Ej: Cocina principal"
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
              </div>

              {/* Tipo */}
              <div>
                <label className="block text-xs font-bold mb-2" style={{color:"var(--muted)"}}>Tipo de estación</label>
                <div className="grid grid-cols-2 gap-2">
                  {PRINTER_TYPES.map(t => (
                    <button key={t.value} type="button" onClick={() => setForm((p: any) => ({...p,type:t.value}))}
                      className="py-2.5 rounded-xl text-sm font-bold border-2 transition-all"
                      style={{
                        background:form.type===t.value?t.color+"18":"var(--surf2)",
                        borderColor:form.type===t.value?t.color:"var(--border)",
                        color:form.type===t.value?t.color:"var(--muted)"
                      }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tipo de conexión */}
              <div>
                <label className="block text-xs font-bold mb-2" style={{color:"var(--muted)"}}>Tipo de conexión</label>
                <div className="flex flex-col gap-2">
                  {CONNECTION_TYPES.map(ct => (
                    <button key={ct.value} type="button" onClick={() => setForm((p: any) => ({...p,connectionType:ct.value}))}
                      className="py-3 px-4 rounded-xl text-left border-2 transition-all"
                      style={{
                        background:form.connectionType===ct.value?"rgba(245,166,35,0.08)":"var(--surf2)",
                        borderColor:form.connectionType===ct.value?"var(--gold)":"var(--border)",
                      }}>
                      <div className="font-bold text-sm" style={{color:form.connectionType===ct.value?"var(--gold)":"var(--text)"}}>{ct.label}</div>
                      <div className="text-xs mt-0.5" style={{color:"var(--muted)"}}>{ct.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Campos según conexión */}
              {form.connectionType === "NETWORK" && (
                <div className="rounded-2xl border p-4" style={{background:"var(--surf2)",borderColor:"var(--border)"}}>
                  <div className="text-xs font-black uppercase tracking-wider mb-3" style={{color:"var(--gold)"}}>
                    🌐 Configuración de red
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs font-bold mb-1" style={{color:"var(--muted)"}}>Dirección IP</label>
                      <input value={form.ip} onChange={e => setForm((p: any) => ({...p,ip:e.target.value}))}
                        placeholder="192.168.1.100"
                        className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                        style={{background:"var(--surf)",border:"1px solid var(--border)",color:"var(--text)"}} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1" style={{color:"var(--muted)"}}>Puerto</label>
                      <input type="number" value={form.port} onChange={e => setForm((p: any) => ({...p,port:Number(e.target.value)}))}
                        className="w-full px-3 py-2 rounded-xl text-sm outline-none text-center"
                        style={{background:"var(--surf)",border:"1px solid var(--border)",color:"var(--text)"}} />
                    </div>
                  </div>
                  <div className="mt-3 text-xs p-3 rounded-xl" style={{background:"rgba(59,130,246,0.08)",color:"#3b82f6"}}>
                    💡 El puerto estándar es <strong>9100</strong> para casi todas las impresoras térmicas.
                    Encuentra la IP imprimiendo la página de configuración de tu impresora.
                  </div>
                </div>
              )}

              {form.connectionType === "USB" && (
                <div className="rounded-2xl border p-4" style={{background:"var(--surf2)",borderColor:"var(--border)"}}>
                  <div className="text-xs font-black uppercase tracking-wider mb-3" style={{color:"var(--gold)"}}>
                    🔌 Configuración USB
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1" style={{color:"var(--muted)"}}>Puerto USB / Ruta del dispositivo</label>
                    <input value={form.usbPort} onChange={e => setForm((p: any) => ({...p,usbPort:e.target.value}))}
                      placeholder="Windows: COM3 · Linux: /dev/usb/lp0 · Mac: /dev/tty.usbserial"
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{background:"var(--surf)",border:"1px solid var(--border)",color:"var(--text)"}} />
                  </div>
                  <div className="mt-3 text-xs p-3 rounded-xl" style={{background:"rgba(249,115,22,0.08)",color:"#f97316"}}>
                    💡 <strong>Windows:</strong> Revisa el Administrador de dispositivos → Puertos (COM y LPT)<br/>
                    <strong>Linux:</strong> Corre <code>ls /dev/usb/</code> en terminal<br/>
                    <strong>Mac:</strong> Corre <code>ls /dev/tty.*</code> en terminal
                  </div>
                </div>
              )}

              {form.connectionType === "BLUETOOTH" && (
                <div className="rounded-2xl border p-4" style={{background:"var(--surf2)",borderColor:"var(--border)"}}>
                  <div className="text-xs font-black uppercase tracking-wider mb-3" style={{color:"var(--gold)"}}>
                    📶 Configuración Bluetooth
                  </div>
                  <button onClick={scanBluetooth} disabled={scanningBt}
                    className="w-full py-3 rounded-xl font-bold text-sm mb-3 flex items-center justify-center gap-2"
                    style={{background:"rgba(139,92,246,0.1)",color:"#8b5cf6",border:"1px solid rgba(139,92,246,0.3)"}}>
                    {scanningBt ? "🔍 Buscando..." : "📶 Buscar impresoras Bluetooth"}
                  </button>
                  {btDevices.length > 0 && (
                    <div className="flex flex-col gap-2 mb-3">
                      {btDevices.map((d, i) => (
                        <button key={i} onClick={() => setForm((p: any) => ({...p,bluetoothAddress:d.id,name:p.name||d.name}))}
                          className="py-2 px-3 rounded-xl text-sm text-left border-2 transition-all"
                          style={{background:form.bluetoothAddress===d.id?"rgba(139,92,246,0.1)":"var(--surf)",borderColor:form.bluetoothAddress===d.id?"#8b5cf6":"var(--border)"}}>
                          <div className="font-bold">{d.name || "Impresora sin nombre"}</div>
                          <div className="text-xs font-mono" style={{color:"var(--muted)"}}>{d.id}</div>
                        </button>
                      ))}
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-bold mb-1" style={{color:"var(--muted)"}}>ID del dispositivo (manual)</label>
                    <input value={form.bluetoothAddress} onChange={e => setForm((p: any) => ({...p,bluetoothAddress:e.target.value}))}
                      placeholder="Ej: 00:11:22:33:44:55"
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none font-mono"
                      style={{background:"var(--surf)",border:"1px solid var(--border)",color:"var(--text)"}} />
                  </div>
                  <div className="mt-3 text-xs p-3 rounded-xl" style={{background:"rgba(139,92,246,0.08)",color:"#8b5cf6"}}>
                    💡 Requiere Chrome en Android o PC con Bluetooth Web API habilitada.
                    Asegúrate de que la impresora esté encendida y en modo pairing.
                  </div>
                </div>
              )}

              {/* Categorías (solo si no es CASHIER) */}
              {form.type !== "CASHIER" && categories.length > 0 && (
                <div>
                  <label className="block text-xs font-bold mb-2" style={{color:"var(--muted)"}}>
                    Categorías que imprime <span style={{color:"var(--gold)"}}>({form.categories.length} seleccionadas)</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((cat: any) => (
                      <button key={cat.id} type="button" onClick={() => toggleCategory(cat.id)}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                        style={{
                          background:form.categories.includes(cat.id)?"var(--gold)":"var(--surf2)",
                          color:form.categories.includes(cat.id)?"#000":"var(--muted)",
                          border:`1px solid ${form.categories.includes(cat.id)?"var(--gold)":"var(--border)"}`
                        }}>
                        {cat.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Estado activo */}
              <div className="flex items-center justify-between px-4 py-3 rounded-xl" style={{background:"var(--surf2)"}}>
                <div className="text-sm font-medium">Impresora activa</div>
                <button onClick={() => setForm((p: any) => ({...p,isActive:!p.isActive}))}
                  className="w-12 h-6 rounded-full transition-all relative"
                  style={{background:form.isActive?"var(--gold)":"var(--surf)"}}>
                  <div className="w-5 h-5 rounded-full absolute top-0.5 transition-all bg-white"
                    style={{left:form.isActive?"26px":"2px"}} />
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t flex gap-3 flex-shrink-0" style={{borderColor:"var(--border)"}}>
              <button onClick={() => setShowForm(false)}
                className="flex-1 py-3 rounded-xl font-bold border"
                style={{borderColor:"var(--border)",color:"var(--muted)"}}>Cancelar</button>
              <button onClick={savePrinter} disabled={savingPrinter}
                className="flex-1 py-3 rounded-xl font-syne font-black"
                style={{background:savingPrinter?"var(--muted)":"var(--gold)",color:"#000"}}>
                {savingPrinter?"Guardando...":"💾 Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
