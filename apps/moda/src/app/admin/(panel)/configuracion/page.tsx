"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Store, Users, Bell, UserPlus, Warehouse, Save, RefreshCw, X, Check, AlertTriangle,
} from "lucide-react";
import AdminTopbar from "@/components/admin/AdminTopbar";
import { DataCard, SectionTabs, ToggleSwitch, StatusBadge, EmptyState } from "@/components/admin/atoms";
import api from "@/lib/admin-api";

const TABS = [
  { key: "tienda", label: "Tienda", sub: "Datos y preferencias", icon: Store },
  { key: "usuarios", label: "Usuarios y roles", sub: "Administra tu equipo", icon: Users },
  { key: "notificaciones", label: "Notificaciones", sub: "Preferencias del panel", icon: Bell },
];

const TIMEZONES = [
  { v: "America/Mexico_City", l: "(GMT-06:00) Ciudad de México" },
  { v: "America/Monterrey", l: "(GMT-06:00) Monterrey" },
  { v: "America/Cancun", l: "(GMT-05:00) Cancún" },
  { v: "America/Tijuana", l: "(GMT-08:00) Tijuana" },
  { v: "America/Hermosillo", l: "(GMT-07:00) Hermosillo" },
  { v: "America/Bogota", l: "(GMT-05:00) Bogotá" },
  { v: "America/Argentina/Buenos_Aires", l: "(GMT-03:00) Buenos Aires" },
  { v: "Europe/Madrid", l: "(GMT+01:00) Madrid" },
];
const COUNTRIES = [
  { v: "MX", l: "México" }, { v: "US", l: "Estados Unidos" }, { v: "CO", l: "Colombia" },
  { v: "AR", l: "Argentina" }, { v: "CL", l: "Chile" }, { v: "PE", l: "Perú" }, { v: "ES", l: "España" },
];
const ROLE_OPTIONS = [
  { v: "CASHIER", l: "Cajero" }, { v: "MANAGER", l: "Gerente" }, { v: "ADMIN", l: "Administrador" },
];
const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrador", SUPER_ADMIN: "Administrador", OWNER: "Administrador",
  MANAGER: "Gerente", CASHIER: "Cajero", WAITER: "Cajero",
};

const NOTIF_KEY = "moda-admin-notif-prefs";
const NOTIF_DEFAULTS = { diarias: true, stock: true, nuevas: false, semanales: true };

type Config = {
  name?: string;
  phone?: string | null;
  whatsappNumber?: string | null;
  address?: string | null;
  timezone?: string | null;
  countryCode?: string | null;
  centralWarehouseEnabled?: boolean;
};
type Employee = { id: string; name: string; role: string; phone?: string | null; isActive?: boolean; hasPin?: boolean };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[12px] font-semibold text-[var(--tx-mut)]">{label}</span>{children}</label>;
}
const inputCls = "h-11 w-full rounded-xl border bg-[var(--surf-1)] px-3.5 text-[13px] text-[var(--tx-hi)] outline-none focus:border-[var(--brand-primary)] disabled:opacity-60";

function Toast({ kind, msg, onDone }: { kind: "ok" | "err"; msg: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3200); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className="fixed bottom-5 right-5 z-[70] flex items-center gap-2 rounded-xl px-4 py-3 text-[13px] font-semibold text-white shadow-lg" style={{ background: kind === "ok" ? "var(--ok)" : "var(--err)" }}>
      {kind === "ok" ? <Check size={16} /> : <AlertTriangle size={16} />} {msg}
    </div>
  );
}

// ── Tab: Tienda ───────────────────────────────────────────────────────────────
function TiendaTab({ toast }: { toast: (k: "ok" | "err", m: string) => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orig, setOrig] = useState<Config>({});
  const [form, setForm] = useState<Config>({});
  const set = (k: keyof Config) => (v: Config[keyof Config]) => setForm((s) => ({ ...s, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Config>("/api/admin/config");
      const c: Config = {
        name: res.data.name || "",
        phone: res.data.phone || "",
        whatsappNumber: res.data.whatsappNumber || "",
        address: res.data.address || "",
        timezone: res.data.timezone || "America/Mexico_City",
        countryCode: res.data.countryCode || "MX",
        centralWarehouseEnabled: Boolean(res.data.centralWarehouseEnabled),
      };
      setOrig(c); setForm(c);
    } catch {
      toast("err", "No se pudo cargar la configuración.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      if ((form.name || "").trim() && form.name !== orig.name) {
        await api.put("/api/admin/brand", { name: (form.name || "").trim() });
      }
      await api.put("/api/admin/config", {
        phone: form.phone || "",
        whatsappNumber: form.whatsappNumber || "",
        address: form.address || "",
        timezone: form.timezone || "America/Mexico_City",
        countryCode: form.countryCode || "MX",
        centralWarehouseEnabled: Boolean(form.centralWarehouseEnabled),
      });
      setOrig(form);
      toast("ok", "Cambios guardados.");
    } catch (e) {
      toast("err", (e as { message?: string })?.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(orig), [form, orig]);

  return (
    <DataCard
      title="Información de la tienda"
      action={
        <button type="button" onClick={save} disabled={saving || loading || !dirty} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50" style={{ background: "var(--brand-primary)" }}>
          {saving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />} Guardar cambios
        </button>
      }
    >
      <p className="-mt-1 mb-4 text-[12px] text-[var(--tx-mut)]">Actualiza los datos principales de tu tienda. Se guardan en tu cuenta.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nombre de la tienda"><input className={inputCls} disabled={loading} value={form.name || ""} onChange={(e) => set("name")(e.target.value)} placeholder="Mi tienda" /></Field>
        <Field label="Teléfono"><input className={inputCls} disabled={loading} value={form.phone || ""} onChange={(e) => set("phone")(e.target.value)} placeholder="+52 55 1234 5678" /></Field>
        <Field label="WhatsApp"><input className={inputCls} disabled={loading} value={form.whatsappNumber || ""} onChange={(e) => set("whatsappNumber")(e.target.value)} placeholder="55 1234 5678" /></Field>
        <Field label="País"><select className={inputCls} disabled={loading} value={form.countryCode || "MX"} onChange={(e) => set("countryCode")(e.target.value)}>{COUNTRIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}</select></Field>
        <div className="sm:col-span-2"><Field label="Dirección"><textarea className={`${inputCls} h-auto py-2.5`} disabled={loading} rows={2} value={form.address || ""} onChange={(e) => set("address")(e.target.value)} placeholder="Calle, número, colonia, ciudad, C.P." /></Field></div>
        <div className="sm:col-span-2"><Field label="Zona horaria"><select className={inputCls} disabled={loading} value={form.timezone || "America/Mexico_City"} onChange={(e) => set("timezone")(e.target.value)}>{TIMEZONES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</select></Field></div>
      </div>

      <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--bd-1)" }}>
        <div className="mb-2 text-[14px] font-bold text-[var(--tx-hi)]">Inventario</div>
        <div className="flex items-center justify-between gap-3 py-2">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: "var(--iris-soft)", color: "var(--brand-dark)" }}><Warehouse size={16} /></span>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-[var(--tx-hi)]">Bodega central</div>
              <div className="text-[11px] text-[var(--tx-mut)]">Las compras entran a una bodega central y se reparten a las sucursales por traspaso. Para cadenas con varias tiendas.</div>
            </div>
          </div>
          <ToggleSwitch on={Boolean(form.centralWarehouseEnabled)} onChange={loading ? undefined : (v) => set("centralWarehouseEnabled")(v)} label="Bodega central" />
        </div>
      </div>
    </DataCard>
  );
}

// ── Tab: Usuarios ─────────────────────────────────────────────────────────────
function InviteModal({ onClose, onDone, toast }: { onClose: () => void; onDone: () => void; toast: (k: "ok" | "err", m: string) => void }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("CASHIER");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!name.trim()) return setErr("El nombre es obligatorio.");
    if (!/^\d{4,6}$/.test(pin)) return setErr("El PIN debe ser numérico de 4 a 6 dígitos.");
    setBusy(true);
    try {
      await api.post("/api/employees", { name: name.trim(), role, pin });
      toast("ok", "Usuario creado.");
      onDone();
    } catch (e) {
      setErr((e as { message?: string })?.message || "No se pudo crear el usuario.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={busy ? undefined : onClose} />
      <div className="relative w-full max-w-md rounded-[20px] border bg-[var(--surf-1)] p-5" style={{ borderColor: "var(--bd-1)", boxShadow: "var(--shadow-card)" }}>
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full" style={{ background: "var(--iris-soft)", color: "var(--brand-dark)" }}><UserPlus size={20} /></span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[16px] font-bold text-[var(--tx-hi)]">Invitar usuario</h3>
            <p className="mt-0.5 text-[13px] text-[var(--tx-mut)]">Entra a la caja con su PIN en la sucursal activa.</p>
          </div>
          <button type="button" onClick={busy ? undefined : onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--tx-dim)] hover:bg-[var(--surf-2)]" aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="mt-4 space-y-3">
          <Field label="Nombre"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} placeholder="Nombre del empleado" /></Field>
          <Field label="Rol"><select className={inputCls} value={role} onChange={(e) => setRole(e.target.value)} disabled={busy}>{ROLE_OPTIONS.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}</select></Field>
          <Field label="PIN (4 a 6 dígitos)"><input className={inputCls} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} disabled={busy} inputMode="numeric" placeholder="••••" /></Field>
        </div>

        {err && <p className="mt-3 rounded-xl px-3 py-2 text-[12px] font-semibold" style={{ background: "var(--err-soft)", color: "var(--err)" }}>{err}</p>}

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={busy ? undefined : onClose} disabled={busy} className="h-11 flex-1 rounded-xl border text-[14px] font-semibold text-[var(--tx-mut)] disabled:opacity-50" style={{ borderColor: "var(--bd-1)" }}>Cancelar</button>
          <button type="button" onClick={submit} disabled={busy} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-[14px] font-bold text-white disabled:opacity-60" style={{ background: "var(--brand-primary)" }}>
            {busy ? <RefreshCw size={16} className="animate-spin" /> : <UserPlus size={16} />} {busy ? "Creando…" : "Crear usuario"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UsuariosTab({ toast }: { toast: (k: "ok" | "err", m: string) => void }) {
  const [users, setUsers] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [invite, setInvite] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setDenied(false);
    try {
      const res = await api.get<Employee[]>("/api/employees");
      setUsers(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      if ((e as { response?: { status?: number } })?.response?.status === 403) setDenied(true);
      else toast("err", "No se pudieron cargar los usuarios.");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const toggleActive = async (u: Employee) => {
    setToggling(u.id);
    try {
      await api.put(`/api/employees/${u.id}`, { isActive: !u.isActive });
      setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, isActive: !u.isActive } : x)));
    } catch (e) {
      toast("err", (e as { message?: string })?.message || "No se pudo actualizar el usuario.");
    } finally {
      setToggling(null);
    }
  };

  return (
    <>
      <DataCard
        title="Usuarios y roles"
        action={<button type="button" onClick={() => setInvite(true)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold text-white" style={{ background: "var(--brand-primary)" }}><UserPlus size={14} /> Invitar usuario</button>}
      >
        <p className="-mt-1 mb-3 text-[12px] text-[var(--tx-mut)]">Gestiona quién tiene acceso a la caja y el panel de tu tienda.</p>
        {denied ? (
          <EmptyState icon={Users} title="No tienes permiso para ver usuarios" hint="Necesitas el permiso de gestión de usuarios (rol administrador)." />
        ) : loading ? (
          <div className="grid h-32 place-items-center"><RefreshCw size={20} className="animate-spin text-[var(--tx-dim)]" /></div>
        ) : users.length === 0 ? (
          <EmptyState icon={Users} title="Sin usuarios" hint="Invita al primer miembro de tu equipo." />
        ) : (
          <ul className="space-y-1">
            {users.map((u) => {
              const initials = (u.name || "?").split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();
              const active = u.isActive !== false;
              return (
                <li key={u.id} className="flex items-center gap-3 rounded-xl px-1 py-2">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-bold" style={{ background: "var(--iris-soft)", color: "var(--brand-dark)" }}>{initials}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold text-[var(--tx-hi)]">{u.name}</span><span className="block truncate text-[11px] text-[var(--tx-mut)]">{u.phone || "Sin teléfono"}</span></span>
                  <StatusBadge status={ROLE_LABEL[u.role] || u.role} />
                  <StatusBadge status={active ? "activo" : "inactivo"} label={active ? "Activo" : "Inactivo"} />
                  <span className="shrink-0" title={active ? "Desactivar" : "Activar"} style={{ opacity: toggling === u.id ? 0.5 : 1 }}>
                    <ToggleSwitch on={active} onChange={toggling === u.id ? undefined : () => toggleActive(u)} label={`Activar ${u.name}`} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </DataCard>
      {invite && <InviteModal onClose={() => setInvite(false)} onDone={() => { setInvite(false); load(); }} toast={toast} />}
    </>
  );
}

// ── Tab: Notificaciones (preferencias del panel, este dispositivo) ────────────
function NotificacionesTab() {
  const [notif, setNotif] = useState(NOTIF_DEFAULTS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(NOTIF_KEY);
      if (raw) setNotif({ ...NOTIF_DEFAULTS, ...JSON.parse(raw) });
    } catch { /* ignore */ }
  }, []);

  const set = (k: keyof typeof notif) => (v: boolean) => setNotif((s) => {
    const next = { ...s, [k]: v };
    try { localStorage.setItem(NOTIF_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });

  return (
    <DataCard title="Notificaciones">
      <p className="-mt-1 mb-2 text-[12px] text-[var(--tx-mut)]">Preferencias de avisos. Se guardan en este dispositivo.</p>
      <PrefRow label="Resumen de ventas diarias" sub="Ver un resumen diario de ventas al abrir el panel." on={notif.diarias} set={set("diarias")} />
      <PrefRow label="Alertas de stock bajo" sub="Avisar cuando productos estén por debajo del stock mínimo." on={notif.stock} set={set("stock")} />
      <PrefRow label="Nuevas ventas" sub="Resaltar nuevas ventas al actualizar el panel." on={notif.nuevas} set={set("nuevas")} />
      <PrefRow label="Reportes semanales" sub="Ver el resumen semanal de rendimiento de la tienda." on={notif.semanales} set={set("semanales")} />
    </DataCard>
  );
}

function PrefRow({ label, sub, on, set }: { label: string; sub: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t py-3 first:border-0" style={{ borderColor: "var(--bd-1)" }}>
      <div className="min-w-0"><div className="text-[13px] font-semibold text-[var(--tx-hi)]">{label}</div><div className="text-[11px] text-[var(--tx-mut)]">{sub}</div></div>
      <ToggleSwitch on={on} onChange={set} label={label} />
    </div>
  );
}

export default function ConfiguracionPage() {
  const [tab, setTab] = useState("tienda");
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const pushToast = useCallback((kind: "ok" | "err", msg: string) => setToast({ kind, msg }), []);

  // Re-cargar al cambiar de sucursal en el selector del sidebar.
  const [loc, setLoc] = useState(0);
  useEffect(() => {
    const r = () => setLoc((n) => n + 1);
    window.addEventListener("locationChanged", r);
    return () => window.removeEventListener("locationChanged", r);
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <AdminTopbar title="Configuración" subtitle="Gestiona los ajustes generales de tu tienda y equipo." />
      <SectionTabs tabs={TABS} active={tab} onChange={setTab} />
      <div className="mt-4" key={`${tab}-${loc}`}>
        {tab === "tienda" && <TiendaTab toast={pushToast} />}
        {tab === "usuarios" && <UsuariosTab toast={pushToast} />}
        {tab === "notificaciones" && <NotificacionesTab />}
      </div>
      {toast && <Toast kind={toast.kind} msg={toast.msg} onDone={() => setToast(null)} />}
    </div>
  );
}
