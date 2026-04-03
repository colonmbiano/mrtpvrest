"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";

const PRINTER_TYPES = [
  { value:"KITCHEN",  label:"🍳 Cocina" },
  { value:"BAR",      label:"🍹 Barra" },
  { value:"FRYER",    label:"🍟 Freidora" },
  { value:"CASHIER",  label:"💵 Caja" },
];

const FONT_SIZES = [
  { value:"xs",  label:"XS", esc:"\x1b\x21\x00" },
  { value:"sm",  label:"S",  esc:"\x1b\x21\x01" },
  { value:"md",  label:"M",  esc:"\x1b\x21\x10" },
  { value:"lg",  label:"L",  esc:"\x1b\x21\x30" },
  { value:"xl",  label:"XL", esc:"\x1b\x21\x38" },
];

const ALIGN_OPTS = [
  { value:"left",   label:"◀ Izq" },
  { value:"center", label:"▶◀ Centro" },
  { value:"right",  label:"▶ Der" },
];

const KITCHEN_FIELDS = [
  { key:"kitchenHeader",    label:"Encabezado",        defaultVal:"*** COCINA ***" },
  { key:"orderNumber",      label:"# Número de orden", defaultVal:"TPV-001234" },
  { key:"customerName",     label:"👤 Cliente",         defaultVal:"Juan García" },
  { key:"tableNumber",      label:"🪑 Mesa",            defaultVal:"Mesa 5" },
  { key:"orderType",        label:"📦 Tipo de orden",   defaultVal:"Para llevar" },
  { key:"orderTime",        label:"🕐 Hora",            defaultVal:"14:35" },
  { key:"items",            label:"🍔 Productos",       defaultVal:"2x BODEGON\n*** Sin cebolla ***\n1x PAPAS" },
];

const emptyPrinter = { name:"", ip:"", port:9100, type:"KITCHEN", isActive:true, categories:[] as string[] };

export default function ImprimorasPage() {
  const [printers, setPrinters]     = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [config, setConfig]         = useState<any>(null);
  const [showForm, setShowForm]     = useState(false);
  const [editPrinter, setEditPrinter] = useState<any>(null);
  const [saving, setSaving]         = useState(false);
  const [testing, setTesting]       = useState<string|null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [localIP, setLocalIP]     = useState("localhost");
  const [customIP, setCustomIP]   = useState("");
  const [configTab, setConfigTab]   = useState<"cashier"|"kitchen">("cashier");
  const [form, setForm]             = useState<any>(emptyPrinter);

  const [kitchenLayout, setKitchenLayout] = useState<any[]>([
    { key:"kitchenHeader", show:true, align:"center", size:"md",  bold:true },
    { key:"orderNumber",   show:true, align:"center", size:"xl",  bold:true },
    { key:"customerName",  show:true, align:"left",   size:"sm",  bold:false },
    { key:"tableNumber",   show:true, align:"left",   size:"md",  bold:true },
    { key:"orderType",     show:true, align:"left",   size:"sm",  bold:false },
    { key:"orderTime",     show:true, align:"left",   size:"xs",  bold:false },
    { key:"items",         show:true, align:"left",   size:"md",  bold:true },
  ]);

  const [dragging, setDragging] = useState<number|null>(null);
  const [dragOver, setDragOver] = useState<number|null>(null);

  async function fetchAll() {
    try {
      const [p, c, cfg] = await Promise.all([
        api.get("/api/printers"),
        api.get("/api/menu/categories"),
        api.get("/api/printers/ticket-config"),
      ]);
      setPrinters(p.data);
      setCategories(c.data);
      const cfgData = cfg.data || {};
      setConfig(cfgData);
      if (cfgData.kitchenLayout) {
        try { setKitchenLayout(JSON.parse(cfgData.kitchenLayout)); } catch {}
      }
    } catch {}
  }

  useEffect(() => {
    fetchAll();
    try {
      const pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel('');
      pc.createOffer().then(o => pc.setLocalDescription(o));
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          const ip = e.candidate.candidate.match(/([0-9]{1,3}(.[0-9]{1,3}){3})/);
          if (ip && !ip[1].startsWith('127')) { setLocalIP(ip[1]); pc.close(); }
        }
      };
    } catch {}
  }, []);

  function openForm(printer?: any) {
    setEditPrinter(printer || null);
    if (printer) {
      // Usar array directamente — ya no es JSON string
      const cats = Array.isArray(printer.categories) ? printer.categories : [];
      setForm({ name:printer.name, ip:printer.ip, port:printer.port, type:printer.type, isActive:printer.isActive, categories:cats });
    } else {
      setForm({ ...emptyPrinter, categories:[] });
    }
    setShowForm(true);
  }

  async function savePrinter(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      // Enviar categories como array directo, sin JSON.stringify
      const payload = { ...form };
      if (editPrinter) await api.put(`/api/printers/${editPrinter.id}`, payload);
      else await api.post("/api/printers", payload);
      setShowForm(false); fetchAll();
    } catch (err: any) { alert(err.response?.data?.error || "Error"); }
    finally { setSaving(false); }
  }

  async function deletePrinter(id: string) {
    if (!confirm("¿Eliminar impresora?")) return;
    await api.delete(`/api/printers/${id}`); fetchAll();
  }

  async function testPrinter(printer: any) {
    setTesting(printer.id);
    try { await api.post(`/api/printers/${printer.id}/test`); alert("✅ Prueba enviada a " + printer.name); }
    catch { alert("❌ No se pudo conectar"); }
    finally { setTesting(null); }
  }

  async function saveConfig() {
    setSavingConfig(true);
    try {
      await api.put("/api/printers/ticket-config", {
        ...config,
        kitchenLayout: JSON.stringify(kitchenLayout),
      });
      alert("✅ Configuración guardada");
    } catch (err: any) { alert(err.response?.data?.error || "Error"); }
    finally { setSavingConfig(false); }
  }

  function toggleCategory(catId: string) {
    setForm((p: any) => ({
      ...p,
      categories: p.categories.includes(catId)
        ? p.categories.filter((c: string) => c !== catId)
        : [...p.categories, catId]
    }));
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

  const PREVIEW_SIZE: Record<string,string> = {
    xs: "0.6rem", sm: "0.75rem", md: "0.875rem", lg: "1.1rem", xl: "1.4rem"
  };

  const cfgField = (label: string, field: string, type = "text", placeholder = "") => (
    <div key={field}>
      <label className="block text-xs font-bold mb-1 uppercase tracking-wider" style={{color:"var(--muted)"}}>{label}</label>
      <input type={type} value={config?.[field] || ""}
        onChange={e => setConfig((p: any) => ({...p, [field]: type==="number" ? Number(e.target.value) : e.target.value}))}
        placeholder={placeholder}
        className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
        style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
    </div>
  );

  const cfgToggle = (label: string, field: string, description = "") => (
    <div key={field} className="flex items-center justify-between py-2">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="text-xs" style={{color:"var(--muted)"}}>{description}</div>}
      </div>
      <button onClick={() => setConfig((p: any) => ({...p, [field]: !p?.[field]}))}
        className="w-12 h-6 rounded-full transition-all relative"
        style={{background: config?.[field] ? "var(--gold)" : "var(--surf2)"}}>
        <div className="w-5 h-5 rounded-full absolute top-0.5 transition-all"
          style={{background:"white", left: config?.[field] ? "26px" : "2px"}} />
      </button>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-syne text-3xl font-black">Impresoras</h1>
          <p className="text-sm mt-1" style={{color:"var(--muted)"}}>Gestiona impresoras y formato de tickets</p>
        </div>
        <button onClick={() => openForm()}
          className="px-4 py-2 rounded-xl text-sm font-syne font-black"
          style={{background:"var(--gold)",color:"#000"}}>
          + Impresora
        </button>
      </div>

      {/* Modal impresora */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" style={{background:"rgba(0,0,0,0.85)"}}>
          <div className="w-full max-w-lg rounded-2xl border my-4" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{borderColor:"var(--border)"}}>
              <h2 className="font-syne font-black text-xl">{editPrinter ? "Editar" : "Nueva"} impresora</h2>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{background:"var(--surf2)",color:"var(--muted)"}}>✕</button>
            </div>
            <form onSubmit={savePrinter} className="p-6 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold mb-1 uppercase tracking-wider" style={{color:"var(--muted)"}}>Nombre</label>
                <input value={form.name} onChange={e => setForm((p:any)=>({...p,name:e.target.value}))} required
                  placeholder="Ej: Cocina principal"
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1 uppercase tracking-wider" style={{color:"var(--muted)"}}>IP</label>
                  <input value={form.ip} onChange={e => setForm((p:any)=>({...p,ip:e.target.value}))} required
                    placeholder="192.168.1.100"
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 uppercase tracking-wider" style={{color:"var(--muted)"}}>Puerto</label>
                  <input type="number" value={form.port} onChange={e => setForm((p:any)=>({...p,port:Number(e.target.value)}))}
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold mb-2 uppercase tracking-wider" style={{color:"var(--muted)"}}>Tipo</label>
                <div className="grid grid-cols-2 gap-2">
                  {PRINTER_TYPES.map(t => (
                    <button key={t.value} type="button" onClick={() => setForm((p:any)=>({...p,type:t.value}))}
                      className="py-2.5 rounded-xl text-sm font-bold"
                      style={{background: form.type===t.value ? "var(--gold)" : "var(--surf2)", color: form.type===t.value ? "#000" : "var(--muted)", border:`1px solid ${form.type===t.value ? "var(--gold)" : "var(--border)"}`}}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              {form.type !== "CASHIER" && (
                <div>
                  <label className="block text-xs font-bold mb-2 uppercase tracking-wider" style={{color:"var(--muted)"}}>
                    Categorías <span style={{color:"var(--gold)"}}>({form.categories.length})</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((cat: any) => (
                      <button key={cat.id} type="button" onClick={() => toggleCategory(cat.id)}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold"
                        style={{background: form.categories.includes(cat.id) ? "var(--gold)" : "var(--surf2)", color: form.categories.includes(cat.id) ? "#000" : "var(--muted)"}}>
                        {cat.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-3 rounded-xl font-bold border" style={{borderColor:"var(--border)",color:"var(--muted)"}}>Cancelar</button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-3 rounded-xl font-syne font-black"
                  style={{background: saving ? "var(--muted)" : "var(--gold)",color:"#000"}}>
                  {saving ? "..." : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lista impresoras */}
      <div className="grid gap-4 mb-8" style={{gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))"}}>
        {printers.map((printer: any) => {
          // Usar array directamente
          const cats = Array.isArray(printer.categories) ? printer.categories : [];
          const typeInfo = PRINTER_TYPES.find(t => t.value === printer.type);
          return (
            <div key={printer.id} className="rounded-2xl border p-5"
              style={{background:"var(--surf)",borderColor:"var(--border)",opacity: printer.isActive ? 1 : 0.5}}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-syne font-bold">{printer.name}</div>
                  <div className="text-xs mt-0.5" style={{color:"var(--muted)"}}>{printer.ip}:{printer.port}</div>
                </div>
                <span className="text-xs px-2 py-1 rounded-full font-bold"
                  style={{background:"rgba(245,166,35,0.1)",color:"var(--gold)"}}>
                  {typeInfo?.label}
                </span>
              </div>
              {cats.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {cats.map((catId: string) => {
                    const cat = categories.find((c: any) => c.id === catId);
                    return cat ? <span key={catId} className="text-xs px-2 py-0.5 rounded-full" style={{background:"var(--surf2)",color:"var(--muted)"}}>{cat.name}</span> : null;
                  })}
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => testPrinter(printer)} disabled={testing === printer.id}
                  className="flex-1 py-2 rounded-xl text-xs font-bold border" style={{borderColor:"var(--border)",color:"var(--muted)"}}>
                  {testing === printer.id ? "..." : "🖨️ Probar"}
                </button>
                <button onClick={() => openForm(printer)}
                  className="flex-1 py-2 rounded-xl text-xs font-bold border" style={{borderColor:"var(--border)",color:"var(--muted)"}}>Editar</button>
                <button onClick={() => deletePrinter(printer.id)}
                  className="px-3 py-2 rounded-xl text-xs" style={{background:"rgba(239,68,68,0.1)",color:"#ef4444"}}>🗑️</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── PANTALLAS KDS ── */}
      <div className="rounded-2xl border overflow-hidden mb-8" style={{borderColor:"var(--border)"}}>
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{borderColor:"var(--border)",background:"var(--surf2)"}}>
          <div>
            <h2 className="font-syne font-bold text-xl">📺 Pantallas KDS</h2>
            <p className="text-xs mt-0.5" style={{color:"var(--muted)"}}>Links directos para cada estación — abre en tablet, TV o monitor</p>
          </div>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6 p-4 rounded-xl" style={{background:"var(--surf2)"}}>
            <div className="flex-1">
              <div className="text-xs font-black uppercase tracking-wider mb-1" style={{color:"var(--muted)"}}>IP de tu servidor</div>
              <div className="flex gap-2 items-center">
                <div className="text-sm font-bold" style={{color:"var(--gold)"}}>Detectada: {localIP}</div>
                <span className="text-xs" style={{color:"var(--muted)"}}>o ingresa manualmente:</span>
                <input value={customIP} onChange={e => setCustomIP(e.target.value)}
                  placeholder="192.168.1.100"
                  className="px-3 py-1.5 rounded-xl text-sm outline-none w-40"
                  style={{background:"var(--surf)",border:"1px solid var(--border)",color:"var(--text)"}} />
              </div>
            </div>
          </div>

          <div className="grid gap-4" style={{gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))"}}>
            {[
              { station:"KITCHEN", label:"🍳 Cocina",   color:"#ef4444", desc:"Alambres, hamburguesas, tacos" },
              { station:"BAR",     label:"🍹 Barra",    color:"#3b82f6", desc:"Bebidas, refrescos, malteadas" },
              { station:"FRYER",   label:"🍟 Freidora", color:"#f97316", desc:"Papas, alitas, boneless" },
            ].map(s => {
              const ip = customIP || localIP;
              const url = `http://${ip}:3000/kds?station=${s.station}`;
              return (
                <div key={s.station} className="rounded-2xl border overflow-hidden"
                  style={{borderColor: s.color + "40", background:"var(--surf)"}}>
                  <div className="px-4 py-3 flex items-center justify-between"
                    style={{background: s.color + "12"}}>
                    <div>
                      <div className="font-syne font-black text-lg">{s.label}</div>
                      <div className="text-xs" style={{color:"var(--muted)"}}>{s.desc}</div>
                    </div>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                      style={{background: s.color + "20"}}>📺</div>
                  </div>
                  <div className="p-4">
                    <div className="px-3 py-2 rounded-xl font-mono text-xs mb-3 break-all"
                      style={{background:"var(--surf2)",color:"var(--gold)"}}>
                      {url}
                    </div>
                    <div className="flex gap-2">
                      <a href={`/kds?station=${s.station}`} target="_blank" rel="noreferrer"
                        className="flex-1 py-2.5 rounded-xl text-xs font-black text-center"
                        style={{background: s.color, color:"#fff", textDecoration:"none"}}>
                        Abrir aquí
                      </a>
                      <button onClick={() => { navigator.clipboard?.writeText(url); alert('✅ URL copiada'); }}
                        className="px-3 py-2.5 rounded-xl text-xs font-bold border"
                        style={{borderColor:"var(--border)",color:"var(--muted)"}}>
                        📋 Copiar
                      </button>
                      <button onClick={() => { const qr = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`; window.open(qr, '_blank'); }}
                        className="px-3 py-2.5 rounded-xl text-xs font-bold border"
                        style={{borderColor:"var(--border)",color:"var(--muted)"}}>
                        QR
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── EDITOR DE TICKETS ── */}
      {config && (
        <div className="rounded-2xl border overflow-hidden" style={{borderColor:"var(--border)"}}>
          <div className="px-6 py-4 border-b flex items-center justify-between" style={{borderColor:"var(--border)",background:"var(--surf2)"}}>
            <h2 className="font-syne font-bold text-xl">🖨️ Formato de Tickets</h2>
            <button onClick={saveConfig} disabled={savingConfig}
              className="px-4 py-2 rounded-xl text-sm font-syne font-black"
              style={{background: savingConfig ? "var(--muted)" : "var(--gold)",color:"#000"}}>
              {savingConfig ? "Guardando..." : "💾 Guardar cambios"}
            </button>
          </div>

          <div className="flex border-b" style={{borderColor:"var(--border)"}}>
            {[{value:"cashier",label:"💵 Ticket de Cobro"},{value:"kitchen",label:"🍳 Ticket de Cocina"}].map(t => (
              <button key={t.value} onClick={() => setConfigTab(t.value as any)}
                className="flex-1 py-3 text-sm font-bold"
                style={{background: configTab===t.value ? "var(--surf)" : "var(--surf2)", color: configTab===t.value ? "var(--gold)" : "var(--muted)", borderBottom: configTab===t.value ? "2px solid var(--gold)" : "2px solid transparent"}}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-6">
            {configTab === "cashier" && (
              <div className="grid grid-cols-2 gap-6">
                <div className="flex flex-col gap-4">
                  <div className="text-xs font-black uppercase tracking-wider" style={{color:"var(--gold)"}}>Encabezado</div>
                  {cfgField("Nombre del negocio","businessName","text","Master Burger's")}
                  {cfgField("Encabezado","header","text","Bienvenido")}
                  {cfgField("Dirección","address","text","Calle, Ciudad")}
                  {cfgField("Teléfono","phone","text","722 000 0000")}
                  {cfgField("Pie de página","footer","text","¡Gracias por su visita!")}
                  <div className="text-xs font-black uppercase tracking-wider mt-2" style={{color:"var(--gold)"}}>Opciones</div>
                  <div className="rounded-xl border divide-y" style={{borderColor:"var(--border)"}}>
                    <div className="px-4">{cfgToggle("Mostrar nombre/logo","showLogo","")}</div>
                    <div className="px-4">{cfgToggle("Propina sugerida","showTip","10%, 15% y 20%")}</div>
                    <div className="px-4">{cfgToggle("Mostrar dirección","showAddress","")}</div>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-black uppercase tracking-wider mb-3" style={{color:"var(--gold)"}}>Preview</div>
                  <div className="rounded-xl border p-4 font-mono text-xs" style={{background:"var(--surf2)",borderColor:"var(--border)"}}>
                    <div className="text-center font-bold text-sm">{config.businessName || "Master Burger's"}</div>
                    {config.header && <div className="text-center">{config.header}</div>}
                    {config.showAddress && config.address && <div className="text-center">{config.address}</div>}
                    <div className="border-t mt-2 pt-2" style={{borderColor:"var(--border)"}}>
                      <div className="flex justify-between"><span>1x Bodegon</span><span>$120</span></div>
                      <div className="flex justify-between"><span>2x Refresco</span><span>$60</span></div>
                    </div>
                    <div className="border-t mt-2 pt-2 font-bold flex justify-between" style={{borderColor:"var(--border)"}}>
                      <span>TOTAL:</span><span>$180</span>
                    </div>
                    {config.showTip && <div className="text-center mt-1">10%=$18 · 15%=$27 · 20%=$36</div>}
                    {config.footer && <div className="text-center mt-2 font-bold">{config.footer}</div>}
                  </div>
                </div>
              </div>
            )}

            {configTab === "kitchen" && (
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-black uppercase tracking-wider" style={{color:"var(--gold)"}}>Campos del ticket</div>
                    <span className="text-xs" style={{color:"var(--muted)"}}>↕ Arrastra para reordenar</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {kitchenLayout.map((field, idx) => {
                      const meta = KITCHEN_FIELDS.find(f => f.key === field.key);
                      return (
                        <div key={field.key}
                          draggable
                          onDragStart={() => setDragging(idx)}
                          onDragOver={e => { e.preventDefault(); setDragOver(idx); }}
                          onDrop={() => { if (dragging !== null) moveField(dragging, idx); setDragging(null); setDragOver(null); }}
                          onDragEnd={() => { setDragging(null); setDragOver(null); }}
                          className="rounded-xl border p-3 cursor-grab"
                          style={{
                            background: dragOver===idx ? "rgba(245,166,35,0.08)" : "var(--surf2)",
                            borderColor: dragOver===idx ? "var(--gold)" : "var(--border)",
                            opacity: dragging===idx ? 0.5 : 1,
                          }}>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm">⠿</span>
                            <span className="text-xs font-bold flex-1">{meta?.label}</span>
                            <button onClick={() => updateField(idx, {show: !field.show})}
                              className="w-9 h-5 rounded-full transition-all relative flex-shrink-0"
                              style={{background: field.show ? "var(--gold)" : "var(--surf)"}}>
                              <div className="w-4 h-4 rounded-full absolute top-0.5 transition-all"
                                style={{background:"white", left: field.show ? "20px" : "2px"}} />
                            </button>
                          </div>
                          {field.show && (
                            <div className="flex gap-2 flex-wrap">
                              <div className="flex-1">
                                <div className="text-xs mb-1" style={{color:"var(--muted)"}}>Tamaño</div>
                                <div className="flex gap-1">
                                  {FONT_SIZES.map(s => (
                                    <button key={s.value} onClick={() => updateField(idx, {size: s.value})}
                                      className="flex-1 py-1 rounded-lg text-xs font-bold"
                                      style={{background: field.size===s.value ? "var(--gold)" : "var(--surf)", color: field.size===s.value ? "#000" : "var(--muted)"}}>
                                      {s.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div className="flex-1">
                                <div className="text-xs mb-1" style={{color:"var(--muted)"}}>Alineación</div>
                                <div className="flex gap-1">
                                  {ALIGN_OPTS.map(a => (
                                    <button key={a.value} onClick={() => updateField(idx, {align: a.value})}
                                      className="flex-1 py-1 rounded-lg text-xs font-bold"
                                      style={{background: field.align===a.value ? "var(--gold)" : "var(--surf)", color: field.align===a.value ? "#000" : "var(--muted)"}}>
                                      {a.label.split(" ")[0]}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div className="flex-shrink-0">
                                <div className="text-xs mb-1" style={{color:"var(--muted)"}}>Bold</div>
                                <button onClick={() => updateField(idx, {bold: !field.bold})}
                                  className="px-3 py-1 rounded-lg text-xs font-black"
                                  style={{background: field.bold ? "var(--gold)" : "var(--surf)", color: field.bold ? "#000" : "var(--muted)"}}>
                                  B
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-black uppercase tracking-wider mb-3" style={{color:"var(--gold)"}}>Preview en tiempo real</div>
                  <div className="rounded-xl border p-4 font-mono" style={{background:"#1a1a1a",borderColor:"var(--border)",minHeight:"300px"}}>
                    {kitchenLayout.filter(f => f.show).map((field, idx) => {
                      const meta = KITCHEN_FIELDS.find(f => f.key === field.key);
                      const val = field.key === "kitchenHeader" ? (config.kitchenHeader || meta?.defaultVal) : meta?.defaultVal;
                      const isItems = field.key === "items";
                      return (
                        <div key={idx}
                          style={{
                            textAlign: field.align as any,
                            fontSize: PREVIEW_SIZE[field.size] || "0.875rem",
                            fontWeight: field.bold ? "bold" : "normal",
                            color: "white",
                            marginBottom: "4px",
                            borderBottom: field.key === "kitchenHeader" ? "1px solid #444" : "none",
                            paddingBottom: field.key === "kitchenHeader" ? "4px" : "0",
                            borderTop: field.key === "orderNumber" ? "1px solid #444" : "none",
                            paddingTop: field.key === "orderNumber" ? "4px" : "0",
                          }}>
                          {isItems ? (
                            <div>
                              <div style={{fontSize: PREVIEW_SIZE[field.size], fontWeight: field.bold ? "bold" : "normal"}}>2x BODEGON</div>
                              <div style={{fontSize: PREVIEW_SIZE["xs"]}}>*** Sin cebolla ***</div>
                              <div style={{marginTop:"4px", fontSize: PREVIEW_SIZE[field.size], fontWeight: field.bold ? "bold" : "normal"}}>1x PAPAS</div>
                            </div>
                          ) : val}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs mt-2" style={{color:"var(--muted)"}}>* El preview es aproximado</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
