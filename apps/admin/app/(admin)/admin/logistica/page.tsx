"use client";
import { useEffect, useState } from "react";
import {
  Bike, Car, Play, Lock, AlertTriangle, Clock, Plus, MapPin,
} from "lucide-react";
import api from "@/lib/api";
import {
  PageShell, PageHeader, Card, SectionHead, Pill, Button, Field, Input, Select,
  EmptyState, useToast,
} from "@/components/ds";

type VehicleType = "MOTO" | "CARRO" | "BICI";

type Vehicle = {
  id: string;
  name: string;
  plate: string | null;
  type: VehicleType;
  isActive: boolean;
};

type Employee = {
  id: string;
  name: string;
  role: string;
  isActive: boolean;
};

type Ride = {
  id: string;
  employeeId: string;
  vehicleId: string;
  startTime: string;
  endTime: string | null;
  startMileage: number | null;
  endMileage: number | null;
  vehicle?: { id: string; name: string; type: VehicleType; plate?: string | null };
  employee?: { id: string; name: string; role: string } | null;
};

const VEHICLE_TYPES: { value: VehicleType; label: string; icon: typeof Bike }[] = [
  { value: "MOTO",  label: "Moto",  icon: Bike  },
  { value: "CARRO", label: "Carro", icon: Car   },
  { value: "BICI",  label: "Bici",  icon: Bike  },
];

const VEHICLE_ICON: Record<VehicleType, typeof Bike> = {
  MOTO: Bike, CARRO: Car, BICI: Bike,
};

export default function LogisticaPage() {
  const toast = useToast();

  // Gate state
  const [hasDelivery, setHasDelivery] = useState<boolean | null>(null);
  const [loadingGate, setLoadingGate] = useState(true);
  const [gateError, setGateError] = useState("");

  // Data
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [openRides, setOpenRides] = useState<Ride[]>([]);

  // "Iniciar Turno" form
  const [employeeId, setEmployeeId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [startMileage, setStartMileage] = useState("");
  const [savingRide, setSavingRide] = useState(false);
  const [rideError, setRideError] = useState("");

  // "Agregar Vehículo" form
  const [vName, setVName] = useState("");
  const [vPlate, setVPlate] = useState("");
  const [vType, setVType] = useState<VehicleType>("MOTO");
  const [savingVehicle, setSavingVehicle] = useState(false);

  // ── Gate effect ────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await api.get("/api/tenant/me");
        if (!mounted) return;
        setHasDelivery(!!data?.hasDelivery);
      } catch (e: any) {
        if (!mounted) return;
        setGateError(
          e?.response?.data?.error || "No se pudo verificar el módulo de Logística"
        );
        setHasDelivery(false);
      } finally {
        if (mounted) setLoadingGate(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // ── Load data when gate is open ────────────────────────────────────────────
  async function loadAll() {
    const [v, e, r] = await Promise.all([
      api.get("/api/logistics/vehicles").then(x => x.data),
      api.get("/api/employees").then(x => x.data).catch(() => []),
      api.get("/api/logistics/rides?status=open").then(x => x.data),
    ]);
    setVehicles(v);
    setEmployees(Array.isArray(e) ? e.filter((emp: Employee) => emp.isActive) : []);
    setOpenRides(r);
  }

  useEffect(() => {
    if (hasDelivery) loadAll().catch(console.error);
  }, [hasDelivery]);

  async function handleStartRide(ev: React.FormEvent) {
    ev.preventDefault();
    setRideError("");
    if (!employeeId) return setRideError("Selecciona un empleado");
    if (!vehicleId) return setRideError("Selecciona un vehículo");
    setSavingRide(true);
    try {
      await api.post("/api/logistics/rides", {
        employeeId,
        vehicleId,
        startMileage: startMileage ? Number(startMileage) : undefined,
      });
      setEmployeeId("");
      setVehicleId("");
      setStartMileage("");
      await loadAll();
    } catch (e: any) {
      setRideError(e?.response?.data?.error || "Error al iniciar turno");
    } finally {
      setSavingRide(false);
    }
  }

  async function handleCloseRide(id: string) {
    const km = prompt("Kilometraje final (opcional):") || "";
    try {
      await api.post(`/api/logistics/rides/${id}/close`, {
        endMileage: km ? Number(km) : undefined,
      });
      await loadAll();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Error al cerrar turno");
    }
  }

  async function handleCreateVehicle(ev: React.FormEvent) {
    ev.preventDefault();
    if (!vName.trim()) return;
    setSavingVehicle(true);
    try {
      await api.post("/api/logistics/vehicles", {
        name: vName.trim(),
        plate: vPlate.trim() || undefined,
        type: vType,
      });
      setVName("");
      setVPlate("");
      setVType("MOTO");
      await loadAll();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Error al crear vehículo");
    } finally {
      setSavingVehicle(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loadingGate) {
    return (
      <PageShell>
        <div className="grid place-items-center py-24 text-sm text-tx-mut">
          Cargando módulo de Logística…
        </div>
      </PageShell>
    );
  }

  if (!hasDelivery) {
    return (
      <PageShell>
        <PageHeader eyebrow="Flota & repartos" title="Logística & Flota" />
        <EmptyState
          icon={Lock}
          title="Módulo no activado"
          hint={
            gateError ||
            "El módulo de Logística requiere que la opción hasDelivery esté activa en tu plan. Actívalo desde el panel SaaS."
          }
        />
      </PageShell>
    );
  }

  const activeVehicles = vehicles.filter(v => v.isActive);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Flota & repartos"
        title="Logística & Flota"
        subtitle="Administra vehículos, turnos de repartidores y gastos operativos."
      />

      <div className="flex flex-col gap-4 md:gap-6">
        {/* ── Iniciar turno ─────────────────────────────────────────────── */}
        <Card className="p-4 md:p-6">
          <SectionHead title="Iniciar turno (Ride)" />

          <form onSubmit={handleStartRide} className="grid gap-3 md:grid-cols-4">
            <Field label="Empleado" className="mb-0">
              <Select value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
                <option value="">Selecciona…</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} {emp.role ? `· ${emp.role}` : ""}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Vehículo" className="mb-0">
              <Select value={vehicleId} onChange={e => setVehicleId(e.target.value)}>
                <option value="">Selecciona…</option>
                {activeVehicles.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.name} · {v.type}
                    {v.plate ? ` · ${v.plate}` : ""}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Km inicial (opcional)" className="mb-0">
              <Input
                type="number"
                min={0}
                value={startMileage}
                onChange={e => setStartMileage(e.target.value)}
                placeholder="p. ej. 12450"
              />
            </Field>

            <div className="flex items-end">
              <Button type="submit" full icon={Play} loading={savingRide}>
                {savingRide ? "Guardando…" : "Iniciar turno"}
              </Button>
            </div>

            {rideError && (
              <p className="text-sm md:col-span-4" style={{ color: "var(--err)" }}>{rideError}</p>
            )}

            {activeVehicles.length === 0 && (
              <p className="flex items-center gap-1.5 text-xs md:col-span-4" style={{ color: "var(--warn)" }}>
                <AlertTriangle size={13} />
                No tienes vehículos activos. Agrega uno abajo para poder iniciar un turno.
              </p>
            )}
          </form>
        </Card>

        {/* ── Turnos activos ────────────────────────────────────────────── */}
        <Card className="p-4 md:p-6">
          <SectionHead title="Turnos activos" />

          {openRides.length === 0 ? (
            <p className="text-sm text-tx-mut">No hay turnos abiertos en este momento.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {openRides.map(r => {
                const VIcon = r.vehicle?.type ? VEHICLE_ICON[r.vehicle.type] : Bike;
                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-ds-lg px-4 py-3"
                    style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-primary"
                        style={{ background: "var(--accent-soft)" }}>
                        <VIcon size={17} strokeWidth={1.9} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-[13.5px] font-bold text-tx">
                            {r.employee?.name || r.employeeId}
                          </p>
                          <Pill tone="ok" live>En turno</Pill>
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-tx-mut">
                          {r.vehicle?.name} · {r.vehicle?.type}
                          {r.startMileage != null ? ` · ${r.startMileage} km` : ""}
                          {" · inicio "}
                          {new Date(r.startTime).toLocaleString("es-MX", {
                            timeZone: "America/Mexico_City",
                            hour: "2-digit",
                            minute: "2-digit",
                            day: "2-digit",
                            month: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                    <Button variant="secondary" icon={Clock} onClick={() => handleCloseRide(r.id)}>
                      Cerrar turno
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* ── Vehículos ─────────────────────────────────────────────────── */}
        <Card className="p-4 md:p-6">
          <SectionHead title="Vehículos" />

          <form
            onSubmit={handleCreateVehicle}
            className="mb-5 grid items-end gap-3 md:grid-cols-4"
          >
            <Field label="Nombre" className="mb-0">
              <Input
                type="text"
                value={vName}
                onChange={e => setVName(e.target.value)}
                placeholder="Nombre (ej. Moto A)"
                required
              />
            </Field>
            <Field label="Placas (opcional)" className="mb-0">
              <Input
                type="text"
                value={vPlate}
                onChange={e => setVPlate(e.target.value)}
                placeholder="Placas (opcional)"
              />
            </Field>
            <Field label="Tipo" className="mb-0">
              <Select value={vType} onChange={e => setVType(e.target.value as VehicleType)}>
                {VEHICLE_TYPES.map(t => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end">
              <Button type="submit" full icon={Plus} loading={savingVehicle}>
                {savingVehicle ? "Guardando…" : "Agregar"}
              </Button>
            </div>
          </form>

          {vehicles.length === 0 ? (
            <p className="text-sm text-tx-mut">Sin vehículos registrados.</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {vehicles.map(v => {
                const VIcon = VEHICLE_ICON[v.type];
                return (
                  <div
                    key={v.id}
                    className="flex items-center gap-3 rounded-ds-lg px-4 py-3"
                    style={{
                      background: v.isActive ? "var(--surf-2)" : "var(--surf-1)",
                      border: "1px solid var(--bd-1)",
                      opacity: v.isActive ? 1 : 0.55,
                    }}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px]"
                      style={{
                        background: v.isActive ? "var(--accent-soft)" : "var(--surf-3)",
                        color: v.isActive ? "var(--brand-primary)" : "var(--tx-mut)",
                      }}>
                      <VIcon size={17} strokeWidth={1.9} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-bold text-tx">{v.name}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-tx-mut">
                        {v.plate ? <><MapPin size={11} /> {v.type} · {v.plate}</> : v.type}
                      </p>
                    </div>
                    {!v.isActive && <Pill tone="neutral">Inactivo</Pill>}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
