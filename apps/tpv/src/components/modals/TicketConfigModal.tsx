"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import { X, Save, Receipt, Printer, ShieldCheck } from "lucide-react";

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

export default function TicketConfigModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [cfg, setCfg] = useState<TicketConfig>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"general"|"kitchen"|"security">("general");

  useEffect(() => {
    if (isOpen) {
      (async () => {
        try {
          const { data } = await api.get("/api/printers/ticket-config");
          setCfg({ ...EMPTY, ...data });
        } catch (e: any) {
          setError("No se pudo cargar la configuración");
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [isOpen]);

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await api.put("/api/printers/ticket-config", cfg);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.error || "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-surf-1 border border-bd-main rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="px-8 py-6 border-b border-bd-main flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/20 text-accent flex items-center justify-center">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black italic">Configuración de Tickets</h2>
              <p className="text-[10px] text-tx-mut uppercase tracking-widest font-bold">Personalización de impresos</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-xl bg-surf-2 hover:bg-surf-3 flex items-center justify-center transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 px-8 py-4 shrink-0 bg-surf-2/50">
          <Tab active={activeTab === "general"} onClick={() => setActiveTab("general")} icon={<Receipt size={14}/>} label="General" />
          <Tab active={activeTab === "kitchen"} onClick={() => setActiveTab("kitchen")} icon={<Printer size={14}/>} label="Cocina" />
          <Tab active={activeTab === "security"} onClick={() => setActiveTab("security")} icon={<ShieldCheck size={14}/>} label="Seguridad" />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 scrollbar-hide">
          {loading ? (
            <div className="py-20 text-center text-tx-mut font-bold">Cargando...</div>
          ) : (
            <div className="space-y-6">
              {activeTab === "general" && (
                <>
                  <Field label="Nombre del Negocio">
                    <input value={cfg.businessName} onChange={e=>setCfg({...cfg, businessName: e.target.value})} className={inputCls} />
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Encabezado Línea 1">
                      <input value={cfg.header} onChange={e=>setCfg({...cfg, header: e.target.value})} className={inputCls} />
                    </Field>
                    <Field label="Encabezado Línea 2">
                      <input value={cfg.subheader} onChange={e=>setCfg({...cfg, subheader: e.target.value})} className={inputCls} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Dirección">
                      <input value={cfg.address} onChange={e=>setCfg({...cfg, address: e.target.value})} className={inputCls} />
                    </Field>
                    <Field label="Teléfono">
                      <input value={cfg.phone} onChange={e=>setCfg({...cfg, phone: e.target.value})} className={inputCls} />
                    </Field>
                  </div>
                  <Field label="Pie de página">
                    <input value={cfg.footer} onChange={e=>setCfg({...cfg, footer: e.target.value})} className={inputCls} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <Toggle label="Mostrar Logo" checked={cfg.showLogo} onChange={v=>setCfg({...cfg, showLogo: v})} />
                    <Toggle label="Mostrar Dirección" checked={cfg.showAddress} onChange={v=>setCfg({...cfg, showAddress: v})} />
                    <Toggle label="Puntos de Lealtad" checked={cfg.showPoints} onChange={v=>setCfg({...cfg, showPoints: v})} />
                    <Toggle label="Sugerir Propinas" checked={cfg.showTip} onChange={v=>setCfg({...cfg, showTip: v})} />
                  </div>
                </>
              )}

              {activeTab === "kitchen" && (
                <>
                  <Field label="Título Ticket Cocina">
                    <input value={cfg.kitchenHeader} onChange={e=>setCfg({...cfg, kitchenHeader: e.target.value})} className={inputCls} />
                  </Field>
                  <div className="space-y-3 pt-2">
                    <Toggle label="Mostrar Nombre del Cliente" checked={cfg.kitchenShowCustomer} onChange={v=>setCfg({...cfg, kitchenShowCustomer: v})} />
                    <Toggle label="Mostrar Número de Mesa" checked={cfg.kitchenShowTable} onChange={v=>setCfg({...cfg, kitchenShowTable: v})} />
                    <Toggle label="Mostrar Tipo de Orden" checked={cfg.kitchenShowType} onChange={v=>setCfg({...cfg, kitchenShowType: v})} />
                    <Toggle label="Mostrar Hora de Impresión" checked={cfg.kitchenShowTime} onChange={v=>setCfg({...cfg, kitchenShowTime: v})} />
                  </div>
                </>
              )}

              {activeTab === "security" && (
                <>
                  <Field label="PIN de Administrador (4-6 dígitos)">
                    <input type="password" value={cfg.adminPin} onChange={e=>setCfg({...cfg, adminPin: e.target.value})} className={inputCls} maxLength={6} />
                  </Field>
                  <p className="text-[11px] text-tx-mut leading-relaxed">
                    Este PIN se solicitará en el TPV para realizar acciones sensibles como:
                    <br />• Anulación de pedidos pagados
                    <br />• Apertura manual de cajón de dinero
                    <br />• Aplicación de descuentos especiales
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-8 border-t border-bd-main bg-surf-2/50 flex items-center justify-between shrink-0">
          {error && <p className="text-err text-xs font-bold">{error}</p>}
          <div className="flex gap-3 ml-auto">
            <button onClick={onClose} className="px-6 py-3 rounded-2xl text-sm font-bold hover:bg-surf-3 transition-colors">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="px-8 py-3 rounded-2xl bg-accent text-white text-sm font-black italic pos-shadow flex items-center gap-2 active:scale-95 transition-all disabled:opacity-50">
              <Save size={16} />
              {saving ? "GUARDANDO..." : "GUARDAR CAMBIOS"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Tab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${active ? 'bg-accent text-white pos-shadow' : 'text-tx-mut hover:text-tx-main'}`}>
      {icon}
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-black text-tx-mut uppercase tracking-widest ml-1">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={()=>onChange(!checked)} className="flex items-center justify-between p-3 rounded-2xl bg-surf-2 border border-bd-main hover:border-accent/30 transition-all">
      <span className="text-xs font-bold">{label}</span>
      <div className={`w-10 h-5 rounded-full relative transition-colors ${checked ? 'bg-accent' : 'bg-surf-3'}`}>
        <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${checked ? 'right-1' : 'left-1'}`} />
      </div>
    </button>
  );
}

const inputCls = "w-full bg-surf-2 border border-bd-main rounded-2xl px-5 py-3 text-sm focus:outline-none focus:border-accent transition-colors text-tx-main font-bold";
