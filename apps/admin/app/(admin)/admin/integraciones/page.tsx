"use client";

import { useEffect, useState, useRef } from "react";
import api from "@/lib/api";

function safeParseConfig(raw: any): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [types, setTypes] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  function showToast(msg: string, ok = true) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, ok });
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }

  // Estados locales para los formularios
  const [configForms, setConfigForms] = useState<any>({});

  const fetchData = async () => {
    try {
      const { data } = await api.get("/api/integrations");
      setIntegrations(data.integrations);
      setTypes(data.types);

      // Inicializar formularios con los datos existentes
      const forms: any = {};
      Object.keys(data.types).forEach(type => {
        const existing = data.integrations.find((i: any) => i.type === type);
        forms[type] = {
          enabled: existing?.enabled || false,
          mode: existing?.mode || "sandbox",
          config: safeParseConfig(existing?.config),
        };
      });
      setConfigForms(forms);
    } catch (error) {
      console.error("Error al cargar integraciones:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSave = async (type: string) => {
    setSaving(type);
    try {
      await api.put(`/api/integrations/${type}`, configForms[type]);
      showToast(`Configuración de ${type} guardada con éxito.`);
      fetchData();
    } catch (error) {
      showToast("Error al guardar la configuración.", false);
    } finally {
      setSaving(null);
    }
  };

  const updateField = (type: string, field: string, value: any) => {
    setConfigForms((prev: any) => ({
      ...prev,
      [type]: {
        ...prev[type],
        config: { ...prev[type].config, [field]: value }
      }
    }));
  };

  if (loading) return <div className="p-8 text-white font-syne">Cargando ecosistema de integraciones...</div>;

  return (
    <div className="p-8 bg-[#0a0a0a] min-h-screen text-white font-syne">
      <div className="mb-12">
        <h1 className="text-4xl font-black mb-2 uppercase tracking-tighter">Conexiones & APIs</h1>
        <p className="text-gray-500">Configura tus pasarelas de pago y servicios externos sin código.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {Object.keys(types).map((key) => {
          const typeInfo = types[key];
          const form = configForms[key];

          return (
            <div key={key} className="bg-[#111] border border-gray-800 rounded-[2.5rem] p-8 flex flex-col">
              <div className="flex justify-between items-start mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center text-3xl">
                    {typeInfo.icon}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">{typeInfo.label}</h3>
                    <span className={`text-[10px] font-black uppercase tracking-widest ${form.enabled ? 'text-green-500' : 'text-gray-600'}`}>
                      {form.enabled ? '● Conectado' : '○ Desconectado'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 bg-black/40 p-1 rounded-xl border border-white/5">
                  <button
                    onClick={() => setConfigForms({...configForms, [key]: {...form, enabled: !form.enabled}})}
                    className={`px-4 py-2 rounded-lg text-[10px] font-black transition-all ${form.enabled ? 'bg-green-500 text-black' : 'text-gray-500'}`}
                  >
                    {form.enabled ? 'ACTIVO' : 'INACTIVO'}
                  </button>
                </div>
              </div>

              <div className="space-y-4 flex-1">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="text-[9px] font-black text-gray-500 uppercase ml-2 mb-1 block">Modo de Operación</label>
                    <select
                      value={form.mode}
                      onChange={(e) => setConfigForms({...configForms, [key]: {...form, mode: e.target.value}})}
                      className="w-full bg-black border border-white/10 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:border-orange-500 transition-all"
                    >
                      <option value="sandbox">Pruebas (Sandbox)</option>
                      <option value="production">Producción (Live)</option>
                    </select>
                  </div>
                </div>

                {typeInfo.fields.map((field: string) => (
                  <div key={field}>
                    <label className="text-[9px] font-black text-gray-500 uppercase ml-2 mb-1 block">{field}</label>
                    <input
                      type="password"
                      placeholder={`Ingresa tu ${field}`}
                      value={form.config[field] || ""}
                      onChange={(e) => updateField(key, field, e.target.value)}
                      className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-xs font-mono outline-none focus:border-orange-500 transition-all"
                    />
                  </div>
                ))}
              </div>

              <button
                onClick={() => handleSave(key)}
                disabled={saving === key}
                className="w-full mt-8 bg-white hover:bg-orange-500 hover:text-white text-black py-4 rounded-2xl font-black text-xs transition-all uppercase tracking-widest shadow-xl active:scale-95"
              >
                {saving === key ? "Guardando..." : "Guardar Configuración"}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-12 p-6 bg-orange-500/5 border border-orange-500/10 rounded-3xl text-center">
        <p className="text-xs text-gray-500">
          ⚠️ <span className="font-bold text-gray-400">Seguridad:</span> Tus credenciales se encriptan antes de guardarse. Nunca compartas tus llaves secretas con nadie.
        </p>
      </div>

      {toast && (
        <div style={{
          position: "fixed", bottom: 28, right: 28, zIndex: 9999,
          background: toast.ok ? "#166534" : "#7f1d1d",
          border: `1px solid ${toast.ok ? "#22c55e" : "#ef4444"}`,
          color: "#fff", borderRadius: 12, padding: "12px 20px",
          fontSize: 13, fontFamily: "DM Sans, sans-serif", boxShadow: "0 4px 24px rgba(0,0,0,.5)",
          transition: "opacity .2s",
        }}>
          {toast.ok ? "✓" : "✕"} {toast.msg}
        </div>
      )}
    </div>
  );
}
