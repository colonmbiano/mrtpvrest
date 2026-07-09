"use client";
// Bandeja de entrada — todas las conversaciones de WhatsApp en un solo lugar.
//
// Lista los hilos que persiste el chatbot (WhatsappConversation/WhatsappMessage),
// con filtros por estado, contexto CRM del cliente, la ventana de 24h de Meta y
// respuesta directa como humano. Mientras un hilo está "Necesita atención" el
// bot no contesta: el dueño responde desde aquí y al marcarlo resuelto el bot
// retoma. Polling (sin sockets), igual que el resto del panel.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, Bot, CheckCircle2, Clock, Inbox as InboxIcon,
  MessageSquare, RefreshCw, Search, Send, ShoppingBag, User, Wallet, XCircle,
} from "lucide-react";
import api from "@/lib/api";
import { PageShell, PageHeader, Card, Pill, Segmented, EmptyState } from "@/components/ds";

// ── Tipos ────────────────────────────────────────────────────────────────────
type ContactInfo = {
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  optIn: boolean;
} | null;

type Conversation = {
  id: string;
  phone: string;
  name: string | null;
  status: "OPEN" | "NEEDS_HUMAN" | "RESOLVED";
  lastMessageAt: string;
  lastInboundAt: string | null;
  unreadCount: number;
  needsHumanReason: string | null;
  windowOpen: boolean;
  contact: ContactInfo;
  lastMessage: { direction: "IN" | "OUT"; body: string } | null;
};

type Message = {
  id: string;
  direction: "IN" | "OUT";
  type: string;
  body: string;
  sentBy: "CUSTOMER" | "BOT" | "HUMAN";
  createdAt: string;
};

type Filter = "TODAS" | "OPEN" | "NEEDS_HUMAN" | "RESOLVED";

const FILTER_OPTIONS: { value: Filter; label: string }[] = [
  { value: "TODAS", label: "Todas" },
  { value: "OPEN", label: "Abiertas" },
  { value: "NEEDS_HUMAN", label: "Atención" },
  { value: "RESOLVED", label: "Resueltas" },
];

const money = (n: number) =>
  "$" + (Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "ayer" : `hace ${days} días`;
}

// Horas restantes de la ventana de 24h (para el badge).
function windowHoursLeft(lastInboundAt: string | null) {
  if (!lastInboundAt) return 0;
  const left = 24 * 60 * 60 * 1000 - (Date.now() - new Date(lastInboundAt).getTime());
  return Math.max(0, Math.ceil(left / 3600000));
}

function displayName(c: { name: string | null; phone: string }) {
  return c.name || `+${c.phone}`;
}

function StatusPill({ status }: { status: Conversation["status"] }) {
  if (status === "NEEDS_HUMAN") return <Pill tone="err" live>Necesita atención</Pill>;
  if (status === "RESOLVED") return <Pill tone="neutral">Resuelta</Pill>;
  return <Pill tone="ok">Abierta</Pill>;
}

export default function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [stats, setStats] = useState({ OPEN: 0, NEEDS_HUMAN: 0, RESOLVED: 0 });
  const [filter, setFilter] = useState<Filter>("TODAS");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4500);
  }, []);

  const loadList = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== "TODAS") params.set("status", filter);
      if (query.trim()) params.set("q", query.trim());
      const { data } = await api.get(`/api/whatsapp/inbox/conversations?${params.toString()}`);
      setConversations(data.conversations || []);
      setStats(data.stats || { OPEN: 0, NEEDS_HUMAN: 0, RESOLVED: 0 });
    } catch {
      /* el interceptor de api ya reintenta; silencioso en polling */
    } finally {
      setLoading(false);
    }
  }, [filter, query]);

  useEffect(() => {
    setLoading(true);
    loadList();
    const id = setInterval(loadList, 15000);
    return () => clearInterval(id);
  }, [loadList]);

  // Deep-link desde el kanban de pedidos: /admin/inbox?phone=<digits>. Sembramos
  // el buscador con el teléfono (WhatsappConversation es único por restaurante+
  // teléfono) y, cuando llega el hilo filtrado, lo abrimos directo. Leemos de
  // window.location para no forzar el <Suspense> de useSearchParams en el build.
  const pendingPhoneRef = useRef<string | null>(null);
  useEffect(() => {
    const phone = new URLSearchParams(window.location.search).get("phone");
    if (phone) {
      const digits = phone.replace(/\D/g, "");
      if (digits) {
        pendingPhoneRef.current = digits;
        setQuery(digits);
      }
    }
  }, []);
  useEffect(() => {
    const first = conversations[0];
    if (pendingPhoneRef.current && !selectedId && first) {
      setSelectedId(first.id);
      pendingPhoneRef.current = null;
    }
  }, [conversations, selectedId]);

  const selected = conversations.find((c) => c.id === selectedId) || null;

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
        title="Bandeja de entrada"
        subtitle="Todas las conversaciones del asistente, con aviso cuando un cliente necesita que respondas tú"
      />

      {/* Resumen por estado */}
      <div className="mb-4 grid grid-cols-3 gap-2 md:max-w-xl">
        <MiniStat label="Abiertas" value={stats.OPEN} tone="ok" />
        <MiniStat label="Atención" value={stats.NEEDS_HUMAN} tone="err" />
        <MiniStat label="Resueltas" value={stats.RESOLVED} tone="neutral" />
      </div>

      <div className="grid gap-4 md:grid-cols-[380px,1fr] md:items-start">
        {/* ── Columna: lista de conversaciones ── */}
        <div className={selectedId ? "hidden md:block" : ""}>
          <Segmented value={filter} onChange={setFilter} options={FILTER_OPTIONS} className="mb-3" />

          <div className="relative mb-3">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tx-dim" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre o teléfono…"
              className="min-h-11 w-full rounded-xl pl-9 pr-3 text-sm outline-none"
              style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
            />
          </div>

          {loading ? (
            <div className="flex min-h-[30vh] flex-col items-center justify-center gap-4">
              <div className="h-10 w-10 animate-spin rounded-full border-t-2" style={{ borderColor: "var(--brand-primary)" }} />
              <p className="font-mono text-[10px] uppercase tracking-widest text-tx-dim">Cargando conversaciones</p>
            </div>
          ) : conversations.length === 0 ? (
            <EmptyState
              icon={InboxIcon}
              title="Sin conversaciones"
              hint="Cuando un cliente le escriba a tu WhatsApp, su conversación aparecerá aquí automáticamente."
            />
          ) : (
            <Card className="overflow-hidden">
              {conversations.map((c, index) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors"
                  style={{
                    borderBottom: index < conversations.length - 1 ? "1px solid var(--bd-1)" : "none",
                    background: selectedId === c.id ? "var(--iris-soft)" : "transparent",
                  }}
                >
                  <span
                    className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-[12px] text-xs font-extrabold"
                    style={{ background: "var(--surf-2)", color: "var(--tx-mid)", border: "1px solid var(--bd-1)" }}
                  >
                    {(c.name || c.phone).slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-bold text-tx-hi">{displayName(c)}</span>
                      <span className="shrink-0 font-mono text-[10px] text-tx-dim">{timeAgo(c.lastMessageAt)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs text-tx-mut">
                        {c.lastMessage
                          ? `${c.lastMessage.direction === "OUT" ? "↩ " : ""}${c.lastMessage.body}`
                          : "Sin mensajes"}
                      </span>
                      {c.unreadCount > 0 && (
                        <span
                          className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 font-mono text-[10px] font-bold"
                          style={{ background: "var(--brand-primary)", color: "#fffaf4" }}
                        >
                          {c.unreadCount}
                        </span>
                      )}
                    </span>
                    <span className="mt-1.5 flex items-center gap-1.5">
                      <StatusPill status={c.status} />
                      {!c.windowOpen && c.status !== "RESOLVED" && <Pill tone="warn">Ventana 24h cerrada</Pill>}
                    </span>
                  </span>
                </button>
              ))}
            </Card>
          )}
        </div>

        {/* ── Columna: hilo seleccionado ── */}
        <div className={selectedId ? "" : "hidden md:block"}>
          {selected ? (
            <ThreadPanel
              key={selected.id}
              conversationId={selected.id}
              onBack={() => setSelectedId(null)}
              onChanged={loadList}
              showToast={showToast}
            />
          ) : (
            <EmptyState
              icon={MessageSquare}
              title="Elige una conversación"
              hint="Selecciona un hilo de la lista para ver los mensajes, el contexto del cliente y responder."
            />
          )}
        </div>
      </div>
    </PageShell>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: "ok" | "err" | "neutral" }) {
  const color = tone === "ok" ? "var(--ok)" : tone === "err" ? "var(--err)" : "var(--tx-mut)";
  return (
    <Card className="px-3 py-2.5">
      <div className="font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">{label}</div>
      <div className="mt-0.5 font-display text-xl font-extrabold" style={{ color }}>{value}</div>
    </Card>
  );
}

// ── Panel del hilo ────────────────────────────────────────────────────────────
function ThreadPanel({
  conversationId,
  onBack,
  onChanged,
  showToast,
}: {
  conversationId: string;
  onBack: () => void;
  onChanged: () => void;
  showToast: (msg: string, ok?: boolean) => void;
}) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadThread = useCallback(async (scroll = false) => {
    try {
      const { data } = await api.get(`/api/whatsapp/inbox/conversations/${conversationId}`);
      setConversation(data.conversation);
      setMessages(data.messages || []);
      if (scroll) {
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
        });
      }
    } catch {
      showToast("No se pudo cargar la conversación", false);
    } finally {
      setLoading(false);
    }
  }, [conversationId, showToast]);

  useEffect(() => {
    setLoading(true);
    loadThread(true);
    const id = setInterval(() => loadThread(false), 8000);
    return () => clearInterval(id);
  }, [loadThread]);

  async function sendReply() {
    const message = reply.trim();
    if (!message || sending) return;
    setSending(true);
    try {
      await api.post(`/api/whatsapp/inbox/conversations/${conversationId}/reply`, { message });
      setReply("");
      await loadThread(true);
      onChanged();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      showToast(err.response?.data?.error || "No se pudo enviar la respuesta", false);
    } finally {
      setSending(false);
    }
  }

  async function setStatus(status: Conversation["status"]) {
    if (updatingStatus) return;
    setUpdatingStatus(true);
    try {
      await api.post(`/api/whatsapp/inbox/conversations/${conversationId}/status`, { status });
      await loadThread(false);
      onChanged();
      showToast(status === "RESOLVED" ? "Conversación resuelta: el asistente retoma" : "Conversación actualizada");
    } catch {
      showToast("No se pudo actualizar el estado", false);
    } finally {
      setUpdatingStatus(false);
    }
  }

  if (loading || !conversation) {
    return (
      <Card className="flex min-h-[40vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-t-2" style={{ borderColor: "var(--brand-primary)" }} />
      </Card>
    );
  }

  const hoursLeft = windowHoursLeft(conversation.lastInboundAt);
  const canReply = conversation.windowOpen;

  return (
    <Card className="flex flex-col overflow-hidden">
      {/* Encabezado del hilo */}
      <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--bd-1)" }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="Volver a la lista"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-tx-mid md:hidden"
          style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
        >
          <ArrowLeft size={17} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[15px] font-extrabold text-tx-hi">{displayName(conversation)}</div>
          <div className="font-mono text-[10.5px] text-tx-mut">+{conversation.phone}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusPill status={conversation.status} />
          {canReply ? (
            <Pill tone="ok"><Clock size={10} /> Ventana abierta · {hoursLeft} h</Pill>
          ) : (
            <Pill tone="warn"><Clock size={10} /> Ventana 24h cerrada</Pill>
          )}
        </div>
      </div>

      {/* Contexto CRM del cliente */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-[11.5px] text-tx-mut" style={{ borderBottom: "1px solid var(--bd-1)", background: "var(--surf-2)" }}>
        <span className="flex items-center gap-1.5">
          <ShoppingBag size={13} /> {conversation.contact?.orderCount ?? 0} pedidos
        </span>
        <span className="flex items-center gap-1.5">
          <Wallet size={13} /> {money(conversation.contact?.totalSpent ?? 0)} gastado
        </span>
        <span className="flex items-center gap-1.5">
          <Clock size={13} /> Último pedido: {conversation.contact?.lastOrderAt ? timeAgo(conversation.contact.lastOrderAt) : "sin pedidos"}
        </span>
      </div>

      {/* Aviso de escalación */}
      {conversation.status === "NEEDS_HUMAN" && (
        <div className="flex items-start gap-2 px-4 py-3 text-xs font-semibold" style={{ background: "var(--err-soft)", color: "var(--err)" }}>
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            El asistente pausó sus respuestas en este hilo{conversation.needsHumanReason ? ` — ${conversation.needsHumanReason}` : ""}.
            Responde tú y márcalo como resuelto para que el asistente retome.
          </span>
        </div>
      )}

      {/* Mensajes */}
      <div ref={scrollRef} className="warmtech-scrollbar flex max-h-[52vh] min-h-[30vh] flex-col gap-2 overflow-y-auto px-4 py-4">
        {messages.length === 0 && <div className="py-8 text-center text-xs text-tx-mut">Sin mensajes en este hilo.</div>}
        {messages.map((message) => {
          const isIn = message.direction === "IN";
          return (
            <div key={message.id} className={`flex ${isIn ? "justify-start" : "justify-end"}`}>
              <div
                className="max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-snug"
                style={
                  isIn
                    ? { background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }
                    : { background: "var(--iris-soft)", color: "var(--tx)", border: "1px solid transparent" }
                }
              >
                <div className="whitespace-pre-wrap break-words">{message.body}</div>
                <div className="mt-1 flex items-center justify-end gap-1 font-mono text-[9px] text-tx-dim">
                  {!isIn && (message.sentBy === "HUMAN" ? <User size={10} /> : <Bot size={10} />)}
                  {!isIn && (message.sentBy === "HUMAN" ? "Tú" : "Asistente")}
                  <span>· {timeAgo(message.createdAt)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Acciones + respuesta */}
      <div className="flex flex-col gap-3 px-4 py-3" style={{ borderTop: "1px solid var(--bd-1)" }}>
        <div className="flex gap-2">
          {conversation.status !== "RESOLVED" && (
            <button
              type="button"
              onClick={() => setStatus("RESOLVED")}
              disabled={updatingStatus}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold disabled:opacity-50"
              style={{ background: "var(--ok-soft)", color: "var(--ok)" }}
            >
              <CheckCircle2 size={14} /> Marcar resuelta
            </button>
          )}
          {conversation.status === "OPEN" && (
            <button
              type="button"
              onClick={() => setStatus("NEEDS_HUMAN")}
              disabled={updatingStatus}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold disabled:opacity-50"
              style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
            >
              <User size={14} /> Atenderlo yo (pausar bot)
            </button>
          )}
          <button
            type="button"
            onClick={() => loadThread(true)}
            aria-label="Actualizar hilo"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-tx-mid"
            style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
          >
            <RefreshCw size={15} />
          </button>
        </div>

        {canReply ? (
          <div className="flex items-end gap-2">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendReply();
                }
              }}
              rows={2}
              placeholder="Escribe tu respuesta como humano…"
              className="max-h-32 w-full flex-1 resize-none rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
            />
            <button
              type="button"
              onClick={sendReply}
              disabled={sending || !reply.trim()}
              aria-label="Enviar respuesta"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white disabled:opacity-50"
              style={{ background: "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))", boxShadow: "0 4px 14px var(--iris-glow)" }}
            >
              <Send size={16} />
            </button>
          </div>
        ) : (
          <p className="rounded-xl px-3 py-2.5 text-xs leading-snug text-tx-mut" style={{ background: "var(--surf-2)", border: "1px dashed var(--bd-2)" }}>
            ⏳ La ventana de 24 horas de WhatsApp cerró: solo se puede responder con una plantilla aprobada (próximamente).
            Podrás escribir de nuevo cuando el cliente vuelva a mandar un mensaje.
          </p>
        )}
      </div>
    </Card>
  );
}
