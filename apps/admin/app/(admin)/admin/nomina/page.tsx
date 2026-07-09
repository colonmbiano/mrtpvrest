"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Wallet, Users, Calculator, Save, CalendarDays,
} from "lucide-react";
import api from "@/lib/api";
import {
  PageShell, PageHeader, Card, SectionLabel, Segmented, Input, Button,
  Pill, StatTile, EmptyState, LoadingCards, useToast, useConfirm, type Tone,
} from "@/components/ds";
import {
  TABS, STATUS_META, ROLE_LABEL, PAY_TYPE_LABEL, mxToday, addDays, fmtDate, mxn,
  type Tab,
} from "./_components/shared";
import { PreviewTable } from "./_components/PreviewTable";
import { ProfileRow } from "./_components/ProfileRow";
import { PeriodDetail } from "./_components/PeriodDetail";
import { CuentasPanel } from "./_components/CuentasPanel";
import { AjustesPanel } from "./_components/AjustesPanel";

export default function NominaPage() {
  const toast = useToast();
  const confirm = useConfirm();

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
    } catch { toast.error("No pudimos cargar las tarifas"); }
    finally { setLoadingProfiles(false); }
  }, [params, toast]);

  const loadPeriods = useCallback(async () => {
    setLoadingPeriods(true);
    try {
      const { data } = await api.get("/api/payroll/periods", { params: params() });
      setPeriods(Array.isArray(data) ? data : []);
    } catch { toast.error("No pudimos cargar el historial"); }
    finally { setLoadingPeriods(false); }
  }, [params, toast]);

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
      toast.error(e?.response?.data?.error || "No pudimos calcular la raya");
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
      toast.success("Raya guardada como borrador");
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "No pudimos guardar la raya");
    } finally { setSavingPeriod(false); }
  };

  const saveProfile = async (p: any, patch: any) => {
    setSavingProfileId(p.employeeId);
    try {
      const { data } = await api.put(`/api/payroll/profiles/${p.employeeId}`, patch);
      setProfiles((list) => list.map((x) => (x.employeeId === p.employeeId ? { ...x, profile: data } : x)));
      toast.success(`Tarifa de ${p.name} guardada`);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "No pudimos guardar la tarifa");
    } finally { setSavingProfileId(""); }
  };

  const saveConfig = async (patch: any) => {
    try {
      const { data } = await api.put("/api/payroll/config", patch);
      setConfig(data);
      toast.success("Ajustes guardados");
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "No pudimos guardar los ajustes");
    }
  };

  const openPeriod = async (id: string) => {
    setBusyDetail(true);
    try {
      const { data } = await api.get(`/api/payroll/periods/${id}`);
      setDetail(data);
    } catch { toast.error("No pudimos abrir la corrida"); }
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
      toast.success(action === "approve" ? "Corrida aprobada" : action === "pay" ? "Corrida marcada como pagada" : "Recalculada");
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "No se pudo completar la acción");
    } finally { setBusyDetail(false); }
  };

  const deletePeriod = async () => {
    if (!detail) return;
    if (!(await confirm({ title: "¿Borrar esta corrida?", body: "No se puede deshacer.", danger: true, confirmLabel: "Borrar" }))) return;
    setBusyDetail(true);
    try {
      await api.delete(`/api/payroll/periods/${detail.id}`);
      setDetail(null);
      loadPeriods();
      toast.success("Corrida eliminada");
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "No se pudo borrar");
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
      <PageShell>
        <PageHeader eyebrow="Personal" title="Nómina" subtitle="Cargando…" />
        <LoadingCards count={4} />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Personal · La raya"
        title="Nómina"
        subtitle="Pago a empleados por día trabajado. Las faltas se descuentan solas."
      />

      <div className="mb-5 max-w-2xl">
        <Segmented options={TABS.map((t) => ({ value: t.value, label: t.label }))} value={tab} onChange={(v) => { setDetail(null); setTab(v); }} />
      </div>

      {/* ── CALCULAR RAYA ──────────────────────────────────────────── */}
      {tab === "raya" && (
        <div className="space-y-4">
          <Card className="p-4 md:p-5">
            <SectionLabel>Periodo a pagar</SectionLabel>
            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="mb-1 block text-[11px] text-tx-mut">Desde</span>
                <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] text-tx-mut">Hasta</span>
                <Input type="date" value={to} min={from} max={mxToday()} onChange={(e) => setTo(e.target.value)} />
              </label>
              <div className="ml-auto">
                <Button onClick={runPreview} icon={Calculator} disabled={loadingPreview || !from || !to}>
                  {loadingPreview ? "Calculando…" : "Calcular"}
                </Button>
              </div>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-tx-mut">
              <CalendarDays size={12} /> Periodo configurado: {config?.periodLengthDays || 7} días. Un día cuenta si el empleado tuvo al menos un turno.
            </p>
          </Card>

          {loadingPreview && <LoadingCards count={3} />}

          {preview && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatTile icon={Wallet} value={mxn(preview.totalNet)} label="Total a pagar" />
                <StatTile icon={Users} value={preview.items.filter((i: any) => i.daysWorked > 0).length} label="Empleados con días" />
                <StatTile icon={CalendarDays} value={fmtDate(preview.periodFrom)} label="Desde" />
                <StatTile icon={CalendarDays} value={fmtDate(preview.periodTo)} label="Hasta" />
              </div>

              <Card className="overflow-hidden">
                <PreviewTable items={preview.items} />
              </Card>

              <div className="flex justify-end">
                <Button onClick={savePeriod} icon={Save} disabled={savingPeriod}>
                  {savingPeriod ? "Guardando…" : "Guardar raya (borrador)"}
                </Button>
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
      {tab === "cuentas" && <CuentasPanel locationId={locationId} />}

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
          <EmptyState icon={Users} title="Aún no hay corridas" hint="Calcula y guarda una raya en la pestaña “Calcular raya”." />
        ) : (
          <div className="space-y-2">
            {periods.map((per) => {
              const sm = STATUS_META[per.status] || { label: per.status, tone: "neutral" as Tone };
              return (
                <Card key={per.id} className="flex items-center gap-3 p-4" onClick={() => openPeriod(per.id)}>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-tx">{fmtDate(per.periodFrom)} — {fmtDate(per.periodTo)}</div>
                    <div className="mt-0.5 text-[11px] text-tx-mut">{per._count?.items ?? 0} empleados</div>
                  </div>
                  <Pill tone={sm.tone}>{sm.label}</Pill>
                  <div className="w-28 text-right font-display text-lg font-extrabold text-tx-hi">{mxn(per.totalNet)}</div>
                </Card>
              );
            })}
          </div>
        )
      )}

      {/* ── AJUSTES ────────────────────────────────────────────────── */}
      {tab === "ajustes" && config && (
        <AjustesPanel config={config} cfgErr={cfgErr} onSave={saveConfig} onRetry={loadConfig} />
      )}
    </PageShell>
  );
}
