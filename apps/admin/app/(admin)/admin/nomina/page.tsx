"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Wallet, Users, History, Settings, Calculator, Save, Check, Trash2,
  Download, AlertCircle, ChevronLeft, CalendarDays, HandCoins, Plus, Ban,
  Percent, type LucideIcon,
} from "lucide-react";
import api from "@/lib/api";
import {
  WtScreen, PageHeader, WtCard, SectionLabel, Segmented, PrimaryBtn, Toggle,
  Pill, StatTile, EmptyState, ErrorState, LoadingCards, type Tone,
} from "@/components/warmtech";

// ── helpers ──────────────────────────────────────────────────────────────────
const TZ = "America/Mexico_City";
const mxToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
// Formateo con centavos (el `money` del design-system redondea a entero; en
// nómina los centavos importan).
const mxn = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

function addDays(yyyyMmDd: string, delta: number) {
  const [y = 0, m = 1, d = 1] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}
function fmtDate(iso?: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("es-MX", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
}

const PAY_TYPES = [
  { value: "DAILY", label: "Por día" },
  { value: "HOURLY", label: "Por hora" },
  { value: "WEEKLY_FIXED", label: "Fijo" },
  { value: "PER_DELIVERY", label: "Por entrega" },
] as const;
const PAY_TYPE_LABEL: Record<string, string> = { DAILY: "Por día", HOURLY: "Por hora", WEEKLY_FIXED: "Fijo", PER_DELIVERY: "Por entrega" };
const RATE_FIELD: Record<string, string> = { DAILY: "dailyRate", HOURLY: "hourlyRate", WEEKLY_FIXED: "fixedAmount", PER_DELIVERY: "perDeliveryRate" };
const STATUS_META: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Borrador", tone: "warn" }, APPROVED: { label: "Aprobada", tone: "info" }, PAID: { label: "Pagada", tone: "ok" },
};
const ROLE_LABEL: Record<string, string> = { ADMIN: "Admin", CASHIER: "Cajero", WAITER: "Mesero", DELIVERY: "Repartidor", COOK: "Cocinero" };

const inputCls = "w-full rounded-xl px-3 py-2 text-sm outline-none";
const inputStyle = { background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" } as const;

type Tab = "raya" | "tarifas" | "cuentas" | "historial" | "ajustes";
const TABS: { value: Tab; label: string; icon: LucideIcon }[] = [
  { value: "raya", label: "Calcular raya", icon: Calculator },
  { value: "tarifas", label: "Tarifas", icon: Users },
  { value: "cuentas", label: "Cuentas", icon: HandCoins },
  { value: "historial", label: "Historial", icon: History },
  { value: "ajustes", label: "Ajustes", icon: Settings },
];

const CHARGE_TYPE_LABEL: Record<string, string> = {
  CONSUMPTION: "Consumo", ADVANCE: "Anticipo", ADJUSTMENT: "Ajuste",
};

export default function NominaPage() {
  const [tab, setTab] = useState<Tab>("raya");
  const [locationId, setLocationId] = useState<string>("");

  const [config, setConfig] = useState<any>(null);
  const [loadingCfg, setLoadingCfg] = useState(true);
  const [cfgErr, setCfgErr] = useState(false);

  // Rango de la raya
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>(mxToday());
  const [preview, setPreview] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [savingPeriod, setSavingPeriod] = useState(false);

  // Tarifas
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [savingProfileId, setSavingProfileId] = useState<string>("");

  // Historial + detalle
  const [periods, setPeriods] = useState<any[]>([]);
  const [loadingPeriods, setLoadingPeriods] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [busyDetail, setBusyDetail] = useState(false);

  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const flash = (kind: "ok" | "err", text: string) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 2800);
  };

  useEffect(() => {
    if (typeof window !== "undefined") setLocationId(localStorage.getItem("locationId") || "");
  }, []);

  // Config inicial — define el largo de periodo por defecto del rango.
  const loadConfig = useCallback(async () => {
    setLoadingCfg(true); setCfgErr(false);
    try {
      const { data } = await api.get("/api/payroll/config");
      setConfig(data);
      const today = mxToday();
      setTo(today);
      setFrom(addDays(today, -((data?.periodLengthDays || 7) - 1)));
    } catch {
      setCfgErr(true);
    } finally {
      setLoadingCfg(false);
    }
  }, []);
  useEffect(() => { loadConfig(); }, [loadConfig]);

  const params = useCallback(() => (locationId ? { locationId } : {}), [locationId]);

  const loadProfiles = useCallback(async () => {
    setLoadingProfiles(true);
    try {
      const { data } = await api.get("/api/payroll/profiles", { params: params() });
      setProfiles(Array.isArray(data) ? data : []);
    } catch { flash("err", "No pudimos cargar las tarifas"); }
    finally { setLoadingProfiles(false); }
  }, [params]);

  const loadPeriods = useCallback(async () => {
    setLoadingPeriods(true);
    try {
      const { data } = await api.get("/api/payroll/periods", { params: params() });
      setPeriods(Array.isArray(data) ? data : []);
    } catch { flash("err", "No pudimos cargar el historial"); }
    finally { setLoadingPeriods(false); }
  }, [params]);

  useEffect(() => { if (tab === "tarifas") loadProfiles(); }, [tab, loadProfiles]);
  useEffect(() => { if (tab === "historial" && !detail) loadPeriods(); }, [tab, detail, loadPeriods]);

  // ── acciones ────────────────────────────────────────────────────────────────
  const runPreview = async () => {
    if (!from || !to) return;
    setLoadingPreview(true); setPreview(null);
    try {
      const { data } = await api.get("/api/payroll/periods/preview", { params: { ...params(), from, to } });
      setPreview(data);
    } catch (e: any) {
      flash("err", e?.response?.data?.error || "No pudimos calcular la raya");
    } finally { setLoadingPreview(false); }
  };

  const savePeriod = async () => {
    if (!preview) return;
    setSavingPeriod(true);
    try {
      const { data } = await api.post("/api/payroll/periods", { ...params(), from, to });
      setPreview(null);
      setDetail(data);
      setTab("historial");
      flash("ok", "Raya guardada como borrador");
    } catch (e: any) {
      flash("err", e?.response?.data?.error || "No pudimos guardar la raya");
    } finally { setSavingPeriod(false); }
  };

  const saveProfile = async (p: any, patch: any) => {
    setSavingProfileId(p.employeeId);
    try {
      const { data } = await api.put(`/api/payroll/profiles/${p.employeeId}`, patch);
      setProfiles((list) => list.map((x) => (x.employeeId === p.employeeId ? { ...x, profile: data } : x)));
      flash("ok", `Tarifa de ${p.name} guardada`);
    } catch (e: any) {
      flash("err", e?.response?.data?.error || "No pudimos guardar la tarifa");
    } finally { setSavingProfileId(""); }
  };

  const saveConfig = async (patch: any) => {
    try {
      const { data } = await api.put("/api/payroll/config", patch);
      setConfig(data);
      flash("ok", "Ajustes guardados");
    } catch (e: any) {
      flash("err", e?.response?.data?.error || "No pudimos guardar los ajustes");
    }
  };

  const openPeriod = async (id: string) => {
    setBusyDetail(true);
    try {
      const { data } = await api.get(`/api/payroll/periods/${id}`);
      setDetail(data);
    } catch { flash("err", "No pudimos abrir la corrida"); }
    finally { setBusyDetail(false); }
  };

  const periodAction = async (action: "approve" | "pay" | "recompute", body?: any) => {
    if (!detail) return;
    setBusyDetail(true);
    try {
      const { data } = await api.post(`/api/payroll/periods/${detail.id}/${action}`, body || {});
      // approve/pay devuelven el periodo; recompute devuelve periodo con items.
      if (action === "recompute") setDetail(data);
      else { const fresh = await api.get(`/api/payroll/periods/${detail.id}`); setDetail(fresh.data); }
      flash("ok", action === "approve" ? "Corrida aprobada" : action === "pay" ? "Corrida marcada como pagada" : "Recalculada");
    } catch (e: any) {
      flash("err", e?.response?.data?.error || "No se pudo completar la acción");
    } finally { setBusyDetail(false); }
  };

  const deletePeriod = async () => {
    if (!detail) return;
    if (!confirm("¿Borrar esta corrida? No se puede deshacer.")) return;
    setBusyDetail(true);
    try {
      await api.delete(`/api/payroll/periods/${detail.id}`);
      setDetail(null);
      loadPeriods();
      flash("ok", "Corrida eliminada");
    } catch (e: any) {
      flash("err", e?.response?.data?.error || "No se pudo borrar");
    } finally { setBusyDetail(false); }
  };

  const exportCsv = (period: any) => {
    const items = period?.items || [];
    const head = ["Empleado", "Rol", "Esquema", "Dias", "Tarifa", "Bruto", "Adiciones", "Deducciones", "Anticipos", "Neto", "Metodo"];
    const rows = items.map((it: any) => [
      it.employeeName, ROLE_LABEL[it.role] || it.role || "", PAY_TYPE_LABEL[it.payType] || it.payType,
      it.daysWorked, Number(it.rate).toFixed(2), Number(it.gross).toFixed(2), Number(it.additions).toFixed(2),
      Number(it.deductions).toFixed(2), Number(it.advancesDeducted).toFixed(2), Number(it.net).toFixed(2), it.payMethod || "",
    ]);
    rows.push([]);
    rows.push(["", "", "", "", "", "", "", "", "TOTAL", Number(period.totalNet).toFixed(2), ""]);
    const cell = (v: any) => { const s = v == null ? "" : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = "﻿" + [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `raya_${fmtDate(period.periodFrom)}_${fmtDate(period.periodTo)}.csv`.replace(/\s+/g, "");
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── render ────────────────────────────────────────────────────────────────
  if (loadingCfg) {
    return (
      <WtScreen>
        <PageHeader eyebrow="Personal" title="Nómina" subtitle="Cargando…" />
        <LoadingCards count={4} />
      </WtScreen>
    );
  }

  return (
    <WtScreen>
      <PageHeader
        eyebrow="Personal · La raya"
        title="Nómina"
        subtitle="Pago a empleados por día trabajado. Las faltas se descuentan solas."
      />

      {msg && (
        <div
          className="mb-4 rounded-2xl p-3 text-xs font-semibold"
          style={{
            background: msg.kind === "ok" ? "var(--ok-soft)" : "var(--err-soft)",
            color: msg.kind === "ok" ? "var(--ok)" : "var(--err)",
          }}
        >
          {msg.text}
        </div>
      )}

      <div className="mb-5 max-w-2xl">
        <Segmented options={TABS.map((t) => ({ value: t.value, label: t.label }))} value={tab} onChange={(v) => { setDetail(null); setTab(v); }} />
      </div>

      {/* ── CALCULAR RAYA ──────────────────────────────────────────── */}
      {tab === "raya" && (
        <div className="space-y-4">
          <WtCard className="p-4 md:p-5">
            <SectionLabel>Periodo a pagar</SectionLabel>
            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="mb-1 block text-[11px] text-tx-mut">Desde</span>
                <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={inputCls} style={inputStyle} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] text-tx-mut">Hasta</span>
                <input type="date" value={to} min={from} max={mxToday()} onChange={(e) => setTo(e.target.value)} className={inputCls} style={inputStyle} />
              </label>
              <div className="ml-auto">
                <PrimaryBtn onClick={runPreview} icon={Calculator} full={false} disabled={loadingPreview || !from || !to}>
                  {loadingPreview ? "Calculando…" : "Calcular"}
                </PrimaryBtn>
              </div>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-tx-mut">
              <CalendarDays size={12} /> Periodo configurado: {config?.periodLengthDays || 7} días. Un día cuenta si el empleado tuvo al menos un turno.
            </p>
          </WtCard>

          {loadingPreview && <LoadingCards count={3} />}

          {preview && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatTile icon={Wallet} value={mxn(preview.totalNet)} label="Total a pagar" />
                <StatTile icon={Users} value={preview.items.filter((i: any) => i.daysWorked > 0).length} label="Empleados con días" />
                <StatTile icon={CalendarDays} value={fmtDate(preview.periodFrom)} label="Desde" />
                <StatTile icon={CalendarDays} value={fmtDate(preview.periodTo)} label="Hasta" />
              </div>

              <WtCard className="overflow-hidden p-0">
                <PreviewTable items={preview.items} />
              </WtCard>

              <div className="flex justify-end">
                <PrimaryBtn onClick={savePeriod} icon={Save} full={false} disabled={savingPeriod}>
                  {savingPeriod ? "Guardando…" : "Guardar raya (borrador)"}
                </PrimaryBtn>
              </div>
            </>
          )}

          {!preview && !loadingPreview && (
            <EmptyState icon={Calculator} title="Calcula la raya del periodo" hint="Elige el rango y presiona Calcular para ver los días trabajados y el pago de cada empleado." />
          )}
        </div>
      )}

      {/* ── TARIFAS ────────────────────────────────────────────────── */}
      {tab === "tarifas" && (
        <div className="space-y-3">
          <SectionLabel>Tarifa por empleado</SectionLabel>
          {loadingProfiles ? (
            <LoadingCards count={4} />
          ) : profiles.length === 0 ? (
            <EmptyState icon={Users} title="Sin empleados activos" hint="Crea empleados en la sección Empleados para asignarles tarifa." />
          ) : (
            profiles.map((p) => <ProfileRow key={p.employeeId} p={p} saving={savingProfileId === p.employeeId} onSave={saveProfile} />)
          )}
        </div>
      )}

      {/* ── CUENTAS DE EMPLEADO ────────────────────────────────────── */}
      {tab === "cuentas" && <CuentasPanel locationId={locationId} flash={flash} />}

      {/* ── HISTORIAL / DETALLE ────────────────────────────────────── */}
      {tab === "historial" && (
        detail ? (
          <PeriodDetail
            period={detail}
            busy={busyDetail}
            onBack={() => { setDetail(null); loadPeriods(); }}
            onApprove={() => periodAction("approve")}
            onPay={(payMethod) => periodAction("pay", { payMethod })}
            onRecompute={() => periodAction("recompute")}
            onDelete={deletePeriod}
            onExport={() => exportCsv(detail)}
          />
        ) : loadingPeriods ? (
          <LoadingCards count={4} />
        ) : periods.length === 0 ? (
          <EmptyState icon={History} title="Aún no hay corridas" hint="Calcula y guarda una raya en la pestaña “Calcular raya”." />
        ) : (
          <div className="space-y-2">
            {periods.map((per) => {
              const sm = STATUS_META[per.status] || { label: per.status, tone: "neutral" as Tone };
              return (
                <WtCard key={per.id} className="flex items-center gap-3 p-4" onClick={() => openPeriod(per.id)}>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-tx">{fmtDate(per.periodFrom)} — {fmtDate(per.periodTo)}</div>
                    <div className="mt-0.5 text-[11px] text-tx-mut">{per._count?.items ?? 0} empleados</div>
                  </div>
                  <Pill tone={sm.tone}>{sm.label}</Pill>
                  <div className="w-28 text-right font-display text-lg font-extrabold text-tx-hi">{mxn(per.totalNet)}</div>
                </WtCard>
              );
            })}
          </div>
        )
      )}

      {/* ── AJUSTES ────────────────────────────────────────────────── */}
      {tab === "ajustes" && config && (
        <AjustesPanel config={config} cfgErr={cfgErr} onSave={saveConfig} onRetry={loadConfig} />
      )}
    </WtScreen>
  );
}

// ── subcomponentes ────────────────────────────────────────────────────────────
function PreviewTable({ items }: { items: any[] }) {
  return (
    <div className="overflow-x-auto warmtech-scrollbar">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-tx-dim" style={{ borderBottom: "1px solid var(--bd-1)" }}>
            <th className="px-4 py-3 font-semibold">Empleado</th>
            <th className="px-3 py-3 font-semibold">Esquema</th>
            <th className="px-3 py-3 text-right font-semibold">Días</th>
            <th className="px-3 py-3 text-right font-semibold">Tarifa</th>
            <th className="px-4 py-3 text-right font-semibold">Neto</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.employeeId} style={{ borderBottom: "1px solid var(--bd-1)" }}>
              <td className="px-4 py-3">
                <div className="font-semibold text-tx">{it.employeeName}</div>
                <div className="text-[11px] text-tx-mut">
                  {ROLE_LABEL[it.role] || it.role}
                  {it.needsProfile && <span className="ml-1 text-[var(--warn)]">· sin tarifa</span>}
                </div>
              </td>
              <td className="px-3 py-3 text-tx-mut">{PAY_TYPE_LABEL[it.payType] || it.payType}</td>
              <td className="px-3 py-3 text-right tabular-nums text-tx">{it.daysWorked}</td>
              <td className="px-3 py-3 text-right tabular-nums text-tx-mut">{mxn(it.rate)}</td>
              <td className="px-4 py-3 text-right font-display font-extrabold tabular-nums text-tx-hi">{mxn(it.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProfileRow({ p, saving, onSave }: { p: any; saving: boolean; onSave: (p: any, patch: any) => void }) {
  const [payType, setPayType] = useState<string>(p.profile?.payType || "DAILY");
  const [rate, setRate] = useState<string>(() => {
    const f = RATE_FIELD[p.profile?.payType || "DAILY"] ?? "dailyRate";
    return p.profile ? String(p.profile[f] ?? 0) : "";
  });
  const field = RATE_FIELD[payType] ?? "dailyRate";
  const initialDisc = p.profile?.discountPct == null ? "" : String(p.profile.discountPct);
  const [disc, setDisc] = useState<string>(initialDisc);
  const dirty =
    payType !== (p.profile?.payType || "DAILY") ||
    String(p.profile?.[field] ?? "") !== String(rate || "") ||
    disc !== initialDisc;

  return (
    <WtCard className="flex flex-wrap items-center gap-3 p-4">
      <div className="min-w-[160px] flex-1">
        <div className="text-sm font-semibold text-tx">{p.name}</div>
        <div className="mt-0.5 text-[11px] text-tx-mut">
          {ROLE_LABEL[p.role] || p.role}
          {!p.profile && <span className="ml-1 text-[var(--warn)]">· sin tarifa</span>}
        </div>
      </div>
      <div className="w-40">
        <Segmented
          options={[{ value: "DAILY", label: "Día" }, { value: "HOURLY", label: "Hora" }, { value: "WEEKLY_FIXED", label: "Fijo" }, { value: "PER_DELIVERY", label: "Entrega" }]}
          value={payType}
          onChange={(v) => setPayType(v)}
        />
      </div>
      <label className="flex items-center gap-2">
        <span className="text-[11px] text-tx-mut">$</span>
        <input
          type="number" min={0} step="0.01" inputMode="decimal"
          value={rate} onChange={(e) => setRate(e.target.value)}
          placeholder="0.00" className={`${inputCls} w-28 text-right`} style={inputStyle}
        />
      </label>
      <label className="flex items-center gap-2" title="Descuento de empleado (vacío = usa el default del negocio)">
        <Percent size={13} className="text-tx-mut" />
        <input
          type="number" min={0} max={100} step="0.01" inputMode="decimal"
          value={disc} onChange={(e) => setDisc(e.target.value)}
          placeholder="auto" className={`${inputCls} w-20 text-right`} style={inputStyle}
        />
      </label>
      <PrimaryBtn full={false} icon={Save} disabled={saving || !dirty}
        onClick={() => onSave(p, { payType, [field]: Number(rate || 0), discountPct: disc.trim() === "" ? null : Number(disc) })}>
        {saving ? "…" : "Guardar"}
      </PrimaryBtn>
    </WtCard>
  );
}

function PeriodDetail({
  period, busy, onBack, onApprove, onPay, onRecompute, onDelete, onExport,
}: {
  period: any; busy: boolean; onBack: () => void;
  onApprove: () => void; onPay: (m: string) => void; onRecompute: () => void; onDelete: () => void; onExport: () => void;
}) {
  const sm = STATUS_META[period.status] || { label: period.status, tone: "neutral" as Tone };
  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-xs font-bold text-primary">
        <ChevronLeft size={14} /> Volver al historial
      </button>

      <div className="flex flex-wrap items-center gap-3">
        <div>
          <div className="font-display text-2xl font-extrabold text-tx-hi">{fmtDate(period.periodFrom)} — {fmtDate(period.periodTo)}</div>
          <div className="mt-1 flex items-center gap-2">
            <Pill tone={sm.tone}>{sm.label}</Pill>
            <span className="text-sm text-tx-mut">{period.items?.length ?? 0} empleados · <b className="text-tx-hi">{mxn(period.totalNet)}</b></span>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <PrimaryBtn ghost full={false} icon={Download} onClick={onExport}>CSV</PrimaryBtn>
          {period.status === "DRAFT" && <PrimaryBtn ghost full={false} icon={Calculator} onClick={onRecompute} disabled={busy}>Recalcular</PrimaryBtn>}
          {period.status === "DRAFT" && <PrimaryBtn full={false} icon={Check} onClick={onApprove} disabled={busy}>Aprobar</PrimaryBtn>}
          {period.status !== "PAID" && <PrimaryBtn full={false} icon={Wallet} onClick={() => onPay("CASH")} disabled={busy}>Marcar pagada</PrimaryBtn>}
          {period.status !== "PAID" && <PrimaryBtn danger full={false} icon={Trash2} onClick={onDelete} disabled={busy}>Borrar</PrimaryBtn>}
        </div>
      </div>

      <WtCard className="overflow-hidden p-0">
        <div className="overflow-x-auto warmtech-scrollbar">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-tx-dim" style={{ borderBottom: "1px solid var(--bd-1)" }}>
                <th className="px-4 py-3 font-semibold">Empleado</th>
                <th className="px-3 py-3 font-semibold">Esquema</th>
                <th className="px-3 py-3 text-right font-semibold">Días</th>
                <th className="px-3 py-3 text-right font-semibold">Tarifa</th>
                <th className="px-3 py-3 text-right font-semibold">Bruto</th>
                <th className="px-4 py-3 text-right font-semibold">Neto</th>
              </tr>
            </thead>
            <tbody>
              {(period.items || []).map((it: any) => (
                <tr key={it.id} style={{ borderBottom: "1px solid var(--bd-1)" }}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-tx">{it.employeeName}</div>
                    <div className="text-[11px] text-tx-mut">{ROLE_LABEL[it.role] || it.role}{it.payMethod ? ` · ${it.payMethod === "CASH" ? "Efectivo" : "Transferencia"}` : ""}</div>
                  </td>
                  <td className="px-3 py-3 text-tx-mut">{PAY_TYPE_LABEL[it.payType] || it.payType}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-tx">{it.daysWorked}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-tx-mut">{mxn(it.rate)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-tx-mut">{mxn(it.gross)}</td>
                  <td className="px-4 py-3 text-right font-display font-extrabold tabular-nums text-tx-hi">{mxn(it.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </WtCard>
    </div>
  );
}

function CuentasPanel({ locationId, flash }: { locationId: string; flash: (k: "ok" | "err", t: string) => void }) {
  const [balance, setBalance] = useState<any>(null);
  const [charges, setCharges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [empId, setEmpId] = useState("");
  const [type, setType] = useState("ADVANCE");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = locationId ? { locationId } : {};
    try {
      const [b, c] = await Promise.all([
        api.get("/api/payroll/charges/balance", { params }),
        api.get("/api/payroll/charges", { params: { ...params, status: "PENDING", limit: 100 } }),
      ]);
      setBalance(b.data);
      setCharges(Array.isArray(c.data) ? c.data : []);
    } catch {
      flash("err", "No pudimos cargar las cuentas");
    } finally {
      setLoading(false);
    }
  }, [locationId, flash]);
  useEffect(() => { load(); }, [load]);

  const addCharge = async () => {
    const amt = Number(amount);
    if (!empId || !Number.isFinite(amt) || amt === 0) { flash("err", "Elige empleado y un monto válido"); return; }
    setSaving(true);
    try {
      await api.post("/api/payroll/charges", { employeeId: empId, type, amount: amt, note: note || undefined });
      setAmount(""); setNote("");
      flash("ok", "Movimiento registrado");
      load();
    } catch (e: any) {
      flash("err", e?.response?.data?.error || "No se pudo registrar");
    } finally {
      setSaving(false);
    }
  };

  const cancelCharge = async (id: string) => {
    if (!confirm("¿Anular este cargo pendiente?")) return;
    try {
      await api.post(`/api/payroll/charges/${id}/cancel`, {});
      flash("ok", "Cargo anulado");
      load();
    } catch (e: any) {
      flash("err", e?.response?.data?.error || "No se pudo anular");
    }
  };

  if (loading) return <LoadingCards count={4} />;

  const employees: any[] = balance?.employees || [];
  const withBalance = employees.filter((e) => Math.abs(Number(e.pending)) > 0.001);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile icon={Wallet} value={mxn(balance?.totalPending || 0)} label="Saldo pendiente total" />
        <StatTile icon={Users} value={withBalance.length} label="Empleados con saldo" />
        <StatTile icon={HandCoins} value={charges.length} label="Cargos pendientes" />
      </div>

      {/* Alta de anticipo / ajuste manual */}
      <WtCard className="p-4 md:p-5">
        <SectionLabel>Registrar anticipo o ajuste</SectionLabel>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-[180px] flex-1">
            <span className="mb-1 block text-[11px] text-tx-mut">Empleado</span>
            <select value={empId} onChange={(e) => setEmpId(e.target.value)} className={inputCls} style={inputStyle}>
              <option value="">Selecciona…</option>
              {employees.map((e) => (
                <option key={e.employeeId} value={e.employeeId}>{e.name}</option>
              ))}
            </select>
          </label>
          <div className="w-52">
            <span className="mb-1 block text-[11px] text-tx-mut">Tipo</span>
            <Segmented
              options={[{ value: "ADVANCE", label: "Anticipo" }, { value: "ADJUSTMENT", label: "Ajuste" }]}
              value={type}
              onChange={(v) => setType(v)}
            />
          </div>
          <label className="block">
            <span className="mb-1 block text-[11px] text-tx-mut">Monto</span>
            <input
              type="number" step="0.01" inputMode="decimal" value={amount}
              onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
              className={`${inputCls} w-32 text-right`} style={inputStyle}
            />
          </label>
          <label className="block min-w-[160px] flex-1">
            <span className="mb-1 block text-[11px] text-tx-mut">Nota (opcional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Motivo…" className={inputCls} style={inputStyle} />
          </label>
          <PrimaryBtn full={false} icon={Plus} disabled={saving} onClick={addCharge}>
            {saving ? "…" : "Registrar"}
          </PrimaryBtn>
        </div>
        <p className="mt-2 text-[11px] text-tx-mut">
          El saldo pendiente se descuenta automáticamente del neto de la raya y se liquida al marcarla pagada.
          “Ajuste” admite monto negativo (saldo a favor del empleado).
        </p>
      </WtCard>

      {/* Saldo por empleado */}
      <div>
        <SectionLabel>Saldo por empleado</SectionLabel>
        {withBalance.length === 0 ? (
          <EmptyState icon={HandCoins} title="Sin saldos pendientes" hint="Los consumos a cuenta del TPV y los anticipos aparecen aquí hasta que se liquidan en la raya." />
        ) : (
          <div className="space-y-2">
            {withBalance.map((e) => (
              <WtCard key={e.employeeId} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-tx">{e.name}</div>
                  <div className="mt-0.5 text-[11px] text-tx-mut">{ROLE_LABEL[e.role] || e.role}</div>
                </div>
                <div className="w-28 text-right font-display text-lg font-extrabold" style={{ color: Number(e.pending) < 0 ? "var(--ok)" : "var(--tx-hi)" }}>
                  {mxn(e.pending)}
                </div>
              </WtCard>
            ))}
          </div>
        )}
      </div>

      {/* Cargos pendientes */}
      <div>
        <SectionLabel>Cargos pendientes</SectionLabel>
        {charges.length === 0 ? (
          <EmptyState icon={Wallet} title="Sin cargos pendientes" hint="Aún no hay consumos ni anticipos por descontar." />
        ) : (
          <div className="space-y-2">
            {charges.map((c) => (
              <WtCard key={c.id} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-tx">{c.employeeName}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-tx-mut">
                    <Pill tone="neutral">{CHARGE_TYPE_LABEL[c.type] || c.type}</Pill>
                    <span>{fmtDate(c.createdAt)}</span>
                    {c.order?.orderNumber && <span>· Orden #{c.order.orderNumber}</span>}
                    {c.note && <span className="truncate">· {c.note}</span>}
                  </div>
                </div>
                <div className="w-24 text-right font-display text-base font-extrabold tabular-nums text-tx-hi">{mxn(c.amount)}</div>
                <PrimaryBtn ghost danger full={false} icon={Ban} onClick={() => cancelCharge(c.id)}>Anular</PrimaryBtn>
              </WtCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AjustesPanel({ config, cfgErr, onSave, onRetry }: { config: any; cfgErr: boolean; onSave: (p: any) => void; onRetry: () => void }) {
  const [days, setDays] = useState<string>(String(config.periodLengthDays ?? 7));
  const [defaultPayType, setDefaultPayType] = useState<string>(config.defaultPayType || "DAILY");
  const [fiscal, setFiscal] = useState<boolean>(Boolean(config.fiscalEnabled));
  const [empDiscount, setEmpDiscount] = useState<string>(String(config.employeeDiscountPct ?? 0));

  if (cfgErr) return <ErrorState onRetry={onRetry} />;

  return (
    <div className="max-w-xl space-y-4">
      <WtCard className="p-4 md:p-5">
        <SectionLabel>Periodo de la raya</SectionLabel>
        <label className="block">
          <span className="mb-1 block text-[11px] text-tx-mut">Largo del periodo (días)</span>
          <input type="number" min={1} max={90} value={days} onChange={(e) => setDays(e.target.value)} className={`${inputCls} w-32`} style={inputStyle} />
        </label>
        <p className="mt-2 text-[11px] text-tx-mut">Define el rango por defecto al calcular (ej. 7 = semanal, 15 = quincenal).</p>

        <SectionLabel>Esquema de pago por defecto</SectionLabel>
        <div className="max-w-md">
          <Segmented options={PAY_TYPES.map((p) => ({ value: p.value, label: p.label }))} value={defaultPayType} onChange={(v) => setDefaultPayType(v)} />
        </div>
        <p className="mt-2 text-[11px] text-tx-mut">Se aplica a empleados nuevos sin tarifa configurada.</p>
      </WtCard>

      <WtCard className="p-4 md:p-5">
        <SectionLabel>Descuento de empleado</SectionLabel>
        <label className="flex items-center gap-2">
          <Percent size={14} className="text-tx-mut" />
          <input type="number" min={0} max={100} step="0.01" value={empDiscount}
            onChange={(e) => setEmpDiscount(e.target.value)} className={`${inputCls} w-28 text-right`} style={inputStyle} />
          <span className="text-[11px] text-tx-mut">%</span>
        </label>
        <p className="mt-2 text-[11px] text-tx-mut">
          Descuento por defecto al cobrar “a cuenta de empleado” en el TPV. Se puede sobreescribir por empleado (en Tarifas) o por venta.
        </p>
      </WtCard>

      <WtCard className="p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-tx">Nómina fiscal (CFDI / IMSS)</div>
            <p className="mt-1 text-[11px] text-tx-mut">
              Opcional. Actívala solo si el negocio requiere timbrar recibos de nómina ante el SAT.
              El control interno de la raya funciona sin esto. (Capa fiscal en desarrollo.)
            </p>
          </div>
          <Toggle checked={fiscal} onChange={setFiscal} label="Nómina fiscal" />
        </div>
        {fiscal && (
          <div className="mt-3 flex items-start gap-2 rounded-xl p-3" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span className="text-[11px] font-medium">La emisión de CFDI de nómina aún no está disponible. El flag se guarda para habilitarla cuando esté lista.</span>
          </div>
        )}
      </WtCard>

      <div className="flex justify-end">
        <PrimaryBtn full={false} icon={Save}
          onClick={() => onSave({ periodLengthDays: Number(days || 7), defaultPayType, fiscalEnabled: fiscal, employeeDiscountPct: Number(empDiscount || 0) })}>
          Guardar ajustes
        </PrimaryBtn>
      </div>
    </div>
  );
}
