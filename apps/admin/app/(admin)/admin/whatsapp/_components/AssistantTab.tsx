"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Bot, Sparkles, Power, Ban, QrCode, RefreshCw, Save, MessageSquare, Clock,
  AlertTriangle, CheckCircle2, TrendingUp, Wallet, Receipt,
} from "lucide-react";
import api from "@/lib/api";
import {
  Card, SectionHead, StatTile, Pill, Toggle, Button, Field, Input, Textarea,
  LoadingState, useToast,
} from "@/components/ds";
import { formatMoney } from "@/lib/format";
import type { AssistantState, BotMetrics, BotStatus } from "./types";

// Controla el bot "Cajero Estrella" (worker whatsapp-web.js en Railway) desde
// aquí, sin tocar env vars. Guarda en IntegrationConfig (type WHATSAPP_ASSISTANT)
// vía /api/admin/whatsapp-assistant; el bot lee la MISMA BD y refresca en caliente.
export default function AssistantTab() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [instructions, setInstructions] = useState("");
  const [ignoreNumbersText, setIgnoreNumbersText] = useState("");
  const [ignoreGroupName, setIgnoreGroupName] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  // Entitlement del add-on (plan). En rollout suave el backend devuelve true, así
  // que la pantalla no cambia; con enforce on y sin el módulo, mostramos upsell.
  const [entitled, setEntitled] = useState(true);
  const [provisioned, setProvisioned] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<BotMetrics>(null);
  const [status, setStatus] = useState<BotStatus | null>(null);
  // Freno de saturación (vive en RestaurantConfig, compartido con /admin/tienda):
  // tope de pedidos abiertos en cocina a partir del cual el bot y la tienda
  // online rechazan pedidos. 0 = sin freno. El TPV nunca se bloquea.
  const [maxOpenOrders, setMaxOpenOrders] = useState(0);
  const [saturatedMessage, setSaturatedMessage] = useState("");

  const loadConfig = useCallback(async () => {
    try {
      const { data } = await api.get<AssistantState>("/api/admin/whatsapp-assistant");
      setEnabled(data.enabled);
      setConfigured(data.configured);
      setEntitled(data.entitled !== false);
      setProvisioned(!!data.provisioned);
      setPhoneNumber(data.phoneNumber || null);
      setUpdatedAt(data.updatedAt);
      setInstructions(data.config?.extraInstructions || "");
      setIgnoreNumbersText((data.config?.ignoreNumbers || []).join("\n"));
      setIgnoreGroupName(data.config?.ignoreGroupName || "");
    } catch {
      toast.error("Error al cargar la configuración del bot");
    }
    try {
      const { data } = await api.get("/api/admin/config");
      setMaxOpenOrders(data?.maxOpenOrders ?? 0);
      setSaturatedMessage(data?.saturatedMessage ?? "");
    } catch {
      /* el freno es opcional: sin config no bloqueamos la pantalla */
    }
  }, [toast]);

  const loadMetrics = useCallback(async () => {
    try {
      const { data } = await api.get<{ metrics: BotMetrics; status: BotStatus }>("/api/admin/whatsapp-assistant/metrics");
      setMetrics(data.metrics);
      setStatus(data.status);
    } catch {
      /* métricas/estado son best-effort: no molestamos con toast */
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadConfig(), loadMetrics()]);
      setLoading(false);
    })();
  }, [loadConfig, loadMetrics]);

  // Mientras el bot está provisionado pero NO conectado (esperando escaneo de QR
  // o reconectando), refrescar el estado cada 5 s para que la conexión se actualice
  // sola en cuanto el dueño escanee el código.
  const waitingConnection = !!status?.provisioned && status?.ready !== true;
  useEffect(() => {
    if (!waitingConnection) return;
    const id = setInterval(() => { loadMetrics(); }, 5000);
    return () => clearInterval(id);
  }, [waitingConnection, loadMetrics]);

  const parseNumbers = (text: string): string[] => {
    const seen = new Set<string>();
    return text
      .split(/[\n,;]+/)
      .map((s) => s.replace(/[^\d+]/g, "").trim())
      .filter((s) => s.length >= 8)
      .filter((s) => (seen.has(s) ? false : (seen.add(s), true)))
      .slice(0, 200);
  };

  const save = async (nextEnabled?: boolean) => {
    setSaving(true);
    const en = nextEnabled ?? enabled;
    try {
      await api.put("/api/admin/whatsapp-assistant", {
        enabled: en,
        config: {
          extraInstructions: instructions,
          ignoreNumbers: parseNumbers(ignoreNumbersText),
          ignoreGroupName: ignoreGroupName.trim(),
        },
      });
      // Freno de saturación → RestaurantConfig (el PUT solo toca los campos enviados).
      await api.put("/api/admin/config", { maxOpenOrders, saturatedMessage });
      setConfigured(true);
      setUpdatedAt(new Date().toISOString());
      toast.success("Configuración del bot guardada. Se aplica en ~1 min.");
    } catch {
      toast.error("Error al guardar la configuración");
      if (nextEnabled !== undefined) setEnabled(!en); // revertir el toggle
    } finally {
      setSaving(false);
    }
  };

  const togglePause = (v: boolean) => {
    setEnabled(v);
    save(v);
  };

  if (loading) return <LoadingState label="Cargando asistente…" />;

  // El bot es un add-on: si el plan no lo incluye (y el enforce está activo),
  // mostramos el upsell en vez de la configuración.
  if (!entitled) {
    return (
      <Card className="flex flex-col items-center gap-3 p-8 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl" style={{ background: "var(--surf-2)", color: "var(--tx-mut)" }}>
          <Bot size={26} />
        </div>
        <p className="font-display text-lg font-extrabold text-tx-hi">El Cajero Estrella no está en tu plan</p>
        <p className="max-w-md text-sm text-tx-mut">
          El asistente de pedidos por WhatsApp es un complemento. Contáctanos para activarlo en tu cuenta y empezar a recibir pedidos por chat automáticamente.
        </p>
      </Card>
    );
  }

  const b = metrics?.bot;
  const online = status?.reachable && status?.ready === true;
  const numbersCount = parseNumbers(ignoreNumbersText).length;

  return (
    <div className="space-y-5">
      {/* Estado + interruptor global */}
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div
            className="grid h-11 w-11 place-items-center rounded-2xl"
            style={{ background: enabled ? "var(--ok-soft)" : "var(--surf-2)", color: enabled ? "var(--ok)" : "var(--tx-mut)" }}
          >
            <Bot size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display text-base font-bold text-tx">Cajero Estrella</span>
              {status && (
                <Pill tone={online ? "ok" : status.reachable ? "warn" : "neutral"} live={online}>
                  {online ? "En línea" : status.reachable ? "Conectando…" : "Sin señal"}
                </Pill>
              )}
            </div>
            <p className="mt-0.5 text-xs text-tx-mut">
              {enabled ? "El bot responde a los clientes por WhatsApp." : "El bot está en pausa: no responde a nadie."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {status?.hasQr && status?.qrUrl && (
            <a
              href={status.qrUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold"
              style={{ background: "var(--warn-soft)", color: "var(--warn)", border: "1px solid var(--warn)" }}
            >
              <QrCode size={14} /> Escanear QR
            </a>
          )}
          <Toggle checked={enabled} onChange={togglePause} label={enabled ? "Activo" : "En pausa"} />
        </div>
      </Card>

      {/* Conexión de WhatsApp (onboarding self-service) */}
      {!provisioned ? (
        <Card className="p-5">
          <SectionHead title="Conexión de WhatsApp" />
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl" style={{ background: "var(--surf-2)", color: "var(--tx-mut)" }}>
              <QrCode size={20} />
            </div>
            <p className="text-sm text-tx-mut">
              Tu asistente de WhatsApp aún no está activado. Escríbenos para conectarlo a tu
              número y empezar a atender pedidos automáticamente por WhatsApp.
            </p>
          </div>
        </Card>
      ) : status?.ready === true ? (
        <Card className="flex items-center gap-3 p-5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl" style={{ background: "var(--ok-soft)", color: "var(--ok)" }}>
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div className="font-display text-sm font-bold text-tx">WhatsApp conectado</div>
            <p className="mt-0.5 text-xs text-tx-mut">
              Tu asistente está enlazado{phoneNumber ? ` al número ${phoneNumber}` : ""} y atendiendo mensajes.
            </p>
          </div>
        </Card>
      ) : (
        <Card className="p-5">
          <SectionHead title="Conecta tu WhatsApp" />
          {status?.hasQr && status?.qrUrl ? (
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <div className="shrink-0 rounded-2xl bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={status.qrUrl} alt="Código QR de WhatsApp" width={196} height={196} style={{ display: "block" }} />
              </div>
              <div className="text-sm text-tx-mut">
                <p className="mb-2 font-bold text-tx">Escanéalo con el WhatsApp de tu negocio:</p>
                <ol className="list-decimal space-y-1 pl-4">
                  <li>Abre WhatsApp → <b>Dispositivos vinculados</b>.</li>
                  <li>Toca <b>Vincular un dispositivo</b>.</li>
                  <li>Escanea este código. La conexión se activa sola. 🔄</li>
                </ol>
                <a href={status.qrUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-primary">
                  <QrCode size={13} /> ¿No ves el código? Ábrelo aquí
                </a>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-tx-mut">
              <span className="h-4 w-4 animate-spin rounded-full border-t-2" style={{ borderColor: "var(--brand-primary)" }} />
              {status?.reachable ? "Preparando la conexión… un momento." : "Contactando tu asistente… reintentando."}
            </div>
          )}
        </Card>
      )}

      {/* Métricas del bot */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatTile icon={MessageSquare} value={String(b?.total ?? 0)} label="Pedidos (total)" />
        <StatTile icon={Clock} value={String(b?.last24h ?? 0)} label="Últimas 24h" />
        <StatTile icon={TrendingUp} value={String(b?.last7d ?? 0)} label="Últimos 7 días" />
        <StatTile icon={Wallet} value={formatMoney(b?.revenue ?? 0)} label="Ingresos" />
        <StatTile icon={Receipt} value={formatMoney(b?.avgTicket ?? 0)} label="Ticket prom." />
      </div>

      {/* Freno de saturación — el bot deja de aceptar pedidos con la cocina al tope */}
      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0 text-tx-mid" />
              <span className="font-display text-sm font-bold text-tx">Freno de saturación</span>
            </div>
            <p className="mt-1 text-xs text-tx-mut">
              {maxOpenOrders > 0
                ? `Al llegar a ${maxOpenOrders} pedidos abiertos en cocina, el bot (y la tienda online) dejan de aceptar pedidos y le avisan al cliente. El TPV nunca se bloquea.`
                : "Apagado — el bot acepta pedidos sin límite aunque la cocina vaya al tope."}
            </p>
          </div>
          <Toggle checked={maxOpenOrders > 0} onChange={(v) => setMaxOpenOrders(v ? 25 : 0)} label="Freno de saturación" />
        </div>
        {maxOpenOrders > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Tope de pedidos abiertos" hint="Cuenta los pedidos pendientes, confirmados y en preparación de las últimas 2 horas (todos los canales).">
              <Input
                type="number" min={1} value={maxOpenOrders}
                onChange={(e) => setMaxOpenOrders(Math.max(1, parseInt(e.target.value, 10) || 1))}
              />
            </Field>
            <Field label="Mensaje al cliente (saturados)">
              <Textarea
                rows={3} maxLength={300}
                value={saturatedMessage}
                onChange={(e) => setSaturatedMessage(e.target.value)}
                placeholder="Ej: ⚠️ Cocina al tope 🔥 dame 30 min y vuelve a intentarlo 🙏"
              />
            </Field>
          </div>
        )}
      </Card>

      {/* Instrucciones / personalidad */}
      <Card className="space-y-3 p-5">
        <SectionHead title="Instrucciones y tono" />
        <p className="text-xs text-tx-mut">
          Indicaciones extra que el bot suma a su comportamiento base: tono, promos a empujar, reglas de venta,
          qué NO ofrecer, etc. Se aplican en caliente (~1 min) sin reiniciar el bot.
        </p>
        <Field label="Instrucciones del asistente">
          <Textarea
            rows={10}
            maxLength={4000}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder={"Ej: Sé cálido y breve. Ofrece siempre el Combo del día primero. Si preguntan por envío a zonas lejanas, pide confirmar dirección antes de cerrar…"}
          />
          <div className="mt-1 text-right font-mono text-[10px] text-tx-dim">{instructions.length}/4000</div>
        </Field>
      </Card>

      {/* Ignorados */}
      <Card className="space-y-4 p-5">
        <SectionHead title="A quién NO responde" />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Números ignorados">
            <Textarea
              rows={6}
              value={ignoreNumbersText}
              onChange={(e) => setIgnoreNumbersText(e.target.value)}
              placeholder={"Uno por línea:\n5215512345678\n5215598765432"}
            />
            <div className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-tx-dim">
              <Ban size={11} /> {numbersCount} número{numbersCount === 1 ? "" : "s"} · el bot los ignora (los atiendes tú)
            </div>
          </Field>
          <Field label="Grupo ignorado (por nombre)" hint="El bot carga los miembros de ese grupo de WhatsApp y no les responde. Agregar/quitar a alguien del grupo lo activa/desactiva solo (se refresca cada 10 min).">
            <Input
              value={ignoreGroupName}
              onChange={(e) => setIgnoreGroupName(e.target.value)}
              placeholder="Ej: Master Burguers works"
            />
          </Field>
        </div>
      </Card>

      {/* Guardar */}
      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-tx-dim">
          {configured ? (
            <>
              <Sparkles size={12} /> Última edición: {updatedAt ? new Date(updatedAt).toLocaleString("es-MX", { timeZone: "America/Mexico_City" }) : "—"}
            </>
          ) : (
            <>
              <Power size={12} /> Aún sin guardar — el bot opera con su config por defecto
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" icon={RefreshCw} onClick={() => { loadConfig(); loadMetrics(); }}>
            Recargar
          </Button>
          <Button icon={Save} onClick={() => save()} loading={saving}>
            {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </div>
    </div>
  );
}
