"use client";
// Plantillas de WhatsApp — alta directo contra Meta, con vista previa en vivo
// y estado de aprobación (APPROVED / PENDING / REJECTED), sin salir del panel.
//
// Solo aplica con la API oficial (WhatsApp Cloud API de Meta): si el canal usa
// Whapi o falta el WABA ID, el backend responde NOT_META y aquí se explica qué
// configurar. Las plantillas son lo único que permite escribirle a un cliente
// FUERA de la ventana de 24h.

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2, FileText, Plus, RefreshCw, Save, Trash2, XCircle,
} from "lucide-react";
import api from "@/lib/api";
import { PageShell, PageHeader, Card, Pill, Button, EmptyState } from "@/components/ds";

type Template = {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  bodyText: string;
  footerText: string | null;
};

const fieldStyle = { background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" } as const;
const inputCls = "min-h-11 w-full rounded-xl px-3 text-sm outline-none";

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">{children}</label>;
}

function StatusPill({ status }: { status: string }) {
  if (status === "APPROVED") return <Pill tone="ok">Aprobada</Pill>;
  if (status === "REJECTED") return <Pill tone="err">Rechazada</Pill>;
  if (status === "PENDING") return <Pill tone="warn" live>En revisión</Pill>;
  return <Pill tone="neutral">{status}</Pill>;
}

// Burbuja de vista previa estilo WhatsApp (variables {{n}} resaltadas).
function PreviewBubble({ body, footer }: { body: string; footer: string }) {
  const parts = body.split(/(\{\{\d+\}\})/g);
  return (
    <div className="rounded-2xl p-4" style={{ background: "#e5ddd5" }}>
      <div className="max-w-[85%] rounded-xl rounded-tl-none bg-white px-3 py-2 shadow-sm">
        <p className="whitespace-pre-wrap break-words text-[13px] leading-snug text-[#111b21]">
          {parts.map((part, i) =>
            /^\{\{\d+\}\}$/.test(part) ? (
              <span key={i} className="rounded bg-[#d1f4cc] px-1 font-mono text-[11px] font-bold text-[#075e54]">{part}</span>
            ) : (
              <span key={i}>{part || (i === 0 ? "Escribe el cuerpo del mensaje…" : "")}</span>
            )
          )}
        </p>
        {footer && <p className="mt-1.5 text-[11px] text-[#667781]">{footer}</p>}
        <p className="mt-1 text-right text-[10px] text-[#667781]">12:00</p>
      </div>
    </div>
  );
}

export default function PlantillasPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [notMeta, setNotMeta] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<"UTILITY" | "MARKETING">("UTILITY");
  const [language, setLanguage] = useState("es_MX");
  const [bodyText, setBodyText] = useState("");
  const [footerText, setFooterText] = useState("");

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/whatsapp/templates");
      setTemplates(data.templates || []);
      setNotMeta(null);
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { error?: string; code?: string } } };
      if (err.response?.data?.code === "NOT_META" || err.response?.data?.code === "NO_WHATSAPP") {
        setNotMeta(err.response.data.error || "Requiere la API oficial de Meta");
      } else {
        showToast(err.response?.data?.error || "No se pudieron cargar las plantillas", false);
      }
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (saving) return;
    if (!name.trim()) return showToast("Ponle un nombre a la plantilla", false);
    if (!bodyText.trim()) return showToast("Escribe el cuerpo del mensaje", false);
    setSaving(true);
    try {
      await api.post("/api/whatsapp/templates", { name, category, language, bodyText, footerText });
      showToast("Plantilla enviada a revisión de Meta");
      setShowForm(false);
      setName("");
      setBodyText("");
      setFooterText("");
      await load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      showToast(err.response?.data?.error || "No se pudo crear la plantilla", false);
    } finally {
      setSaving(false);
    }
  }

  async function remove(template: Template) {
    if (!window.confirm(`¿Eliminar la plantilla "${template.name}" de tu cuenta de Meta?`)) return;
    try {
      await api.delete(`/api/whatsapp/templates/${encodeURIComponent(template.name)}`);
      showToast("Plantilla eliminada");
      await load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      showToast(err.response?.data?.error || "No se pudo eliminar", false);
    }
  }

  return (
    <PageShell>
      {toast && (
        <div
          className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold shadow-2xl md:right-6 md:top-6"
          style={
            toast.ok
              ? { background: "var(--ok-soft)", color: "var(--ok)", border: "1px solid var(--ok)" }
              : { background: "var(--err-soft)", color: "var(--err)", border: "1px solid var(--err)" }
          }
        >
          {toast.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {toast.msg}
        </div>
      )}

      <PageHeader
        eyebrow="Canal WhatsApp"
        title="Plantillas"
        subtitle="Mensajes pre-aprobados por Meta para escribirle a tus clientes fuera de la ventana de 24 horas"
      />

      {loading ? (
        <div className="flex min-h-[30vh] flex-col items-center justify-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-t-2" style={{ borderColor: "var(--brand-primary)" }} />
          <p className="font-mono text-[10px] uppercase tracking-widest text-tx-dim">Consultando Meta</p>
        </div>
      ) : notMeta ? (
        <EmptyState
          icon={FileText}
          title="Disponible con la API oficial de Meta"
          hint={`${notMeta} Ve a Integraciones → Mensajería (Chatbot), elige el proveedor "WhatsApp Cloud API (Meta)" y llena el token y el WABA ID.`}
          action={<Button href="/admin/integraciones" full={false}>Ir a Integraciones</Button>}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            {!showForm && (
              <Button onClick={() => setShowForm(true)} icon={Plus} full={false}>
                Nueva plantilla
              </Button>
            )}
            <button
              type="button"
              onClick={load}
              aria-label="Actualizar estado"
              className="grid h-12 w-12 place-items-center rounded-[13px] text-tx-mid"
              style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
            >
              <RefreshCw size={16} />
            </button>
          </div>

          {showForm && (
            <div className="grid gap-4 md:grid-cols-2 md:items-start">
              <Card className="flex flex-col gap-4 p-4">
                <div className="font-display text-base font-extrabold text-tx-hi">Nueva plantilla</div>

                <div>
                  <Label>Nombre (minúsculas y guiones bajos)</Label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                    placeholder="ej. pedido_en_camino"
                    className={`${inputCls} font-mono`}
                    style={fieldStyle}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Categoría</Label>
                    <select value={category} onChange={(e) => setCategory(e.target.value as "UTILITY" | "MARKETING")} className={inputCls} style={fieldStyle}>
                      <option value="UTILITY">Utilidad (avisos de pedido)</option>
                      <option value="MARKETING">Marketing (promos)</option>
                    </select>
                  </div>
                  <div>
                    <Label>Idioma</Label>
                    <select value={language} onChange={(e) => setLanguage(e.target.value)} className={inputCls} style={fieldStyle}>
                      <option value="es_MX">Español (México)</option>
                      <option value="es">Español</option>
                      <option value="en_US">Inglés (EE. UU.)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <Label>Cuerpo del mensaje</Label>
                  <textarea
                    value={bodyText}
                    onChange={(e) => setBodyText(e.target.value)}
                    rows={5}
                    maxLength={1024}
                    placeholder={"Hola {{1}} 👋, tu pedido {{2}} va en camino.\nUsa {{1}}, {{2}}… como variables."}
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                    style={fieldStyle}
                  />
                  <p className="ml-1 mt-1 text-[10px] leading-snug text-tx-dim">
                    Las variables {"{{1}}, {{2}}"}… se llenan al enviar. Meta revisa el texto (suele tardar de minutos a 24 h).
                  </p>
                </div>

                <div>
                  <Label>Pie de mensaje (opcional)</Label>
                  <input
                    value={footerText}
                    onChange={(e) => setFooterText(e.target.value)}
                    maxLength={60}
                    placeholder="Ej. Responde a este mensaje para ayudarte"
                    className={inputCls}
                    style={fieldStyle}
                  />
                </div>

                <div className="flex gap-3">
                  <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
                  <Button onClick={save} disabled={saving} icon={Save}>
                    {saving ? "Enviando a Meta…" : "Enviar a revisión"}
                  </Button>
                </div>
              </Card>

              <Card className="p-4">
                <div className="mb-3 font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">Vista previa en vivo</div>
                <PreviewBubble body={bodyText} footer={footerText} />
              </Card>
            </div>
          )}

          {templates.length === 0 && !showForm ? (
            <EmptyState
              icon={FileText}
              title="Sin plantillas todavía"
              hint="Crea tu primera plantilla: Meta la revisa y, una vez aprobada, podrás usarla para avisos y campañas fuera de la ventana de 24 horas."
            />
          ) : (
            templates.map((template) => (
              <Card key={template.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[13px] font-extrabold text-tx-hi">{template.name}</span>
                      <StatusPill status={template.status} />
                      <Pill tone="neutral">{template.category === "MARKETING" ? "Marketing" : "Utilidad"}</Pill>
                      <Pill tone="neutral">{template.language}</Pill>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-snug text-tx">{template.bodyText}</p>
                    {template.footerText && <p className="mt-1 text-[11px] text-tx-mut">{template.footerText}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(template)}
                    aria-label={`Eliminar ${template.name}`}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                    style={{ background: "var(--err-soft)", color: "var(--err)" }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </PageShell>
  );
}
