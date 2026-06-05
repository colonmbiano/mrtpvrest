"use client";
import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

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

const GREEN = "#25D366";
type Tab = "reportes" | "contactos" | "campanas" | "juegos";

const money = (n: number) =>
  "$" + (Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = (s: string | null) => (s ? new Date(s).toLocaleDateString("es-MX") : "—");

const SEGMENT_LABELS: Record<string, string> = {
  ALL: "Todos los clientes",
  INACTIVE: "Inactivos (+30 días)",
  RECENT: "Recientes (7 días)",
  FREQUENT: "Frecuentes (3+ pedidos)",
};

const emptyPrize = (): Prize => ({ label: "", type: "PERCENTAGE", value: 10, weight: 1, minOrderAmount: 0, expiresInDays: 7 });
const emptyGame = (): Game => ({ id: "", name: "", enabled: true, trigger: "ON_COMMAND", maxPerContact: 1, prizes: [emptyPrize()] });

export default function WhatsappPage() {
  const [tab, setTab] = useState<Tab>("reportes");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4500);
  };

  return (
    <div className="max-w-5xl mx-auto p-6 sm:p-8 font-sans text-white">
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-5 py-3.5 rounded-2xl text-sm font-bold shadow-2xl ${
            toast.ok
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
              : "bg-red-500/20 text-red-400 border border-red-500/30"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-black uppercase tracking-tighter mb-2">
          WhatsApp <span style={{ color: GREEN }}>Bot</span>
        </h1>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">
          Clientes, campañas, juegos y reportes del canal WhatsApp
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 flex-wrap">
        {([
          ["reportes", "📊 Reportes"],
          ["contactos", "👥 Clientes"],
          ["campanas", "📢 Campañas"],
          ["juegos", "🎮 Juegos"],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all active:scale-95"
            style={{
              background: tab === key ? GREEN : "#161616",
              color: tab === key ? "#06231a" : "#9ca3af",
              border: `1px solid ${tab === key ? GREEN : "#262626"}`,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "reportes" && <ReportsTab showToast={showToast} />}
      {tab === "contactos" && <ContactsTab showToast={showToast} />}
      {tab === "campanas" && <CampaignsTab showToast={showToast} />}
      {tab === "juegos" && <GamesTab showToast={showToast} />}
    </div>
  );
}

// ── Reusables ────────────────────────────────────────────────────────────────
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-[#111] border border-gray-800 rounded-[1.5rem] p-5 ${className}`}>{children}</div>;
}
function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[30vh] gap-4">
      <div className="w-10 h-10 border-t-2 rounded-full animate-spin" style={{ borderColor: GREEN }} />
      <p className="text-[10px] font-black uppercase tracking-widest opacity-40">{label}</p>
    </div>
  );
}
const inputCls = "w-full rounded-xl px-3 py-2.5 text-sm bg-[#0c0c0e] border border-gray-700 text-white outline-none focus:border-gray-500";
const labelCls = "block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5";

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
    <div className="space-y-6">
      <div className="flex gap-3 items-end flex-wrap">
        <div>
          <label className={labelCls}>Desde</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Hasta</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </div>
        <button onClick={load} className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest" style={{ background: GREEN, color: "#06231a" }}>
          Aplicar
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Ingresos" value={money(wa?.totalRevenue || 0)} />
        <Stat label="Pedidos" value={String(wa?.totalOrders || 0)} />
        <Stat label="Ticket prom." value={money(wa?.averageTicket || 0)} />
        <Stat label="Envíos" value={money(wa?.deliveryFees || 0)} />
      </div>

      <div>
        <h2 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-3">Por sucursal</h2>
        {data?.byLocation.length ? (
          <div className="space-y-2">
            {data.byLocation.map((l) => (
              <Card key={l.locationId || "none"} className="flex items-center justify-between !py-3.5">
                <span className="font-bold text-sm">{l.locationName}</span>
                <div className="text-right">
                  <div className="font-black text-sm" style={{ color: GREEN }}>{money(l.revenue)}</div>
                  <div className="text-[10px] text-gray-500">{l.orders} pedidos</div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-gray-600 text-sm">Aún no hay pedidos de WhatsApp en este periodo.</p>
        )}
      </div>

      <div>
        <h2 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-3">WhatsApp vs. otros canales</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {(data?.bySource || []).map((s) => (
            <Card key={s.source}>
              <div className="text-[10px] font-black uppercase tracking-widest text-gray-500">{s.source}</div>
              <div className="font-black text-lg mt-1">{money(s.revenue)}</div>
              <div className="text-[10px] text-gray-500">{s.orders} pedidos</div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <div className="text-[10px] font-black uppercase tracking-widest text-gray-500">{label}</div>
      <div className="font-black text-xl mt-1">{value}</div>
    </Card>
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
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Total de clientes" value={String(stats.total)} />
        <Stat label="Aceptan marketing" value={String(stats.optedIn)} />
      </div>
      {contacts.length === 0 ? (
        <Card className="text-center !py-10">
          <p className="text-gray-500 font-bold">Aún no tienes clientes registrados.</p>
          <p className="text-gray-700 text-xs mt-1">Se irán creando solos cuando lleguen pedidos por WhatsApp.</p>
        </Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-black uppercase tracking-widest text-gray-500 border-b border-gray-800">
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Teléfono</th>
                  <th className="px-4 py-3 text-center">Pedidos</th>
                  <th className="px-4 py-3 text-right">Gastado</th>
                  <th className="px-4 py-3">Último</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id} className="border-b border-gray-900 hover:bg-white/5">
                    <td className="px-4 py-3 font-bold">
                      {c.name || "Cliente"}
                      {!c.optIn && <span className="ml-2 text-[9px] text-red-400 uppercase">sin marketing</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{c.phone}</td>
                    <td className="px-4 py-3 text-center">{c.orderCount}</td>
                    <td className="px-4 py-3 text-right font-bold" style={{ color: GREEN }}>{money(c.totalSpent)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fecha(c.lastOrderAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
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
      showToast(`✅ Enviado a ${data.sent}/${data.total} contactos${data.failed ? ` (${data.failed} fallaron)` : ""}`);
      setMessage("");
    } catch (e: any) {
      showToast(e?.response?.data?.error || "Error al enviar la campaña", false);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <Card className="space-y-4">
        <div>
          <label className={labelCls}>Segmento de clientes</label>
          <select value={segment} onChange={(e) => setSegment(e.target.value)} className={inputCls}>
            {segments.map((s) => (
              <option key={s} value={s}>{SEGMENT_LABELS[s] || s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Mensaje</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            placeholder="Ej: ¡Hola {nombre}! 🍔 Hoy 2x1 en hamburguesas hasta las 8pm. Escríbenos para pedir."
            className={inputCls}
          />
          <p className="text-[10px] text-gray-600 mt-1.5">
            Usa <code className="text-gray-400">{"{nombre}"}</code> y se reemplaza por el nombre de cada cliente.
          </p>
        </div>
        <button
          onClick={() => message.trim() && setConfirming(true)}
          disabled={sending || !message.trim()}
          className="w-full py-3 rounded-2xl text-xs font-black uppercase tracking-widest disabled:opacity-40 active:scale-95 transition-all"
          style={{ background: GREEN, color: "#06231a" }}
        >
          {sending ? "Enviando..." : "Enviar campaña"}
        </button>
      </Card>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setConfirming(false)}>
          <div className="bg-[#111] border border-gray-800 rounded-3xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-black text-lg mb-2">¿Enviar campaña?</h3>
            <p className="text-sm text-gray-400 mb-5">
              Se enviará el mensaje por WhatsApp a los clientes del segmento
              <strong className="text-white"> {SEGMENT_LABELS[segment] || segment}</strong>. Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirming(false)} className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-gray-800 text-gray-300">
                Cancelar
              </button>
              <button onClick={send} className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest" style={{ background: GREEN, color: "#06231a" }}>
                Sí, enviar
              </button>
            </div>
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
      showToast("🎮 Juego guardado");
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
      <button
        onClick={() => setEditing(emptyGame())}
        className="px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest active:scale-95"
        style={{ background: GREEN, color: "#06231a" }}
      >
        + Nuevo juego
      </button>

      {games.length === 0 ? (
        <Card className="text-center !py-10">
          <p className="text-gray-500 font-bold">No tienes juegos promocionales.</p>
          <p className="text-gray-700 text-xs mt-1">Crea uno para que tus clientes ganen cupones desde WhatsApp.</p>
        </Card>
      ) : (
        games.map((g) => (
          <Card key={g.id} className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black">{g.name}</span>
                <span
                  className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
                  style={{ background: g.enabled ? `${GREEN}22` : "#262626", color: g.enabled ? GREEN : "#6b7280" }}
                >
                  {g.enabled ? "Activo" : "Inactivo"}
                </span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                {g.prizes.length} premios · {g.trigger === "ON_ORDER" ? "Tras el pedido" : "Por comando «premio»"} ·
                {g.maxPerContact > 0 ? ` ${g.maxPerContact} jugada(s)/cliente` : " ilimitado"}
              </p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={() => setEditing(g)} className="px-3 py-2 rounded-xl text-[11px] font-black uppercase bg-gray-800 text-gray-200">Editar</button>
              <button onClick={() => remove(g.id)} className="px-3 py-2 rounded-xl text-[11px] font-black uppercase bg-red-500/15 text-red-400">Borrar</button>
            </div>
          </Card>
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
    <div className="space-y-5 max-w-2xl">
      <Card className="space-y-4">
        <div>
          <label className={labelCls}>Nombre del juego</label>
          <input value={game.name} onChange={(e) => setGame({ ...game, name: e.target.value })} placeholder="Ruleta de la suerte" className={inputCls} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>¿Cuándo se juega?</label>
            <select value={game.trigger} onChange={(e) => setGame({ ...game, trigger: e.target.value as Game["trigger"] })} className={inputCls}>
              <option value="ON_COMMAND">Cuando escriben «premio»</option>
              <option value="ON_ORDER">Automático tras el pedido</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Jugadas por cliente (0 = ilimitado)</label>
            <input type="number" min={0} value={game.maxPerContact} onChange={(e) => setGame({ ...game, maxPerContact: parseInt(e.target.value, 10) || 0 })} className={inputCls} />
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={game.enabled} onChange={(e) => setGame({ ...game, enabled: e.target.checked })} className="w-5 h-5 accent-green-500" />
          <span className="text-sm font-bold">Juego activo</span>
        </label>
      </Card>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-black uppercase tracking-widest text-gray-500">Premios</h2>
          <button onClick={addPrize} className="text-[11px] font-black uppercase tracking-widest" style={{ color: GREEN }}>+ Premio</button>
        </div>
        <p className="text-[10px] text-gray-600 mb-3">
          El «peso» define la probabilidad relativa de cada premio. Usa tipo «Nada» con peso alto para que ganar sea ocasional.
        </p>
        <div className="space-y-3">
          {game.prizes.map((p, i) => (
            <Card key={i} className="space-y-3">
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className={labelCls}>Premio</label>
                  <input value={p.label} onChange={(e) => setPrize(i, { label: e.target.value })} placeholder="10% de descuento" className={inputCls} />
                </div>
                <button onClick={() => removePrize(i)} className="px-3 py-2.5 rounded-xl text-[11px] font-black uppercase bg-red-500/15 text-red-400">✕</button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className={labelCls}>Tipo</label>
                  <select value={p.type} onChange={(e) => setPrize(i, { type: e.target.value as Prize["type"] })} className={inputCls}>
                    <option value="PERCENTAGE">% descuento</option>
                    <option value="FIXED">$ descuento</option>
                    <option value="NONE">Nada (sigue)</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Valor</label>
                  <input type="number" min={0} value={p.value} disabled={p.type === "NONE"} onChange={(e) => setPrize(i, { value: Number(e.target.value) || 0 })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Peso</label>
                  <input type="number" min={0} value={p.weight} onChange={(e) => setPrize(i, { weight: Number(e.target.value) || 0 })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Vence (días)</label>
                  <input type="number" min={1} value={p.expiresInDays} onChange={(e) => setPrize(i, { expiresInDays: parseInt(e.target.value, 10) || 7 })} className={inputCls} />
                </div>
              </div>
              {p.type !== "NONE" && (
                <div>
                  <label className={labelCls}>Compra mínima para usar el cupón</label>
                  <input type="number" min={0} value={p.minOrderAmount} onChange={(e) => setPrize(i, { minOrderAmount: Number(e.target.value) || 0 })} className={inputCls} />
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-gray-800 text-gray-300">Cancelar</button>
        <button onClick={onSave} disabled={saving} className="flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-widest disabled:opacity-40" style={{ background: GREEN, color: "#06231a" }}>
          {saving ? "Guardando..." : "Guardar juego"}
        </button>
      </div>
    </div>
  );
}
