"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Save, Lock, AlertCircle, Activity } from "lucide-react";
import api from "@/lib/api";

interface SecurityConfig {
  requirePinForVoid: boolean;
  requirePinForRefund: boolean;
  requirePinForCancel: boolean;
  requirePinForDiscountAbove: number; // 0 = nunca
  requirePinForCashDrawer: boolean;
  autoLockAfterMinutes: number;
}

const DEFAULTS: SecurityConfig = {
  requirePinForVoid: true,
  requirePinForRefund: true,
  requirePinForCancel: true,
  requirePinForDiscountAbove: 15,
  requirePinForCashDrawer: false,
  autoLockAfterMinutes: 5,
};

interface AccessLog {
  id: string;
  action: string;
  employeeName: string | null;
  createdAt: string;
  metadata: any;
}

export default function SeguridadAdmin() {
  const [config, setConfig] = useState<SecurityConfig>(DEFAULTS);
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [cfg, accessLogs] = await Promise.all([
          api.get("/api/admin/config").catch(() => ({ data: {} })),
          api.get("/api/admin/access-log?limit=50").catch(() => ({ data: [] })),
        ]);
        setConfig({
          requirePinForVoid:           cfg.data?.requirePinForVoid ?? DEFAULTS.requirePinForVoid,
          requirePinForRefund:         cfg.data?.requirePinForRefund ?? DEFAULTS.requirePinForRefund,
          requirePinForCancel:         cfg.data?.requirePinForCancel ?? DEFAULTS.requirePinForCancel,
          requirePinForDiscountAbove:  cfg.data?.requirePinForDiscountAbove ?? DEFAULTS.requirePinForDiscountAbove,
          requirePinForCashDrawer:     cfg.data?.requirePinForCashDrawer ?? DEFAULTS.requirePinForCashDrawer,
          autoLockAfterMinutes:        cfg.data?.autoLockAfterMinutes ?? DEFAULTS.autoLockAfterMinutes,
        });
        setLogs(Array.isArray(accessLogs.data) ? accessLogs.data : []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await api.put("/api/admin/config", config);
      setMsg("Política de seguridad actualizada");
      setTimeout(() => setMsg(null), 2500);
    } catch (e: any) {
      setMsg(e?.response?.data?.error || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const policies: Array<{ key: keyof SecurityConfig; label: string; sub: string }> = [
    { key: "requirePinForVoid",        label: "PIN para anular ítems",     sub: "Pide PIN supervisor al quitar un producto del ticket activo" },
    { key: "requirePinForRefund",      label: "PIN para reembolsos",        sub: "Antes de procesar devolución de dinero" },
    { key: "requirePinForCancel",      label: "PIN para cancelar orden",    sub: "Al cancelar orden completa" },
    { key: "requirePinForCashDrawer",  label: "PIN para abrir cajón",       sub: "Apertura manual sin venta" },
  ];

  return (
    <div className="min-h-full p-8" style={{ background: "#0C0C0E", color: "#FFFFFF", fontFamily: "JetBrains Mono, monospace" }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[10px] font-bold tracking-wider" style={{ color: "#666" }}>ADMINISTRACIÓN</p>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck size={22} /> Seguridad</h1>
          <p className="text-xs mt-1" style={{ color: "#B8B9B6" }}>
            Define qué acciones requieren autorización con PIN supervisor.
          </p>
        </div>
        <button onClick={save} disabled={saving || loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold text-black disabled:opacity-50"
          style={{ background: "#FF8400", boxShadow: "0 6px 14px rgba(255,132,0,0.3)" }}>
          <Save size={15} /> {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>

      {msg && (
        <div className="mb-4 rounded-xl p-3 text-xs"
          style={{ background: "rgba(136,214,108,0.12)", border: "1px solid rgba(136,214,108,0.4)", color: "#88D66C" }}>
          {msg}
        </div>
      )}

      {/* Policies */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="rounded-2xl overflow-hidden col-span-full" style={{ background: "#1A1A1A", border: "1px solid #2E2E2E" }}>
          <div className="px-5 py-3" style={{ borderBottom: "1px solid #27272A" }}>
            <p className="text-[10px] font-bold tracking-wider" style={{ color: "#666" }}>POLÍTICAS DE AUTORIZACIÓN</p>
          </div>
          <div className="divide-y divide-[#1F1F23]">
            {policies.map(p => (
              <label key={String(p.key)} className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-white/5 transition">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,132,0,0.18)", color: "#FF8400" }}>
                  <Lock size={14} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold">{p.label}</p>
                  <p className="text-[10px]" style={{ color: "#B8B9B6" }}>{p.sub}</p>
                </div>
                <input type="checkbox" className="scale-125 accent-orange-500"
                  checked={Boolean((config as any)[p.key])}
                  onChange={(e) => setConfig({ ...config, [p.key]: e.target.checked })} />
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-2xl p-5" style={{ background: "#1A1A1A", border: "1px solid #2E2E2E" }}>
          <p className="text-[10px] font-bold tracking-wider mb-2" style={{ color: "#666" }}>PIN SI DESCUENTO &gt; (%)</p>
          <input type="number" min={0} max={100} value={config.requirePinForDiscountAbove}
            onChange={(e) => setConfig({ ...config, requirePinForDiscountAbove: Number(e.target.value) })}
            className="w-full bg-transparent text-3xl font-bold tabular-nums outline-none" />
          <p className="text-[10px] mt-2" style={{ color: "#B8B9B6" }}>
            0 = pedir siempre. Ej: 15 = pedir cuando se aplique 15% o más.
          </p>
        </div>
        <div className="rounded-2xl p-5" style={{ background: "#1A1A1A", border: "1px solid #2E2E2E" }}>
          <p className="text-[10px] font-bold tracking-wider mb-2" style={{ color: "#666" }}>BLOQUEO AUTOMÁTICO (MIN)</p>
          <input type="number" min={1} max={60} value={config.autoLockAfterMinutes}
            onChange={(e) => setConfig({ ...config, autoLockAfterMinutes: Number(e.target.value) })}
            className="w-full bg-transparent text-3xl font-bold tabular-nums outline-none" />
          <p className="text-[10px] mt-2" style={{ color: "#B8B9B6" }}>
            Tras N minutos de inactividad, regresa a /locked.
          </p>
        </div>
      </section>

      {/* Access log */}
      <section className="rounded-2xl overflow-hidden" style={{ background: "#1A1A1A", border: "1px solid #2E2E2E" }}>
        <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #27272A" }}>
          <div>
            <p className="text-[10px] font-bold tracking-wider" style={{ color: "#666" }}>BITÁCORA DE ACCESO</p>
            <p className="text-sm font-bold flex items-center gap-2"><Activity size={14} style={{ color: "#FFB84D" }} /> Últimos 50 eventos</p>
          </div>
        </div>
        {logs.length === 0 ? (
          <div className="px-5 py-12 text-center text-xs flex flex-col items-center gap-2" style={{ color: "#666" }}>
            <AlertCircle size={20} />
            {loading ? "Cargando bitácora…" : "Sin eventos registrados aún."}
          </div>
        ) : (
          <ul className="divide-y divide-[#1F1F23]">
            {logs.map(l => (
              <li key={l.id} className="px-5 py-3 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(255,184,77,0.2)", color: "#FFB84D" }}>
                    {l.action}
                  </span>
                  <span className="truncate" style={{ color: "#B8B9B6" }}>
                    {l.employeeName || "anónimo"}
                  </span>
                </div>
                <span className="text-[10px] tabular-nums" style={{ color: "#666" }}>
                  {new Date(l.createdAt).toLocaleString("es-MX")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
