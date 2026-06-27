"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Users, Plus, Trash2, X, Send,
  Store, TrendingUp, Receipt, Wallet, Bike, Pencil, CheckCircle2, XCircle,
} from "lucide-react";
import api from "@/lib/api";
import {
  WtScreen, PageHeader, WtCard, SectionHead, StatTile, Pill, Segmented,
  PrimaryBtn, Toggle,
} from "@/components/warmtech";

// ── Tipos ────────────────────────────────────────────────────────────────────
type Contact = {
  id: string;
  phone: string;
  name: string | null;
  optIn: boolean;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  lastContactedAt: string | null;
};

type Prize = {
  label: string;
  type: "PERCENTAGE" | "FIXED" | "NONE";
  value: number;
  weight: number;
  minOrderAmount: number;
  expiresInDays: number;
};

type Game = {
  id: string;
  name: string;
  enabled: boolean;
  trigger: "ON_COMMAND" | "ON_ORDER";
  prizes: Prize[];
  maxPerContact: number;
};

type Report = {
  whatsapp: { totalRevenue: number; totalOrders: number; averageTicket: number; deliveryFees: number };
  byLocation: { locationId: string | null; locationName: string; revenue: number; orders: number; deliveryFees: number }[];
  bySource: { source: string; revenue: number; orders: number }[];
};

type Tab = "reportes" | "contactos" | "campanas" | "juegos";

const money = (n: number) =>
  "$" + (Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = (s: string | null) => (s ? new Date(s).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" }) : "—");

const SEGMENT_LABELS: Record<string, string> = {
  ALL: "Todos los clientes",
  INACTIVE: "Inactivos (+30 días)",
  RECENT: "Recientes (7 días)",
  FREQUENT: "Frecuentes (3+ pedidos)",
};

const emptyPrize = (): Prize => ({ label: "", type: "PERCENTAGE", value: 10, weight: 1, minOrderAmount: 0, expiresInDays: 7 });
const emptyGame = (): Game => ({ id: "", name: "", enabled: true, trigger: "ON_COMMAND", maxPerContact: 1, prizes: [emptyPrize()] });

const TAB_OPTIONS: { value: Tab; label: string }[] = [
  { value: "reportes", label: "Reportes" },
  { value: "contactos", label: "Clientes" },
  { value: "campanas", label: "Campañas" },
  { value: "juegos", label: "Juegos" },
];

// ── estilos compartidos para inputs/selects nativos ──────────────────────────
const fieldStyle = { background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" } as const;
const inputCls = "min-h-11 w-full rounded-xl px-3 text-sm outline-none";
const textareaCls = "w-full rounded-xl px-3 py-2.5 text-sm outline-none";
function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">{children}</label>;
}

export default function WhatsappPage() {
  const [tab, setTab] = useState<Tab>("reportes");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4500);
  };

  return (
    <WtScreen>
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
        title="WhatsApp Bot"
        subtitle="Clientes, campañas, juegos y reportes del canal WhatsApp"
      />

      {/* Tabs */}
      <Segmented value={tab} onChange={setTab} options={TAB_OPTIONS} className="mb-5 md:max-w-md" />

      {tab === "reportes" && <ReportsTab showToast={showToast} />}
      {tab === "contactos" && <ContactsTab showToast={showToast} />}
      {tab === "campanas" && <CampaignsTab showToast={showToast} />}
      {tab === "juegos" && <GamesTab showToast={showToast} />}
    </WtScreen>
  );
}

// ── Reusables ────────────────────────────────────────────────────────────────
function Spinner({ label }: { label: string }) {
  return (
    <div className="flex min-h-[30vh] flex-col items-center justify-center gap-4">
      <div className="h-10 w-10 animate-spin rounded-full border-t-2" style={{ borderColor: "var(--brand-primary)" }} />
      <p className="font-mono text-[10px] uppercase tracking-widest text-tx-dim">{label}</p>
    </div>
  );
}

// ── Tab: Reportes ──────────────────────────────────────────────────────────────
function ReportsTab({ showToast }: { showToast: (m: string, ok?: boolean) => void }) {
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (from) params.from = from;
      if (to) params.to = to;
      const { data } = await api.get("/api/whatsapp/marketing/reports", { params });
      setData(data);
    } catch {
      showToast("Error al cargar reportes", false);
    } finally {
      setLoading(false);
    }
  }, [from, to, showToast]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Spinner label="Cargando reportes..." />;

  const wa = data?.whatsapp;
  return (
    <div className="space-y-2">
      <WtCard className="flex flex-wrap items-end gap-3 p-3">
        <div>
          <Label>Desde</Label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} style={fieldStyle} />
        </div>
        <div>
          <Label>Hasta</Label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} style={fieldStyle} />
        </div>
        <PrimaryBtn full={false} onClick={load}>Aplicar</PrimaryBtn>
      </WtCard>

      <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-4">
        <StatTile icon={Wallet} value={money(wa?.totalRevenue || 0)} label="Ingresos" />
        <StatTile icon={Receipt} value={String(wa?.totalOrders || 0)} label="Pedidos" />
        <StatTile icon={TrendingUp} value={money(wa?.averageTicket || 0)} label="Ticket prom." />
        <StatTile icon={Bike} value={money(wa?.deliveryFees || 0)} label="Envíos" />
      </div>

      <div>
        <SectionHead title="Por sucursal" />
        {data?.byLocation.length ? (
          <div className="space-y-2">
            {data.byLocation.map((l) => (
              <WtCard key={l.locationId || "none"} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-bold text-tx-hi">
                  <Store size={15} className="text-tx-mut" /> {l.locationName}
                </div>
                <div className="text-right">
                  <div className="font-display text-sm font-extrabold text-primary">{money(l.revenue)}</div>
                  <div className="text-[10px] text-tx-mut">{l.orders} pedidos</div>
                </div>
              </WtCard>
            ))}
          </div>
        ) : (
          <p className="text-sm text-tx-mut">Aún no hay pedidos de WhatsApp en este periodo.</p>
        )}
      </div>

      <div>
        <SectionHead title="WhatsApp vs. otros canales" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(data?.bySource || []).map((s) => (
            <WtCard key={s.source} className="p-4">
              <div className="font-mono text-[10px] uppercase tracking-widest text-tx-mut">{s.source}</div>
              <div className="mt-1 font-display text-lg font-extrabold text-tx-hi">{money(s.revenue)}</div>
              <div className="text-[10px] text-tx-mut">{s.orders} pedidos</div>
            </WtCard>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Tab: Contactos ──────────────────────────────────────────────────────────────
function ContactsTab({ showToast }: { showToast: (m: string, ok?: boolean) => void }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stats, setStats] = useState<{ total: number; optedIn: number }>({ total: 0, optedIn: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/api/whatsapp/marketing/contacts");
        setContacts(data.contacts || []);
        setStats(data.stats || { total: 0, optedIn: 0 });
      } catch {
        showToast("Error al cargar clientes", false);
      } finally {
        setLoading(false);
      }
    })();
  }, [showToast]);

  if (loading) return <Spinner label="Cargando clientes..." />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatTile icon={Users} value={String(stats.total)} label="Total de clientes" />
        <StatTile icon={CheckCircle2} value={String(stats.optedIn)} label="Aceptan marketing" />
      </div>
      {contacts.length === 0 ? (
        <WtCard className="px-6 py-10 text-center">
          <p className="font-bold text-tx">Aún no tienes clientes registrados.</p>
          <p className="mt-1 text-xs text-tx-mut">Se irán creando solos cuando lleguen pedidos por WhatsApp.</p>
        </WtCard>
      ) : (
        <WtCard className="overflow-hidden p-0">
          <div className="overflow-x-auto warmtech-scrollbar">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left font-mono text-[10px] uppercase tracking-widest text-tx-mut" style={{ borderBottom: "1px solid var(--bd-1)" }}>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Teléfono</th>
                  <th className="px-4 py-3 text-center">Pedidos</th>
                  <th className="px-4 py-3 text-right">Gastado</th>
                  <th className="px-4 py-3">Último</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id} style={{ borderBottom: "1px solid var(--bd-1)" }}>
                    <td className="px-4 py-3 font-bold text-tx">
                      {c.name || "Cliente"}
                      {!c.optIn && <span className="ml-2 text-[9px] uppercase text-err">sin marketing</span>}
                    </td>
                    <td className="px-4 py-3 text-tx-mut">{c.phone}</td>
                    <td className="px-4 py-3 text-center text-tx">{c.orderCount}</td>
                    <td className="px-4 py-3 text-right font-bold text-primary">{money(c.totalSpent)}</td>
                    <td className="px-4 py-3 text-xs text-tx-mut">{fecha(c.lastOrderAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </WtCard>
      )}
    </div>
  );
}

// ── Tab: Campañas ─────────────────────────────────────────────────────────────
function CampaignsTab({ showToast }: { showToast: (m: string, ok?: boolean) => void }) {
  const [segments, setSegments] = useState<string[]>(["ALL"]);
  const [segment, setSegment] = useState("ALL");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/api/whatsapp/marketing/segments");
        if (Array.isArray(data.segments) && data.segments.length) setSegments(data.segments);
      } catch { /* usa default */ }
    })();
  }, []);

  const send = async () => {
    setConfirming(false);
    setSending(true);
    try {
      const { data } = await api.post("/api/whatsapp/marketing/campaigns", { segment, message });
      showToast(`Enviado a ${data.sent}/${data.total} contactos${data.failed ? ` (${data.failed} fallaron)` : ""}`);
      setMessage("");
    } catch (e: any) {
      showToast(e?.response?.data?.error || "Error al enviar la campaña", false);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-5">
      <WtCard className="space-y-4 p-5">
        <div>
          <Label>Segmento de clientes</Label>
          <select value={segment} onChange={(e) => setSegment(e.target.value)} className={inputCls} style={fieldStyle}>
            {segments.map((s) => (
              <option key={s} value={s}>{SEGMENT_LABELS[s] || s}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Mensaje</Label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            placeholder="Ej: ¡Hola {nombre}! Hoy 2x1 en hamburguesas hasta las 8pm. Escríbenos para pedir."
            className={textareaCls}
            style={fieldStyle}
          />
          <p className="mt-1.5 text-[10px] text-tx-dim">
            Usa <code className="text-tx-mut">{"{nombre}"}</code> y se reemplaza por el nombre de cada cliente.
          </p>
        </div>
        <PrimaryBtn
          icon={Send}
          onClick={() => message.trim() && setConfirming(true)}
          disabled={sending || !message.trim()}
        >
          {sending ? "Enviando..." : "Enviar campaña"}
        </PrimaryBtn>
      </WtCard>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setConfirming(false)}>
          <div className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <WtCard className="p-6">
              <h3 className="mb-2 font-display text-lg font-extrabold text-tx-hi">¿Enviar campaña?</h3>
              <p className="mb-5 text-sm text-tx-mut">
                Se enviará el mensaje por WhatsApp a los clientes del segmento
                <strong className="text-tx"> {SEGMENT_LABELS[segment] || segment}</strong>. Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-3">
                <PrimaryBtn ghost onClick={() => setConfirming(false)}>Cancelar</PrimaryBtn>
                <PrimaryBtn onClick={send}>Sí, enviar</PrimaryBtn>
              </div>
            </WtCard>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Juegos ───────────────────────────────────────────────────────────────
function GamesTab({ showToast }: { showToast: (m: string, ok?: boolean) => void }) {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Game | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/whatsapp/marketing/games");
      setGames(Array.isArray(data) ? data : []);
    } catch {
      showToast("Error al cargar juegos", false);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) return showToast("Ponle un nombre al juego", false);
    setSaving(true);
    try {
      await api.post("/api/whatsapp/marketing/games", editing);
      showToast("Juego guardado");
      setEditing(null);
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.error || "Error al guardar", false);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar este juego?")) return;
    try {
      await api.delete(`/api/whatsapp/marketing/games/${id}`);
      showToast("Juego eliminado");
      load();
    } catch {
      showToast("Error al eliminar", false);
    }
  };

  if (loading) return <Spinner label="Cargando juegos..." />;

  if (editing) return <GameEditor game={editing} setGame={setEditing} onSave={save} onCancel={() => setEditing(null)} saving={saving} />;

  return (
    <div className="space-y-4">
      <PrimaryBtn full={false} icon={Plus} onClick={() => setEditing(emptyGame())}>
        Nuevo juego
      </PrimaryBtn>

      {games.length === 0 ? (
        <WtCard className="px-6 py-10 text-center">
          <p className="font-bold text-tx">No tienes juegos promocionales.</p>
          <p className="mt-1 text-xs text-tx-mut">Crea uno para que tus clientes ganen cupones desde WhatsApp.</p>
        </WtCard>
      ) : (
        games.map((g) => (
          <WtCard key={g.id} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-display font-extrabold text-tx-hi">{g.name}</span>
                <Pill tone={g.enabled ? "ok" : "neutral"} live={g.enabled}>
                  {g.enabled ? "Activo" : "Inactivo"}
                </Pill>
              </div>
              <p className="mt-1 text-[11px] text-tx-mut">
                {g.prizes.length} premios · {g.trigger === "ON_ORDER" ? "Tras el pedido" : "Por comando «premio»"} ·
                {g.maxPerContact > 0 ? ` ${g.maxPerContact} jugada(s)/cliente` : " ilimitado"}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button" onClick={() => setEditing(g)} aria-label="Editar juego"
                className="grid h-10 w-10 place-items-center rounded-xl text-tx-mid"
                style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
              >
                <Pencil size={15} />
              </button>
              <button
                type="button" onClick={() => remove(g.id)} aria-label="Borrar juego"
                className="grid h-10 w-10 place-items-center rounded-xl"
                style={{ background: "var(--err-soft)", color: "var(--err)" }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </WtCard>
        ))
      )}
    </div>
  );
}

function GameEditor({
  game, setGame, onSave, onCancel, saving,
}: {
  game: Game;
  setGame: (g: Game) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const setPrize = (i: number, patch: Partial<Prize>) => {
    const prizes = game.prizes.map((p, idx) => (idx === i ? { ...p, ...patch } : p));
    setGame({ ...game, prizes });
  };
  const addPrize = () => setGame({ ...game, prizes: [...game.prizes, emptyPrize()] });
  const removePrize = (i: number) => setGame({ ...game, prizes: game.prizes.filter((_, idx) => idx !== i) });

  return (
    <div className="max-w-2xl space-y-5">
      <WtCard className="space-y-4 p-5">
        <div>
          <Label>Nombre del juego</Label>
          <input value={game.name} onChange={(e) => setGame({ ...game, name: e.target.value })} placeholder="Ruleta de la suerte" className={inputCls} style={fieldStyle} />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>¿Cuándo se juega?</Label>
            <select value={game.trigger} onChange={(e) => setGame({ ...game, trigger: e.target.value as Game["trigger"] })} className={inputCls} style={fieldStyle}>
              <option value="ON_COMMAND">Cuando escriben «premio»</option>
              <option value="ON_ORDER">Automático tras el pedido</option>
            </select>
          </div>
          <div>
            <Label>Jugadas por cliente (0 = ilimitado)</Label>
            <input type="number" min={0} value={game.maxPerContact} onChange={(e) => setGame({ ...game, maxPerContact: parseInt(e.target.value, 10) || 0 })} className={inputCls} style={fieldStyle} />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-tx">Juego activo</span>
          <Toggle checked={game.enabled} onChange={(v) => setGame({ ...game, enabled: v })} label="Juego activo" />
        </div>
      </WtCard>

      <div>
        <div className="flex items-center justify-between">
          <SectionHead title="Premios" action="+ Premio" onAction={addPrize} />
        </div>
        <p className="mb-3 text-[11px] text-tx-mut">
          El «peso» define la probabilidad relativa de cada premio. Usa tipo «Nada» con peso alto para que ganar sea ocasional.
        </p>
        <div className="space-y-3">
          {game.prizes.map((p, i) => (
            <WtCard key={i} className="space-y-3 p-4">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label>Premio</Label>
                  <input value={p.label} onChange={(e) => setPrize(i, { label: e.target.value })} placeholder="10% de descuento" className={inputCls} style={fieldStyle} />
                </div>
                <button
                  type="button" onClick={() => removePrize(i)} aria-label="Quitar premio"
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
                  style={{ background: "var(--err-soft)", color: "var(--err)" }}
                >
                  <X size={15} strokeWidth={2.4} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div>
                  <Label>Tipo</Label>
                  <select value={p.type} onChange={(e) => setPrize(i, { type: e.target.value as Prize["type"] })} className={inputCls} style={fieldStyle}>
                    <option value="PERCENTAGE">% descuento</option>
                    <option value="FIXED">$ descuento</option>
                    <option value="NONE">Nada (sigue)</option>
                  </select>
                </div>
                <div>
                  <Label>Valor</Label>
                  <input type="number" min={0} value={p.value} disabled={p.type === "NONE"} onChange={(e) => setPrize(i, { value: Number(e.target.value) || 0 })} className={`${inputCls} disabled:opacity-50`} style={fieldStyle} />
                </div>
                <div>
                  <Label>Peso</Label>
                  <input type="number" min={0} value={p.weight} onChange={(e) => setPrize(i, { weight: Number(e.target.value) || 0 })} className={inputCls} style={fieldStyle} />
                </div>
                <div>
                  <Label>Vence (días)</Label>
                  <input type="number" min={1} value={p.expiresInDays} onChange={(e) => setPrize(i, { expiresInDays: parseInt(e.target.value, 10) || 7 })} className={inputCls} style={fieldStyle} />
                </div>
              </div>
              {p.type !== "NONE" && (
                <div>
                  <Label>Compra mínima para usar el cupón</Label>
                  <input type="number" min={0} value={p.minOrderAmount} onChange={(e) => setPrize(i, { minOrderAmount: Number(e.target.value) || 0 })} className={inputCls} style={fieldStyle} />
                </div>
              )}
            </WtCard>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <PrimaryBtn ghost onClick={onCancel}>Cancelar</PrimaryBtn>
        <PrimaryBtn onClick={onSave} disabled={saving}>
          {saving ? "Guardando..." : "Guardar juego"}
        </PrimaryBtn>
      </div>
    </div>
  );
}
