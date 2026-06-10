"use client";

import { useEffect, useState, useRef } from "react";
import {
  Plug, ShieldCheck, CheckCircle2, XCircle, KeyRound,
} from "lucide-react";
import api from "@/lib/api";
import AiKeyCard from "@/components/AiKeyCard";
import {
  WtScreen, PageHeader, WtCard, SectionLabel, IconBadge, Toggle,
  PrimaryBtn, Pill,
} from "@/components/warmtech";

function safeParseConfig(raw: unknown): Record<string, string> {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, string>;
  try { return JSON.parse(raw as string); } catch { return {}; }
}

// Etiquetas y ayudas amigables por campo (sobre todo para WhatsApp / Meta).
// `secret:false` muestra el valor (input de texto) en vez de ocultarlo.
const FIELD_META: Record<string, { label: string; hint?: string; placeholder?: string; secret?: boolean }> = {
  provider:      { label: "Proveedor", secret: false, hint: "Whapi es lo más rápido de activar. Meta es la API oficial (WhatsApp Cloud API)." },
  token:         { label: "Token de acceso", hint: "Whapi: el token del canal. Meta: el token permanente del Usuario del sistema." },
  phoneNumberId: { label: "Phone number ID", secret: false, placeholder: "Solo Meta — ej. 123456789012345", hint: "Solo Meta: lo ves en la app de Meta → WhatsApp → API Setup." },
  verifyToken:   { label: "Verify token", secret: false, placeholder: "Solo Meta — un texto que tú inventes", hint: "Solo Meta: invéntalo y úsalo igual al configurar el webhook en Meta." },
  wabaId:        { label: "WABA ID (opcional)", secret: false, placeholder: "Solo Meta — WhatsApp Business Account ID", hint: "Solo Meta y opcional." },
};

type IntegrationType = { label: string; icon?: string; fields: string[] };
type ConfigForm = { enabled: boolean; mode: string; config: Record<string, string> };

const inputStyle = {
  background: "var(--surf-2)",
  border: "1px solid var(--bd-1)",
  color: "var(--tx)",
} as const;

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Array<{ type: string; enabled?: boolean; mode?: string; config?: unknown }>>([]);
  const [types, setTypes] = useState<Record<string, IntegrationType>>({});
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
  const [configForms, setConfigForms] = useState<Record<string, ConfigForm>>({});

  const fetchData = async () => {
    try {
      const { data } = await api.get("/api/integrations");
      setIntegrations(data.integrations);
      setTypes(data.types);

      // Inicializar formularios con los datos existentes
      const forms: Record<string, ConfigForm> = {};
      Object.keys(data.types).forEach((type) => {
        const existing = data.integrations.find((i: { type: string }) => i.type === type);
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
    } catch {
      showToast("Error al guardar la configuración.", false);
    } finally {
      setSaving(null);
    }
  };

  const updateField = (type: string, field: string, value: string) => {
    setConfigForms((prev) => {
      const current = prev[type] ?? { enabled: false, mode: "sandbox", config: {} };
      const next: ConfigForm = {
        ...current,
        config: { ...current.config, [field]: value },
      };
      return { ...prev, [type]: next };
    });
  };

  return (
    <WtScreen>
      <PageHeader
        eyebrow="Ecosistema"
        title="Conexiones & APIs"
        subtitle="Configura tus pasarelas de pago y servicios externos sin código."
      />

      {loading ? (
        <WtCard className="p-6 text-center text-sm text-tx-mut">
          Cargando ecosistema de integraciones…
        </WtCard>
      ) : (
        <>
          <AiKeyCard />

          <SectionLabel>Integraciones disponibles</SectionLabel>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {Object.keys(types).map((key) => {
              const typeInfo = types[key];
              const form = configForms[key];
              if (!typeInfo || !form) return null;

              return (
                <WtCard key={key} className="flex flex-col p-5">
                  <div className="flex items-start gap-3">
                    <IconBadge icon={Plug} tone={form.enabled ? "ok" : "neutral"} size={42} />
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words font-display text-base font-extrabold text-tx-hi">
                        {typeInfo.label}
                      </h3>
                      <div className="mt-1">
                        <Pill tone={form.enabled ? "ok" : "neutral"} live={form.enabled}>
                          {form.enabled ? "Conectado" : "Desconectado"}
                        </Pill>
                      </div>
                    </div>
                    <Toggle
                      checked={form.enabled}
                      onChange={(next) => setConfigForms((p) => ({ ...p, [key]: { ...form, enabled: next } }))}
                      label={`Activar ${typeInfo.label}`}
                    />
                  </div>

                  <div className="mt-5 flex flex-1 flex-col gap-4">
                    <div>
                      <label className="mb-1.5 ml-1 block font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">
                        Modo de operación
                      </label>
                      <select
                        value={form.mode}
                        onChange={(e) => setConfigForms((p) => ({ ...p, [key]: { ...form, mode: e.target.value } }))}
                        className="min-h-11 w-full rounded-xl px-3 text-xs font-bold outline-none"
                        style={inputStyle}
                      >
                        <option value="sandbox">Pruebas (Sandbox)</option>
                        <option value="production">Producción (Live)</option>
                      </select>
                    </div>

                    {typeInfo.fields.map((field) => {
                      const meta = FIELD_META[field];
                      const label = meta?.label || field;
                      return (
                        <div key={field}>
                          <label className="mb-1.5 ml-1 block font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">
                            {label}
                          </label>
                          {field === "provider" ? (
                            <select
                              value={form.config.provider || "WHAPI"}
                              onChange={(e) => updateField(key, "provider", e.target.value)}
                              className="min-h-11 w-full rounded-xl px-3 text-xs font-bold outline-none"
                              style={inputStyle}
                            >
                              <option value="WHAPI">Whapi (gate.whapi.cloud)</option>
                              <option value="META">WhatsApp Cloud API (Meta)</option>
                            </select>
                          ) : (
                            <input
                              type={meta?.secret === false ? "text" : "password"}
                              placeholder={meta?.placeholder || `Ingresa tu ${field}`}
                              value={form.config[field] || ""}
                              onChange={(e) => updateField(key, field, e.target.value)}
                              className="min-h-11 w-full rounded-xl px-3 font-mono text-xs outline-none"
                              style={inputStyle}
                            />
                          )}
                          {meta?.hint && (
                            <p className="ml-1 mt-1 text-[10px] leading-snug text-tx-dim">{meta.hint}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-6">
                    <PrimaryBtn
                      onClick={() => handleSave(key)}
                      disabled={saving === key}
                      icon={KeyRound}
                    >
                      {saving === key ? "Guardando…" : "Guardar configuración"}
                    </PrimaryBtn>
                  </div>
                </WtCard>
              );
            })}
          </div>

          <WtCard className="mt-6 flex items-start gap-3 p-4">
            <IconBadge icon={ShieldCheck} tone="ac" size={38} />
            <p className="text-[11px] leading-relaxed text-tx-mut">
              <span className="font-bold text-tx">Seguridad:</span> tus credenciales se
              encriptan antes de guardarse. Nunca compartas tus llaves secretas con nadie.
            </p>
          </WtCard>
        </>
      )}

      {toast && (
        <div
          className="fixed bottom-24 right-5 z-[9999] flex items-center gap-2 rounded-xl px-4 py-3 text-[13px] font-medium md:bottom-7 md:right-7"
          style={{
            background: toast.ok ? "var(--ok-soft)" : "var(--err-soft)",
            border: `1px solid ${toast.ok ? "var(--ok)" : "var(--err)"}`,
            color: toast.ok ? "var(--ok)" : "var(--err)",
            boxShadow: "0 4px 24px rgba(0,0,0,.4)",
          }}
        >
          {toast.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {toast.msg}
        </div>
      )}
    </WtScreen>
  );
}
