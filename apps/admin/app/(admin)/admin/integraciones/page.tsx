"use client";

import { useEffect, useState } from "react";
import { Plug, ShieldCheck, KeyRound } from "lucide-react";
import api from "@/lib/api";
import AiKeyCard from "@/components/AiKeyCard";
import {
  PageShell, PageHeader, Card, SectionLabel, IconBadge, Toggle,
  Button, Pill, Field, Input, Select, LoadingState, useToast,
} from "@/components/ds";

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

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Array<{ type: string; enabled?: boolean; mode?: string; config?: unknown }>>([]);
  const [types, setTypes] = useState<Record<string, IntegrationType>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const toast = useToast();

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // integrations se conserva para paridad con la carga original.
  void integrations;

  const handleSave = async (type: string) => {
    setSaving(type);
    try {
      await api.put(`/api/integrations/${type}`, configForms[type]);
      toast.success(`Configuración de ${type} guardada con éxito.`);
      fetchData();
    } catch {
      toast.error("Error al guardar la configuración.");
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
    <PageShell>
      <PageHeader
        eyebrow="Ecosistema"
        title="Conexiones & APIs"
        subtitle="Configura tus pasarelas de pago y servicios externos sin código."
      />

      {loading ? (
        <LoadingState label="Cargando ecosistema de integraciones…" />
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
                <Card key={key} className="flex flex-col p-5">
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

                  <div className="mt-5 flex flex-1 flex-col">
                    <Field label="Modo de operación">
                      <Select
                        value={form.mode}
                        onChange={(e) => setConfigForms((p) => ({ ...p, [key]: { ...form, mode: e.target.value } }))}
                      >
                        <option value="sandbox">Pruebas (Sandbox)</option>
                        <option value="production">Producción (Live)</option>
                      </Select>
                    </Field>

                    {typeInfo.fields.map((field) => {
                      const meta = FIELD_META[field];
                      const label = meta?.label || field;
                      return (
                        <Field key={field} label={label} hint={meta?.hint}>
                          {field === "provider" ? (
                            <Select
                              value={form.config.provider || "WHAPI"}
                              onChange={(e) => updateField(key, "provider", e.target.value)}
                            >
                              <option value="WHAPI">Whapi (gate.whapi.cloud)</option>
                              <option value="META">WhatsApp Cloud API (Meta)</option>
                            </Select>
                          ) : (
                            <Input
                              type={meta?.secret === false ? "text" : "password"}
                              placeholder={meta?.placeholder || `Ingresa tu ${field}`}
                              value={form.config[field] || ""}
                              onChange={(e) => updateField(key, field, e.target.value)}
                              className="font-mono"
                            />
                          )}
                        </Field>
                      );
                    })}
                  </div>

                  <div className="mt-3">
                    <Button
                      onClick={() => handleSave(key)}
                      disabled={saving === key}
                      loading={saving === key}
                      icon={KeyRound}
                      full
                    >
                      {saving === key ? "Guardando…" : "Guardar configuración"}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>

          <Card className="mt-6 flex items-start gap-3 p-4">
            <IconBadge icon={ShieldCheck} tone="ac" size={38} />
            <p className="text-[11px] leading-relaxed text-tx-mut">
              <span className="font-bold text-tx">Seguridad:</span> tus credenciales se
              encriptan antes de guardarse. Nunca compartas tus llaves secretas con nadie.
            </p>
          </Card>
        </>
      )}
    </PageShell>
  );
}
