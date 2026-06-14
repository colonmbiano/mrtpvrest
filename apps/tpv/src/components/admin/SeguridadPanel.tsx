"use client";

import { useEffect, useState } from "react";
import { Save, Lock, AlertCircle, Activity } from "lucide-react";
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

/**
 * SeguridadPanel — políticas de autorización por PIN + bitácora de acceso.
 * Extraído del antiguo /admin/seguridad para vivir como tab dentro de
 * "Personal y Seguridad" (/admin/usuarios?tab=seguridad). Sin chrome de
 * página (BackButton/título): los aporta la página contenedora.
 */
export default function SeguridadPanel() {
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
    { key: "requirePinForVoid",       label: "PIN para anular ítems",  sub: "Pide PIN supervisor al quitar un producto del ticket activo" },
    { key: "requirePinForRefund",     label: "PIN para reembolsos",     sub: "Antes de procesar devolución de dinero" },
    { key: "requirePinForCancel",     label: "PIN para cancelar orden", sub: "Al cancelar orden completa" },
    { key: "requirePinForCashDrawer", label: "PIN para abrir cajón",    sub: "Apertura manual sin venta" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <p className="text-sm font-medium text-white/55">
          Define qué acciones requieren autorización con PIN supervisor.
        </p>
        <button
          onClick={save}
          disabled={saving || loading}
          className="inline-flex items-center gap-2 px-5 py-3 min-h-[48px] rounded-2xl text-sm font-black tracking-tight active:scale-95 transition-transform disabled:opacity-40"
          style={{ background: "var(--brand)", color: "var(--brand-fg)", boxShadow: "0 15px 40px var(--brand-glow)" }}
        >
          <Save size={16} strokeWidth={3} /> {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>

      {msg && (
        <div
          className="mb-5 rounded-2xl p-3 text-xs font-semibold"
          style={{
            background: 'rgba(136,214,108,0.12)',
            border: '1px solid rgba(136,214,108,0.4)',
            color: '#88D66C',
          }}
        >
          {msg}
        </div>
      )}

      {/* Policies */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="rounded-3xl overflow-hidden col-span-full bg-white/5 backdrop-blur-md border border-white/10">
          <div className="px-6 py-4 border-b border-white/10">
            <p className="text-[10px] font-black tracking-[0.2em] text-white/40">POLÍTICAS DE AUTORIZACIÓN</p>
            <p className="text-sm font-black text-white">Acciones que requieren PIN del supervisor</p>
          </div>
          <div className="divide-y divide-white/5">
            {/* BUG-21: el checkbox nativo era poco visible en dark + el
                toque en tablet caía a veces fuera del área real del input.
                Sustituido por un toggle pill grande con el row entero
                como botón y feedback de color claro al alternar. */}
            {policies.map((p) => {
              const value = Boolean((config as any)[p.key]);
              const toggle = () => setConfig({ ...config, [p.key]: !value });
              return (
                <button
                  key={String(p.key)}
                  type="button"
                  onClick={toggle}
                  aria-pressed={value}
                  className="w-full flex items-center gap-3 px-6 py-4 hover:bg-white/5 transition-colors text-left"
                >
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center border flex-shrink-0"
                    style={{ background: "var(--brand-soft)", color: "var(--brand)", borderColor: "var(--brand-glow)" }}
                  >
                    <Lock size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-white">{p.label}</p>
                    <p className="text-[11px] font-medium text-white/55">{p.sub}</p>
                  </div>
                  {/* BUG-18: usar var(--brand) en vez de hex hardcoded
                      para que el toggle respete la paleta seleccionada
                      (Miel/Cian/Lima) en lugar de quedarse siempre ámbar. */}
                  <span
                    role="switch"
                    aria-checked={value}
                    className="relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors duration-150"
                    style={{ background: value ? "var(--brand)" : "rgba(255,255,255,0.15)" }}
                  >
                    <span
                      className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-150 ${
                        value ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-3xl p-6 bg-white/5 backdrop-blur-md border border-white/10">
          <p className="text-[10px] font-black tracking-[0.2em] text-white/40 mb-2">PIN SI DESCUENTO &gt; (%)</p>
          <input
            type="number"
            min={0}
            max={100}
            value={config.requirePinForDiscountAbove}
            onChange={(e) => setConfig({ ...config, requirePinForDiscountAbove: Number(e.target.value) })}
            className="w-full bg-transparent text-4xl font-black tabular-nums text-white outline-none"
          />
          <p className="text-[11px] font-medium mt-2 text-white/55">
            0 = pedir siempre. Ej: 15 = pedir cuando se aplique 15% o más.
          </p>
        </div>
        <div className="rounded-3xl p-6 bg-white/5 backdrop-blur-md border border-white/10">
          <p className="text-[10px] font-black tracking-[0.2em] text-white/40 mb-2">BLOQUEO AUTOMÁTICO (MIN)</p>
          <input
            type="number"
            min={1}
            max={60}
            value={config.autoLockAfterMinutes}
            onChange={(e) => setConfig({ ...config, autoLockAfterMinutes: Number(e.target.value) })}
            className="w-full bg-transparent text-4xl font-black tabular-nums text-white outline-none"
          />
          <p className="text-[11px] font-medium mt-2 text-white/55">
            Tras N minutos de inactividad, regresa a /locked.
          </p>
        </div>
      </section>

      {/* Access log */}
      <section className="rounded-3xl overflow-hidden bg-white/5 backdrop-blur-md border border-white/10">
        <div className="px-6 py-4 flex items-center justify-between border-b border-white/10">
          <div>
            <p className="text-[10px] font-black tracking-[0.2em] text-white/40">BITÁCORA DE ACCESO</p>
            <p className="text-sm font-black flex items-center gap-2 text-white">
              <Activity size={14} style={{ color: "var(--brand)" }} /> Últimos 50 eventos
            </p>
          </div>
        </div>
        {logs.length === 0 ? (
          <div className="px-6 py-12 text-center text-xs font-medium flex flex-col items-center gap-2 text-white/40">
            <AlertCircle size={20} />
            {loading ? "Cargando bitácora…" : "Sin eventos registrados aún."}
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {logs.map((l) => (
              <li
                key={l.id}
                className="px-6 py-3 flex items-center justify-between text-xs gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="text-[10px] font-black tracking-widest px-2 py-0.5 rounded-full border"
                    style={{ background: "var(--brand-soft)", color: "var(--brand)", borderColor: "var(--brand-glow)" }}
                  >
                    {l.action}
                  </span>
                  <span className="truncate font-medium text-white/55">
                    {l.employeeName || "anónimo"}
                  </span>
                </div>
                <span className="text-[10px] tabular-nums font-medium text-white/40 flex-shrink-0">
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
