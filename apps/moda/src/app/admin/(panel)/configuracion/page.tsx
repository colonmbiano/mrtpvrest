"use client";

import { useState, type ReactNode } from "react";
import { Store, Users, Smartphone, Receipt, Bell, UserPlus, MoreVertical } from "lucide-react";
import AdminTopbar from "@/components/admin/AdminTopbar";
import { DataCard, SectionTabs, ToggleSwitch, StatusBadge } from "@/components/admin/atoms";

const TABS = [
  { key: "tienda", label: "Tienda", sub: "Ajustes de tu tienda", icon: Store },
  { key: "usuarios", label: "Usuarios y roles", sub: "Administra tu equipo", icon: Users },
  { key: "dispositivos", label: "Dispositivos", sub: "Terminales y equipos", icon: Smartphone },
  { key: "facturacion", label: "Facturación", sub: "Planes y pagos", icon: Receipt },
  { key: "notificaciones", label: "Notificaciones", sub: "Preferencias y alertas", icon: Bell },
];

const USERS = [
  { name: "Renata García", email: "renata.bg@gmail.com", role: "Administrador", active: true },
  { name: "Juan Martínez", email: "juan.mtz@modamas.com", role: "Gerente", active: true },
  { name: "Luis Cáceres", email: "luis.caceres@modamas.com", role: "Cajero", active: true },
  { name: "Ana Morales", email: "ana.morales@modamas.com", role: "Cajero", active: true },
  { name: "Carla Pineda", email: "carla.pineda@modamas.com", role: "Cajero", active: false },
];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[12px] font-semibold text-[var(--tx-mut)]">{label}</span>{children}</label>;
}
const inputCls = "h-11 w-full rounded-xl border bg-[var(--surf-1)] px-3.5 text-[13px] text-[var(--tx-hi)] outline-none focus:border-[var(--brand-primary)]";

export default function ConfiguracionPage() {
  const [tab, setTab] = useState("tienda");
  const [pref, setPref] = useState({ redondeo: true, ivaIncl: false, sinStock: false, codigos: true });
  const [notif, setNotif] = useState({ diarias: true, stock: true, nuevas: false, semanales: true });
  const p = (k: keyof typeof pref) => (v: boolean) => setPref((s) => ({ ...s, [k]: v }));
  const n = (k: keyof typeof notif) => (v: boolean) => setNotif((s) => ({ ...s, [k]: v }));

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <AdminTopbar title="Configuración" subtitle="Gestiona los ajustes generales de tu tienda y equipo." />

      <SectionTabs tabs={TABS} active={tab} onChange={setTab} />

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DataCard title="Información de la tienda" action={<button type="button" className="rounded-lg px-3 py-1.5 text-[12px] font-bold text-white" style={{ background: "var(--brand-primary)" }}>Guardar cambios</button>}>
          <p className="-mt-1 mb-4 text-[12px] text-[var(--tx-mut)]">Actualiza los datos principales de tu tienda.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nombre de la tienda"><input className={inputCls} defaultValue="MODA+ Store Centro" /></Field>
            <Field label="Correo electrónico"><input className={inputCls} defaultValue="contacto@modamas.com" /></Field>
            <Field label="Teléfono"><input className={inputCls} defaultValue="+52 55 1234 5678" /></Field>
            <Field label="RFC / NIT (opcional)"><input className={inputCls} placeholder="Ej. ABCD123456XYZ" /></Field>
            <div className="sm:col-span-2"><Field label="Dirección"><textarea className={`${inputCls} h-auto py-2.5`} rows={2} defaultValue="Av. Insurgentes Sur 1234, Col. Del Valle, Benito Juárez, Ciudad de México, C.P. 03100" /></Field></div>
            <Field label="Moneda"><select className={inputCls}><option>Peso mexicano (MXN)</option><option>Dólar (USD)</option></select></Field>
            <Field label="Zona horaria"><select className={inputCls}><option>(GMT-06:00) Ciudad de México</option></select></Field>
          </div>

          <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--bd-1)" }}>
            <div className="mb-2 text-[14px] font-bold text-[var(--tx-hi)]">Preferencias de la tienda</div>
            <PrefRow label="Redondeo de totales" sub="Redondear automáticamente los totales al cerrar ventas." on={pref.redondeo} set={p("redondeo")} />
            <PrefRow label="Impuestos incluidos por defecto" sub="Todos los precios se muestran con impuestos incluidos." on={pref.ivaIncl} set={p("ivaIncl")} />
            <PrefRow label="Permitir ventas sin stock" sub="Permitir realizar ventas aunque el producto no tenga stock disponible." on={pref.sinStock} set={p("sinStock")} />
            <PrefRow label="Mostrar códigos de producto" sub="Mostrar códigos de producto en tickets y comprobantes." on={pref.codigos} set={p("codigos")} />
          </div>
        </DataCard>

        <div className="space-y-4">
          <DataCard title="Usuarios y roles" action={<button type="button" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold text-white" style={{ background: "var(--brand-primary)" }}><UserPlus size={14} /> Invitar usuario</button>}>
            <p className="-mt-1 mb-3 text-[12px] text-[var(--tx-mut)]">Gestiona los usuarios que tienen acceso al sistema.</p>
            <ul className="space-y-1">
              {USERS.map((u) => {
                const initials = u.name.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();
                return (
                  <li key={u.email} className="flex items-center gap-3 rounded-xl px-1 py-2">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-bold" style={{ background: "var(--iris-soft)", color: "var(--brand-dark)" }}>{initials}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold text-[var(--tx-hi)]">{u.name}</span><span className="block truncate text-[11px] text-[var(--tx-mut)]">{u.email}</span></span>
                    <StatusBadge status={u.role} />
                    <StatusBadge status={u.active ? "activo" : "inactivo"} label={u.active ? "Activo" : "Inactivo"} />
                    <MoreVertical size={16} className="shrink-0 text-[var(--tx-dim)]" />
                  </li>
                );
              })}
            </ul>
          </DataCard>

          <DataCard title="Notificaciones">
            <p className="-mt-1 mb-2 text-[12px] text-[var(--tx-mut)]">Configura cómo y cuándo quieres recibir notificaciones.</p>
            <PrefRow label="Ventas diarias" sub="Recibe un resumen diario de ventas por correo." on={notif.diarias} set={n("diarias")} />
            <PrefRow label="Alertas de stock bajo" sub="Recibe alertas cuando los productos estén por debajo del stock mínimo." on={notif.stock} set={n("stock")} />
            <PrefRow label="Nuevas ventas" sub="Notificación en tiempo real al registrar una nueva venta." on={notif.nuevas} set={n("nuevas")} />
            <PrefRow label="Reportes semanales" sub="Recibe reportes semanales de rendimiento de la tienda." on={notif.semanales} set={n("semanales")} />
          </DataCard>
        </div>
      </div>
    </div>
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
