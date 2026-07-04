"use client";
import { useEffect, useState } from "react";
import {
  Store, Globe, Power, Clock, Phone, MessageCircle, MapPin, Palette,
  Truck, Star, Link2, Copy, Check, ExternalLink, Crosshair, AlertTriangle,
  Flower2, Wallet, Trophy, Upload, ImagePlus, X, Mail, Ticket,
} from "lucide-react";
import api from "@/lib/api";
import { getStoreUrl } from "@/lib/config";
import {
  WtScreen, PageHeader, WtCard, SectionHead, Toggle, PrimaryBtn,
  StatTile,
} from "@/components/warmtech";
import { MapLocationPicker } from "@/components/MapLocationPicker";

type BusinessHour = { day: number; enabled: boolean; open: string; close: string };

// 0=Domingo … 6=Sábado (coincide con Date.getDay() y el backend).
const WEEK_DAYS = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
];

const TIMEZONES = [
  { value: "America/Mexico_City", label: "Ciudad de México (Centro)" },
  { value: "America/Cancun", label: "Cancún / Quintana Roo (Este)" },
  { value: "America/Monterrey", label: "Monterrey" },
  { value: "America/Chihuahua", label: "Chihuahua (Pacífico)" },
  { value: "America/Hermosillo", label: "Hermosillo (Sonora)" },
  { value: "America/Tijuana", label: "Tijuana (Noroeste)" },
  { value: "America/Bogota", label: "Bogotá / Lima" },
  { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires" },
  { value: "America/Santiago", label: "Santiago" },
  { value: "America/New_York", label: "Nueva York (Este EE.UU.)" },
  { value: "Europe/Madrid", label: "Madrid" },
];

// País del restaurante (ISO 3166-1 alpha-2). Determina la lada que se antepone a
// los teléfonos en los enlaces/notificaciones de WhatsApp. Debe mantenerse en
// sintonía con el mapeo de packages/config/phone.js.
const COUNTRIES = [
  { code: "MX", name: "México (+52)" },
  { code: "US", name: "Estados Unidos (+1)" },
  { code: "CO", name: "Colombia (+57)" },
  { code: "AR", name: "Argentina (+54)" },
  { code: "CL", name: "Chile (+56)" },
  { code: "PE", name: "Perú (+51)" },
  { code: "EC", name: "Ecuador (+593)" },
  { code: "GT", name: "Guatemala (+502)" },
  { code: "SV", name: "El Salvador (+503)" },
  { code: "HN", name: "Honduras (+504)" },
  { code: "CR", name: "Costa Rica (+506)" },
  { code: "PA", name: "Panamá (+507)" },
  { code: "DO", name: "República Dominicana (+1)" },
  { code: "BO", name: "Bolivia (+591)" },
  { code: "PY", name: "Paraguay (+595)" },
  { code: "UY", name: "Uruguay (+598)" },
  { code: "VE", name: "Venezuela (+58)" },
  { code: "BR", name: "Brasil (+55)" },
  { code: "CA", name: "Canadá (+1)" },
  { code: "ES", name: "España (+34)" },
];

const DEFAULT_HOUR: Omit<BusinessHour, "day"> = { enabled: false, open: "09:00", close: "22:00" };

/* ── styled controls ─────────────────────────────────────────────── */
const INPUT_CLS = "min-h-12 w-full rounded-xl px-4 text-sm font-medium outline-none transition-colors focus:border-[var(--brand-primary)]";
const INPUT_STYLE = { background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" } as const;

// ── Recompensas por puntos (lealtad Fase 3) ─────────────────────────────────
// CRUD contra /api/loyalty/rewards. Una recompensa da un producto gratis o un
// descuento fijo en $; el cliente la canjea en el checkout de la tienda online.
type Reward = {
  id: string;
  name: string;
  description?: string | null;
  pointsCost: number;
  menuItemId?: string | null;
  menuItem?: { id: string; name: string } | null;
  discountAmount?: string | number | null;
  isActive: boolean;
};

function RewardsManager() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [menuItems, setMenuItems] = useState<Array<{ id: string; name: string }>>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // Form de alta
  const [name, setName] = useState("");
  const [pointsCost, setPointsCost] = useState(100);
  const [kind, setKind] = useState<"PRODUCT" | "DISCOUNT">("PRODUCT");
  const [menuItemId, setMenuItemId] = useState("");
  const [discountAmount, setDiscountAmount] = useState(50);

  const load = () => {
    Promise.all([api.get("/api/loyalty/rewards"), api.get("/api/menu/items?admin=true")])
      .then(([rw, mi]) => {
        setRewards(Array.isArray(rw.data) ? rw.data : []);
        const items = Array.isArray(mi.data) ? mi.data : (mi.data?.items || []);
        setMenuItems(items.map((i: any) => ({ id: i.id, name: i.name })));
      })
      .catch(() => setMsg("No se pudieron cargar las recompensas"))
      .finally(() => setLoaded(true));
  };
  useEffect(load, []);

  const create = async () => {
    setMsg("");
    if (!name.trim()) { setMsg("Ponle nombre a la recompensa"); return; }
    if (kind === "PRODUCT" && !menuItemId) { setMsg("Elige el producto que regala"); return; }
    setSaving(true);
    try {
      await api.post("/api/loyalty/rewards", {
        name: name.trim(),
        pointsCost,
        menuItemId: kind === "PRODUCT" ? menuItemId : undefined,
        discountAmount: kind === "DISCOUNT" ? discountAmount : undefined,
      });
      setName(""); setMenuItemId("");
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.error || "No se pudo crear la recompensa");
    } finally { setSaving(false); }
  };

  const toggle = async (r: Reward) => {
    try {
      await api.put(`/api/loyalty/rewards/${r.id}`, {
        name: r.name,
        description: r.description || undefined,
        pointsCost: r.pointsCost,
        menuItemId: r.menuItemId || undefined,
        discountAmount: r.menuItemId ? undefined : Number(r.discountAmount || 0),
        isActive: !r.isActive,
      });
      load();
    } catch (e: any) { setMsg(e?.response?.data?.error || "No se pudo actualizar"); }
  };

  const remove = async (r: Reward) => {
    if (!confirm(`¿Eliminar la recompensa "${r.name}"?`)) return;
    try { await api.delete(`/api/loyalty/rewards/${r.id}`); load(); }
    catch (e: any) { setMsg(e?.response?.data?.error || "No se pudo eliminar"); }
  };

  return (
    <div className="mt-6 border-t pt-5" style={{ borderColor: "var(--bd-1)" }}>
      <div className="mb-3 flex items-center gap-2">
        <Trophy size={14} className="shrink-0 text-tx-mid" />
        <p className="text-[13px] font-extrabold text-tx-hi">Recompensas canjeables</p>
      </div>

      {loaded && rewards.length > 0 && (
        <div className="mb-4 space-y-2">
          {rewards.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl px-4 py-3" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-tx-hi">
                  {r.name}
                  {!r.isActive && <span className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold text-tx-mut" style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}>Pausada</span>}
                </p>
                <p className="truncate text-[12px] text-tx-mut">
                  {r.menuItem ? `${r.menuItem.name} gratis` : `−$${Number(r.discountAmount || 0)} de descuento`} · {r.pointsCost} pts
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" onClick={() => toggle(r)} className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-tx-mid" style={{ border: "1px solid var(--bd-1)" }}>
                  {r.isActive ? "Pausar" : "Activar"}
                </button>
                <button type="button" onClick={() => remove(r)} className="rounded-lg p-1.5 text-tx-mut" title="Eliminar" style={{ border: "1px solid var(--bd-1)" }}>
                  <X size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {loaded && rewards.length === 0 && (
        <p className="mb-4 text-[12px] text-tx-mut">Sin recompensas todavía. Crea la primera: tus clientes las canjean con sus puntos en la tienda online.</p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel>Nombre</FieldLabel>
          <input type="text" value={name} placeholder="Ej. Hamburguesa de regalo" onChange={(e) => setName(e.target.value)} className={INPUT_CLS} style={INPUT_STYLE} />
        </div>
        <div>
          <FieldLabel>Cuesta (puntos)</FieldLabel>
          <input type="number" min="1" value={pointsCost} onChange={(e) => setPointsCost(Math.max(1, parseInt(e.target.value) || 1))} className={INPUT_CLS} style={INPUT_STYLE} />
        </div>
        <div>
          <FieldLabel>Qué otorga</FieldLabel>
          <select value={kind} onChange={(e) => setKind(e.target.value as "PRODUCT" | "DISCOUNT")} className={INPUT_CLS} style={INPUT_STYLE}>
            <option value="PRODUCT">Producto gratis</option>
            <option value="DISCOUNT">Descuento fijo ($)</option>
          </select>
        </div>
        {kind === "PRODUCT" ? (
          <div>
            <FieldLabel>Producto</FieldLabel>
            <select value={menuItemId} onChange={(e) => setMenuItemId(e.target.value)} className={INPUT_CLS} style={INPUT_STYLE}>
              <option value="">Elegir…</option>
              {menuItems.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <FieldLabel>Descuento ($)</FieldLabel>
            <input type="number" min="1" step="any" value={discountAmount} onChange={(e) => setDiscountAmount(Math.max(1, Number(e.target.value) || 1))} className={INPUT_CLS} style={INPUT_STYLE} />
          </div>
        )}
      </div>
      {msg && <p className="mt-2 text-[12px] font-bold text-amber-600">{msg}</p>}
      <button type="button" onClick={create} disabled={saving} className="mt-3 rounded-xl px-4 py-2.5 text-[12px] font-extrabold text-white disabled:opacity-50" style={{ background: "var(--brand-primary)" }}>
        {saving ? "Creando…" : "Agregar recompensa"}
      </button>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">{children}</div>;
}

// ── Cupones de descuento (código) ───────────────────────────────────────────
// CRUD contra /api/loyalty/coupons. El cliente escribe el código en el checkout
// de la tienda online y obtiene el descuento. Es exclusivo de la tienda: el bot
// de WhatsApp no canjea cupones, así que un cupón aquí empuja a pedir por la web.
type Coupon = {
  id: string;
  code: string;
  description: string;
  discountType: "PERCENTAGE" | "FIXED";
  discountValue: string | number;
  minOrderAmount: string | number;
  maxUses?: number | null;
  usedCount: number;
  expiresAt?: string | null;
  isActive: boolean;
};

function CouponsManager() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // Form de alta
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"PERCENTAGE" | "FIXED">("PERCENTAGE");
  const [discountValue, setDiscountValue] = useState(10);
  const [minOrderAmount, setMinOrderAmount] = useState(150);
  const [maxUses, setMaxUses] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const load = () => {
    api.get("/api/loyalty/coupons")
      .then((r) => setCoupons(Array.isArray(r.data) ? r.data : []))
      .catch(() => setMsg("No se pudieron cargar los cupones"))
      .finally(() => setLoaded(true));
  };
  useEffect(load, []);

  const create = async () => {
    setMsg("");
    if (!code.trim()) { setMsg("Ponle un código al cupón"); return; }
    setSaving(true);
    try {
      await api.post("/api/loyalty/coupons", {
        code: code.trim(),
        discountType,
        discountValue,
        minOrderAmount,
        maxUses: maxUses.trim() === "" ? null : Number(maxUses),
        expiresAt: expiresAt || null,
      });
      setCode(""); setMaxUses(""); setExpiresAt("");
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.error || "No se pudo crear el cupón");
    } finally { setSaving(false); }
  };

  const toggle = async (c: Coupon) => {
    try {
      await api.put(`/api/loyalty/coupons/${c.id}`, { isActive: !c.isActive });
      load();
    } catch (e: any) { setMsg(e?.response?.data?.error || "No se pudo actualizar"); }
  };

  const remove = async (c: Coupon) => {
    if (!confirm(`¿Eliminar el cupón "${c.code}"?`)) return;
    try { await api.delete(`/api/loyalty/coupons/${c.id}`); load(); }
    catch (e: any) { setMsg(e?.response?.data?.error || "No se pudo eliminar"); }
  };

  const summarize = (c: Coupon) => {
    const val = c.discountType === "PERCENTAGE" ? `${Number(c.discountValue)}%` : `$${Number(c.discountValue)}`;
    const min = Number(c.minOrderAmount) > 0 ? ` · mín $${Number(c.minOrderAmount)}` : "";
    const uses = c.maxUses ? ` · ${c.usedCount}/${c.maxUses} usos` : ` · ${c.usedCount} usos`;
    const exp = c.expiresAt ? ` · vence ${new Date(c.expiresAt).toLocaleDateString()}` : "";
    return `${val} de descuento${min}${uses}${exp}`;
  };

  return (
    <div className="mt-2">
      {loaded && coupons.length > 0 && (
        <div className="mb-4 space-y-2">
          {coupons.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl px-4 py-3" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-tx-hi">
                  <span className="font-mono">{c.code}</span>
                  {!c.isActive && <span className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold text-tx-mut" style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}>Pausado</span>}
                </p>
                <p className="truncate text-[12px] text-tx-mut">{summarize(c)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" onClick={() => toggle(c)} className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-tx-mid" style={{ border: "1px solid var(--bd-1)" }}>
                  {c.isActive ? "Pausar" : "Activar"}
                </button>
                <button type="button" onClick={() => remove(c)} className="rounded-lg p-1.5 text-tx-mut" title="Eliminar" style={{ border: "1px solid var(--bd-1)" }}>
                  <X size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {loaded && coupons.length === 0 && (
        <p className="mb-4 text-[12px] text-tx-mut">Sin cupones todavía. Crea uno exclusivo de la tienda (ej. <span className="font-mono">TIENDA10</span>) y anima a tus clientes a pedir por la web.</p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel>Código</FieldLabel>
          <input type="text" value={code} placeholder="Ej. TIENDA10" onChange={(e) => setCode(e.target.value.toUpperCase())} className={INPUT_CLS} style={INPUT_STYLE} />
        </div>
        <div>
          <FieldLabel>Tipo de descuento</FieldLabel>
          <select value={discountType} onChange={(e) => setDiscountType(e.target.value as "PERCENTAGE" | "FIXED")} className={INPUT_CLS} style={INPUT_STYLE}>
            <option value="PERCENTAGE">Porcentaje (%)</option>
            <option value="FIXED">Monto fijo ($)</option>
          </select>
        </div>
        <div>
          <FieldLabel>{discountType === "PERCENTAGE" ? "Descuento (%)" : "Descuento ($)"}</FieldLabel>
          <input type="number" min="1" step="any" value={discountValue} onChange={(e) => setDiscountValue(Math.max(1, Number(e.target.value) || 1))} className={INPUT_CLS} style={INPUT_STYLE} />
        </div>
        <div>
          <FieldLabel>Compra mínima ($)</FieldLabel>
          <input type="number" min="0" step="any" value={minOrderAmount} onChange={(e) => setMinOrderAmount(Math.max(0, Number(e.target.value) || 0))} className={INPUT_CLS} style={INPUT_STYLE} />
        </div>
        <div>
          <FieldLabel>Usos máx. (vacío = ilimitado)</FieldLabel>
          <input type="number" min="1" value={maxUses} placeholder="Ilimitado" onChange={(e) => setMaxUses(e.target.value)} className={INPUT_CLS} style={INPUT_STYLE} />
        </div>
        <div>
          <FieldLabel>Vence (opcional)</FieldLabel>
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={INPUT_CLS} style={INPUT_STYLE} />
        </div>
      </div>
      {msg && <p className="mt-2 text-[12px] font-bold text-amber-600">{msg}</p>}
      <button type="button" onClick={create} disabled={saving} className="mt-3 rounded-xl px-4 py-2.5 text-[12px] font-extrabold text-white disabled:opacity-50" style={{ background: "var(--brand-primary)" }}>
        {saving ? "Creando…" : "Agregar cupón"}
      </button>
    </div>
  );
}

export default function TiendaConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [geoStatus, setGeoStatus] = useState<"" | "loading" | "ok" | "error">("");
  const [config, setConfig] = useState({
    slug: "",
    phone: "",
    address: "",
    whatsappNumber: "",
    countryCode: "MX",
    deliveryFee: 0,
    minOrderAmount: 0,
    freeDeliveryFrom: 0,
    estimatedDelivery: 40,
    storefrontTheme: "KAWAII",
    storefrontHeroUrl: "",
    // Estado de la tienda
    isOpen: true,
    closedMessage: "",
    // Corte de caja: ¿los admins ven el efectivo esperado en corte ciego?
    adminCanViewExpectedCash: true,
    // Corte de caja por correo: enviar el resumen del corte al cerrar el turno.
    cashCutEmailEnabled: false,
    cashCutEmails: "",
    // Horario de atención automático
    scheduleEnabled: false,
    timezone: "America/Mexico_City",
    businessHours: [] as BusinessHour[],
    // Envío por distancia
    deliveryMode: "FLAT" as "FLAT" | "DISTANCE",
    originLat: null as number | null,
    originLng: null as number | null,
    deliveryBaseFee: 0,
    deliveryPerKm: 0,
    deliveryFreeRadiusKm: null as number | null,
    deliveryMaxKm: null as number | null,
    // Programa de puntos
    pointsPerTen: 1,
    pointsValuePesos: 0.1,
  });

  const [heroUploading, setHeroUploading] = useState(false);

  // Sube la imagen de portada (hero) sin recorte (mode=hero conserva la
  // proporción panorámica). Guarda la URL en config.storefrontHeroUrl.
  async function uploadHero(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setHeroUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const { data } = await api.post("/api/upload/image?mode=hero", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (data?.url) setConfig(p => ({ ...p, storefrontHeroUrl: data.url }));
    } catch (err: any) {
      alert("No se pudo subir la imagen: " + (err?.response?.data?.error || err?.message || ""));
    } finally {
      setHeroUploading(false);
      e.target.value = "";
    }
  }

  const useMyLocation = () => {
    if (!navigator.geolocation) { setGeoStatus("error"); return; }
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setConfig(p => ({ ...p, originLat: pos.coords.latitude, originLng: pos.coords.longitude }));
        setGeoStatus("ok");
      },
      () => setGeoStatus("error"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Devuelve la franja configurada para un día, o el default si no existe.
  const getDayHour = (day: number): BusinessHour =>
    config.businessHours.find(h => h.day === day) || { day, ...DEFAULT_HOUR };

  // Aplica un cambio parcial a la franja de un día, manteniendo el array ordenado.
  const setDayHour = (day: number, patch: Partial<BusinessHour>) => {
    setConfig(p => {
      const current = p.businessHours.find(h => h.day === day) || { day, ...DEFAULT_HOUR };
      const others = p.businessHours.filter(h => h.day !== day);
      return {
        ...p,
        businessHours: [...others, { ...current, ...patch }].sort((a, b) => a.day - b.day),
      };
    });
  };

  const storeUrl = config.slug ? getStoreUrl(config.slug) : "";

  const copyStoreUrl = async () => {
    if (!storeUrl) return;
    try {
      await navigator.clipboard.writeText(storeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { alert("No se pudo copiar el enlace"); }
  };

  useEffect(() => {
    api.get("/api/admin/config")
      .then(res => {
        const d = res.data || {};
        setConfig(prev => ({
          ...prev,
          ...d,
          freeDeliveryFrom: d.freeDeliveryFrom ?? 0,
          closedMessage: d.closedMessage ?? "",
          deliveryMode: d.deliveryMode === "DISTANCE" ? "DISTANCE" : "FLAT",
          isOpen: d.isOpen ?? true,
          adminCanViewExpectedCash: d.adminCanViewExpectedCash ?? true,
          cashCutEmailEnabled: d.cashCutEmailEnabled ?? false,
          cashCutEmails: d.cashCutEmails ?? "",
          scheduleEnabled: d.scheduleEnabled ?? false,
          countryCode: d.countryCode || "MX",
          timezone: d.timezone || "America/Mexico_City",
          businessHours: (() => {
            try {
              const parsed = JSON.parse(d.businessHours || "[]");
              return Array.isArray(parsed) ? parsed : [];
            } catch { return []; }
          })(),
        }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const { slug: _slug, ...rest } = config;
      await api.put("/api/admin/config", {
        ...rest,
        freeDeliveryFrom: config.freeDeliveryFrom > 0 ? config.freeDeliveryFrom : null,
        // businessHours viaja como JSON serializado (mismo patrón que Banners).
        businessHours: JSON.stringify(config.businessHours),
      });
      window.location.reload();
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || "Error desconocido";
      alert(`Error al guardar (${status ?? "sin respuesta"}): ${msg}`);
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <WtScreen>
        <PageHeader eyebrow="Tienda online" title="Tienda" subtitle="Configura tu tienda online y reglas de pedido" />
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-[18px] bg-surf-2" />
          ))}
        </div>
      </WtScreen>
    );
  }

  const THEMES = [
    { id: "KAWAII", name: "Kawaii", icon: Flower2, desc: "Pastel lavanda · bubble-tea · cute 🧋" },
    { id: "MUNDIALISTA", name: "Mundialista", icon: Trophy, desc: "Estadio oscuro · Dorado · Mundial ⚽" },
  ];

  return (
    <WtScreen>
      <PageHeader
        eyebrow="Tienda online"
        title="Tienda"
        subtitle="Configura tu tienda online y reglas de pedido"
        actions={<PrimaryBtn icon={Store} full={false} onClick={handleSave} disabled={saving}>{saving ? "Guardando…" : "Guardar tienda"}</PrimaryBtn>}
      />

      {/* Card destacada de la tienda online: URL + estado */}
      {storeUrl && (
        <WtCard className="mb-4 p-5 md:p-6">
          <SectionHead title="Tu tienda online" />
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(storeUrl)}`}
              alt="QR de la tienda"
              width={130}
              height={130}
              className="shrink-0 rounded-2xl bg-white p-2"
            />
            <div className="w-full min-w-0 flex-1">
              <div className="mb-3 flex items-center justify-between gap-3 rounded-xl px-3 py-3" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
                <Link2 size={15} className="shrink-0 text-tx-mut" />
                <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-primary">{storeUrl}</span>
              </div>
              {/* 2 stats: estado y tiempo estimado */}
              <div className="mb-3 grid grid-cols-2 gap-3">
                <StatTile
                  icon={Power}
                  value={<span style={{ color: config.isOpen ? "var(--ok)" : "var(--err)" }}>{config.isOpen ? "Abierta" : "Cerrada"}</span>}
                  label={config.isOpen ? "Recibiendo pedidos" : "Pedidos bloqueados"}
                />
                <StatTile icon={Clock} value={`${config.estimatedDelivery} min`} label="Entrega estimada" />
              </div>
              <div className="flex gap-2">
                <PrimaryBtn ghost icon={copied ? Check : Copy} onClick={copyStoreUrl}>{copied ? "¡Copiado!" : "Copiar enlace"}</PrimaryBtn>
                <PrimaryBtn icon={ExternalLink} href={storeUrl}>Ver tienda</PrimaryBtn>
              </div>
            </div>
          </div>
        </WtCard>
      )}

      <div className="space-y-4">
        {/* Estado de la tienda */}
        <WtCard className="p-5 md:p-6">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Power size={16} className="shrink-0 text-tx-mid" />
                <p className="font-display text-base font-extrabold text-tx-hi">Estado de la tienda</p>
              </div>
              <p className="mt-1 text-[12px] text-tx-mut">
                {config.isOpen ? "Abierta — recibiendo pedidos" : "Cerrada — pedidos bloqueados"}
              </p>
            </div>
            <Toggle checked={config.isOpen} onChange={(v) => setConfig(p => ({ ...p, isOpen: v }))} label="Estado de la tienda" />
          </div>
          {!config.isOpen && (
            <div className="mt-4">
              <FieldLabel>Mensaje al cliente (tienda cerrada)</FieldLabel>
              <input type="text" value={config.closedMessage} placeholder="Ej. Volvemos mañana a las 9:00 am" onChange={(e) => { const v = e.target.value; setConfig(p => ({ ...p, closedMessage: v })); }} className={INPUT_CLS} style={INPUT_STYLE} />
            </div>
          )}
        </WtCard>

        {/* Corte de caja — visibilidad del efectivo esperado */}
        <WtCard className="p-5 md:p-6">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Wallet size={16} className="shrink-0 text-tx-mid" />
                <p className="font-display text-base font-extrabold text-tx-hi">Corte de caja</p>
              </div>
              <p className="mt-1 text-[12px] text-tx-mut">
                {config.adminCanViewExpectedCash
                  ? "Admins y gerentes ven el efectivo esperado al hacer el corte."
                  : "Corte ciego estricto: ni los admins ven el esperado (solo empleados con permiso explícito)."}
              </p>
            </div>
            <Toggle checked={config.adminCanViewExpectedCash} onChange={(v) => setConfig(p => ({ ...p, adminCanViewExpectedCash: v }))} label="Admins ven el efectivo esperado" />
          </div>
        </WtCard>

        {/* Corte de caja — envío automático por correo al cierre */}
        <WtCard className="p-5 md:p-6">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Mail size={16} className="shrink-0 text-tx-mid" />
                <p className="font-display text-base font-extrabold text-tx-hi">Corte por correo</p>
              </div>
              <p className="mt-1 text-[12px] text-tx-mut">
                {config.cashCutEmailEnabled
                  ? "Al cerrar la caja (restaurante y tienda) se envía el resumen del corte por correo."
                  : "Recibe el corte de caja en tu correo cada vez que se cierra la caja, tanto del restaurante como de la tienda."}
              </p>
            </div>
            <Toggle checked={config.cashCutEmailEnabled} onChange={(v) => setConfig(p => ({ ...p, cashCutEmailEnabled: v }))} label="Enviar el corte por correo" />
          </div>
          {config.cashCutEmailEnabled && (
            <div className="mt-4">
              <FieldLabel>Correo(s) destino</FieldLabel>
              <input
                type="text"
                value={config.cashCutEmails}
                placeholder="dueño@correo.com, contador@correo.com"
                onChange={(e) => { const v = e.target.value; setConfig(p => ({ ...p, cashCutEmails: v })); }}
                className={INPUT_CLS}
                style={INPUT_STYLE}
              />
              <p className="mt-1.5 text-[11px] text-tx-mut">
                Separa varios correos con coma. Si lo dejas vacío, se envía a los administradores del restaurante.
              </p>
            </div>
          )}
        </WtCard>

        {/* País / WhatsApp */}
        <WtCard className="p-5 md:p-6">
          <div className="mb-3 flex items-center gap-2">
            <Globe size={16} className="shrink-0 text-tx-mid" />
            <div className="min-w-0">
              <p className="font-display text-base font-extrabold text-tx-hi">País</p>
              <p className="mt-0.5 text-[12px] text-tx-mut">Define la lada que se antepone a los teléfonos en los enlaces de WhatsApp</p>
            </div>
          </div>
          <select
            value={config.countryCode}
            onChange={(e) => { const v = e.target.value; setConfig(p => ({ ...p, countryCode: v })); }}
            className={INPUT_CLS} style={INPUT_STYLE}
          >
            {COUNTRIES.map(c => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </WtCard>

        {/* Horario de atención automático */}
        <WtCard className="p-5 md:p-6">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Clock size={16} className="shrink-0 text-tx-mid" />
                <p className="font-display text-base font-extrabold text-tx-hi">Horario automático</p>
              </div>
              <p className="mt-1 text-[12px] text-tx-mut">
                {config.scheduleEnabled ? "La tienda abre y cierra sola según el horario" : "Desactivado — controlas la apertura manualmente"}
              </p>
            </div>
            <Toggle checked={config.scheduleEnabled} onChange={(v) => setConfig(p => ({ ...p, scheduleEnabled: v }))} label="Horario automático" />
          </div>

          {config.scheduleEnabled && (
            <div className="mt-4 space-y-4">
              {!config.isOpen && (
                <p className="flex items-start gap-2 rounded-2xl px-4 py-3 text-[11.5px] font-semibold" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  El interruptor «Estado de la tienda» está en cerrado y manda sobre el horario: la tienda seguirá cerrada hasta que lo vuelvas a abrir.
                </p>
              )}

              <div>
                <FieldLabel>Zona horaria</FieldLabel>
                <select
                  value={config.timezone}
                  onChange={(e) => { const v = e.target.value; setConfig(p => ({ ...p, timezone: v })); }}
                  className={INPUT_CLS} style={INPUT_STYLE}
                >
                  {TIMEZONES.map(tz => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                {WEEK_DAYS.map(d => {
                  const h = getDayHour(d.value);
                  return (
                    <div key={d.value} className="flex items-center gap-3 rounded-2xl px-3 py-2.5" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
                      <Toggle checked={h.enabled} onChange={(v) => setDayHour(d.value, { enabled: v })} label={`${d.label} abierto`} />
                      <span className="w-20 shrink-0 text-[12.5px] font-bold text-tx">{d.label}</span>
                      {h.enabled ? (
                        <div className="ml-auto flex items-center gap-2">
                          <input
                            type="time"
                            value={h.open}
                            onChange={(e) => { const v = e.target.value; setDayHour(d.value, { open: v }); }}
                            className="min-h-10 rounded-xl px-2 text-sm font-bold outline-none focus:border-[var(--brand-primary)]"
                            style={INPUT_STYLE}
                          />
                          <span className="text-xs font-bold text-tx-dim">a</span>
                          <input
                            type="time"
                            value={h.close}
                            onChange={(e) => { const v = e.target.value; setDayHour(d.value, { close: v }); }}
                            className="min-h-10 rounded-xl px-2 text-sm font-bold outline-none focus:border-[var(--brand-primary)]"
                            style={INPUT_STYLE}
                          />
                        </div>
                      ) : (
                        <span className="ml-auto font-mono text-[10px] uppercase tracking-[.12em] text-tx-dim">Cerrado</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] leading-relaxed text-tx-mut">
                Tip: para un turno nocturno que cruza medianoche (ej. 18:00 → 02:00), pon la hora de cierre menor a la de apertura.
              </p>
            </div>
          )}
        </WtCard>

        {/* Contacto y tema */}
        <WtCard className="p-5 md:p-6">
          <div className="mb-4">
            <p className="font-display text-base font-extrabold text-tx-hi">Contacto público</p>
            <p className="mt-0.5 text-[12px] text-tx-mut">Datos que verá el cliente en tu tienda</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel><Phone size={11} className="mr-1 inline" /> Teléfono</FieldLabel>
              <input type="text" value={config.phone} onChange={(e) => { const v = e.target.value; setConfig(p => ({ ...p, phone: v })); }} className={INPUT_CLS} style={INPUT_STYLE} />
            </div>
            <div>
              <FieldLabel><MessageCircle size={11} className="mr-1 inline" /> Mensajería</FieldLabel>
              <input type="text" value={config.whatsappNumber} onChange={(e) => { const v = e.target.value; setConfig(p => ({ ...p, whatsappNumber: v })); }} className={INPUT_CLS} style={INPUT_STYLE} />
            </div>
          </div>

          <div className="mt-4">
            <FieldLabel><MapPin size={11} className="mr-1 inline" /> Dirección principal</FieldLabel>
            <input type="text" value={config.address} onChange={(e) => { const v = e.target.value; setConfig(p => ({ ...p, address: v })); }} className={INPUT_CLS} style={INPUT_STYLE} />
          </div>

          <div className="mt-5">
            <FieldLabel><Palette size={11} className="mr-1 inline" /> Estilo de tienda online</FieldLabel>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {THEMES.map(t => {
                const active = config.storefrontTheme === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setConfig(p => ({ ...p, storefrontTheme: t.id }))}
                    className="flex min-h-[60px] items-start gap-3 rounded-2xl p-4 text-left transition-colors"
                    style={{
                      border: `2px solid ${active ? "var(--brand-primary)" : "var(--bd-1)"}`,
                      background: active ? "var(--iris-soft)" : "var(--surf-2)",
                    }}
                  >
                    <t.icon size={20} className="mt-0.5 shrink-0" style={{ color: active ? "var(--brand-primary)" : "var(--tx-mut)" }} />
                    <div className="min-w-0">
                      <p className="font-display text-sm font-extrabold text-tx-hi">{t.name}</p>
                      <p className="mt-0.5 text-[11px] text-tx-mut">{t.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Imagen de portada (hero) — la usa el tema Mundialista a todo lo ancho */}
          <div className="mt-5">
            <FieldLabel><ImagePlus size={11} className="mr-1 inline" /> Imagen de portada (hero)</FieldLabel>
            <p className="mb-2 text-[11px] text-tx-mut">Se muestra a todo lo ancho arriba (tema Mundialista). Recomendado panorámico ~1600×520. Se sube sin recorte.</p>
            {config.storefrontHeroUrl ? (
              <div className="relative overflow-hidden rounded-xl" style={{ border: "1px solid var(--bd-1)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={config.storefrontHeroUrl} alt="Portada" className="w-full object-cover" style={{ maxHeight: 180 }} />
                <button
                  type="button"
                  onClick={() => setConfig(p => ({ ...p, storefrontHeroUrl: "" }))}
                  className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full"
                  style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}
                  aria-label="Quitar imagen"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <label
                className="flex cursor-pointer items-center justify-center gap-2 rounded-xl py-6 text-sm font-semibold"
                style={{ border: "1.5px dashed var(--bd-1)", background: "var(--surf-2)", color: "var(--tx-mid)" }}
              >
                <Upload size={16} /> {heroUploading ? "Subiendo…" : "Subir imagen de portada"}
                <input type="file" accept="image/*" className="hidden" onChange={uploadHero} disabled={heroUploading} />
              </label>
            )}
            <input
              type="text"
              value={config.storefrontHeroUrl || ""}
              placeholder="…o pega una URL de imagen"
              onChange={(e) => { const v = e.target.value; setConfig(p => ({ ...p, storefrontHeroUrl: v })); }}
              className={INPUT_CLS}
              style={{ ...INPUT_STYLE, marginTop: 8 }}
            />
          </div>
        </WtCard>

        {/* Envíos y reglas de la tienda online */}
        <WtCard className="p-5 md:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Truck size={16} className="shrink-0 text-tx-mid" />
            <div className="min-w-0">
              <p className="font-display text-base font-extrabold text-tx-hi">Envíos y reglas de pedido</p>
              <p className="mt-0.5 text-[12px] text-tx-mut">Reglas que verá el cliente al pedir</p>
            </div>
          </div>

          {/* Modo de cobro de envío */}
          <FieldLabel>Modo de cobro de envío</FieldLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              { id: "FLAT", name: "Tarifa fija", desc: "Un costo único para todos" },
              { id: "DISTANCE", name: "Por distancia", desc: "Base + costo por km" },
            ].map(m => {
              const active = config.deliveryMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setConfig(p => ({ ...p, deliveryMode: m.id as "FLAT" | "DISTANCE" }))}
                  className="rounded-2xl p-4 text-left transition-colors"
                  style={{
                    border: `2px solid ${active ? "var(--brand-primary)" : "var(--bd-1)"}`,
                    background: active ? "var(--iris-soft)" : "var(--surf-2)",
                  }}
                >
                  <p className="font-display text-sm font-extrabold text-tx-hi">{m.name}</p>
                  <p className="mt-0.5 text-[11px] text-tx-mut">{m.desc}</p>
                </button>
              );
            })}
          </div>

          {/* Campos comunes */}
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {config.deliveryMode === "FLAT" && (
              <div>
                <FieldLabel>Costo de envío ($)</FieldLabel>
                <input type="number" min="0" value={config.deliveryFee} onChange={(e) => { const v = parseFloat(e.target.value) || 0; setConfig(p => ({ ...p, deliveryFee: v })); }} className={INPUT_CLS} style={INPUT_STYLE} />
              </div>
            )}
            <div>
              <FieldLabel>Compra mínima ($)</FieldLabel>
              <input type="number" min="0" value={config.minOrderAmount} onChange={(e) => { const v = parseFloat(e.target.value) || 0; setConfig(p => ({ ...p, minOrderAmount: v })); }} className={INPUT_CLS} style={INPUT_STYLE} />
            </div>
            <div>
              <FieldLabel>Envío gratis desde ($)</FieldLabel>
              <input type="number" min="0" value={config.freeDeliveryFrom} onChange={(e) => { const v = parseFloat(e.target.value) || 0; setConfig(p => ({ ...p, freeDeliveryFrom: v })); }} className={INPUT_CLS} style={INPUT_STYLE} />
              <p className="ml-1 mt-1 text-[10px] text-tx-dim">0 = sin envío gratis por monto</p>
            </div>
            <div>
              <FieldLabel>Tiempo estimado (min)</FieldLabel>
              <input type="number" min="0" value={config.estimatedDelivery} onChange={(e) => { const v = parseInt(e.target.value) || 0; setConfig(p => ({ ...p, estimatedDelivery: v })); }} className={INPUT_CLS} style={INPUT_STYLE} />
            </div>
          </div>

          {/* Configuración por distancia */}
          {config.deliveryMode === "DISTANCE" && (
            <div className="mt-4 space-y-5 rounded-3xl p-5" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[.12em] text-primary">Origen de la tienda</p>
                  <p className="mt-0.5 text-[11px] text-tx-mut">
                    {config.originLat != null && config.originLng != null
                      ? `${config.originLat.toFixed(5)}, ${config.originLng.toFixed(5)}`
                      : "Sin ubicación — define el punto de salida"}
                  </p>
                </div>
                <PrimaryBtn ghost icon={Crosshair} full={false} onClick={useMyLocation}>
                  {geoStatus === "loading" ? "Obteniendo…" : "Usar mi ubicación"}
                </PrimaryBtn>
              </div>
              {geoStatus === "error" && <p className="text-[11px] font-bold text-err">No se pudo obtener la ubicación. Permite el acceso al GPS o ingrésala manualmente.</p>}
              <MapLocationPicker
                value={config.originLat != null && config.originLng != null ? { lat: config.originLat, lng: config.originLng } : null}
                onChange={({ lat, lng }) => setConfig(p => ({ ...p, originLat: lat, originLng: lng }))}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel>Latitud</FieldLabel>
                  <input type="number" step="any" value={config.originLat ?? ""} onChange={(e) => { const v = e.target.value === "" ? null : parseFloat(e.target.value); setConfig(p => ({ ...p, originLat: v })); }} className={INPUT_CLS} style={INPUT_STYLE} />
                </div>
                <div>
                  <FieldLabel>Longitud</FieldLabel>
                  <input type="number" step="any" value={config.originLng ?? ""} onChange={(e) => { const v = e.target.value === "" ? null : parseFloat(e.target.value); setConfig(p => ({ ...p, originLng: v })); }} className={INPUT_CLS} style={INPUT_STYLE} />
                </div>
                <div>
                  <FieldLabel>Tarifa base ($)</FieldLabel>
                  <input type="number" min="0" value={config.deliveryBaseFee} onChange={(e) => { const v = parseFloat(e.target.value) || 0; setConfig(p => ({ ...p, deliveryBaseFee: v })); }} className={INPUT_CLS} style={INPUT_STYLE} />
                </div>
                <div>
                  <FieldLabel>Costo por km ($)</FieldLabel>
                  <input type="number" min="0" value={config.deliveryPerKm} onChange={(e) => { const v = parseFloat(e.target.value) || 0; setConfig(p => ({ ...p, deliveryPerKm: v })); }} className={INPUT_CLS} style={INPUT_STYLE} />
                </div>
                <div>
                  <FieldLabel>Radio gratis (km)</FieldLabel>
                  <input type="number" min="0" step="any" value={config.deliveryFreeRadiusKm ?? ""} placeholder="opcional" onChange={(e) => { const v = e.target.value === "" ? null : parseFloat(e.target.value); setConfig(p => ({ ...p, deliveryFreeRadiusKm: v })); }} className={INPUT_CLS} style={INPUT_STYLE} />
                  <p className="ml-1 mt-1 text-[10px] text-tx-dim">Dentro de este radio el envío es gratis</p>
                </div>
                <div>
                  <FieldLabel>Distancia máxima (km)</FieldLabel>
                  <input type="number" min="0" step="any" value={config.deliveryMaxKm ?? ""} placeholder="opcional" onChange={(e) => { const v = e.target.value === "" ? null : parseFloat(e.target.value); setConfig(p => ({ ...p, deliveryMaxKm: v })); }} className={INPUT_CLS} style={INPUT_STYLE} />
                  <p className="ml-1 mt-1 text-[10px] text-tx-dim">Fuera de este radio no hay cobertura</p>
                </div>
              </div>
              <p className="text-[11px] leading-relaxed text-tx-mut">
                Fórmula: <span className="text-primary">tarifa base + (costo por km × distancia)</span>. La distancia se mide en línea recta desde el origen hasta la ubicación GPS del cliente en el checkout.
              </p>
            </div>
          )}
        </WtCard>

        {/* Programa de puntos */}
        <WtCard className="p-5 md:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Star size={16} className="shrink-0 text-tx-mid" />
            <div className="min-w-0">
              <p className="font-display text-base font-extrabold text-tx-hi">Programa de puntos</p>
              <p className="mt-0.5 text-[12px] text-tx-mut">Lealtad de tus clientes</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel>Puntos por cada $10</FieldLabel>
              <input type="number" min="0" value={config.pointsPerTen} onChange={(e) => { const v = parseInt(e.target.value) || 0; setConfig(p => ({ ...p, pointsPerTen: v })); }} className={INPUT_CLS} style={INPUT_STYLE} />
            </div>
            <div>
              <FieldLabel>Valor del punto ($)</FieldLabel>
              <input type="number" min="0" step="any" value={config.pointsValuePesos} onChange={(e) => { const v = parseFloat(e.target.value) || 0; setConfig(p => ({ ...p, pointsValuePesos: v })); }} className={INPUT_CLS} style={INPUT_STYLE} />
            </div>
          </div>
          <RewardsManager />
        </WtCard>

        {/* Cupones de descuento (exclusivos de la tienda online) */}
        <WtCard className="p-5 md:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Ticket size={16} className="shrink-0 text-tx-mid" />
            <div className="min-w-0">
              <p className="font-display text-base font-extrabold text-tx-hi">Cupones de descuento</p>
              <p className="mt-0.5 text-[12px] text-tx-mut">Códigos que el cliente escribe al pagar en la tienda online</p>
            </div>
          </div>
          <CouponsManager />
        </WtCard>

        <PrimaryBtn icon={Store} onClick={handleSave} disabled={saving}>
          {saving ? "Guardando…" : "Guardar tienda"}
        </PrimaryBtn>
      </div>
    </WtScreen>
  );
}
