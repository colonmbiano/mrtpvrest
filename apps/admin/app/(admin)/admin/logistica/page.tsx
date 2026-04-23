"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";

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

const VEHICLE_TYPES: { value: VehicleType; label: string; emoji: string }[] = [
  { value: "MOTO",  label: "Moto",   emoji: "🏍️" },
  { value: "CARRO", label: "Carro",  emoji: "🚗" },
  { value: "BICI",  label: "Bici",   emoji: "🚲" },
];

export default function LogisticaPage() {
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
      alert(e?.response?.data?.error || "Error al cerrar turno");
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
      alert(e?.response?.data?.error || "Error al crear vehículo");
    } finally {
      setSavingVehicle(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loadingGate) {
    return (
      <div className="p-8 text-gray-500">Cargando módulo de Logística…</div>
    );
  }

  if (!hasDelivery) {
    return (
      <div className="p-8 max-w-xl">
        <h1 className="text-2xl font-black mb-2">Logística</h1>
        <div className="rounded-2xl border border-amber-300 bg-amber-50 text-amber-900 p-5">
          <p className="font-bold mb-1">Módulo no activado</p>
          <p className="text-sm">
            {gateError ||
              "El módulo de Logística requiere que la opción hasDelivery esté activa en tu plan. Actívalo desde el panel SaaS."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto flex flex-col gap-8">
      <header>
        <h1 className="text-2xl md:text-3xl font-black">Logística & Flota</h1>
        <p className="text-sm text-gray-500 mt-1">
          Administra vehículos, turnos de repartidores y gastos operativos.
        </p>
      </header>

      {/* ── Iniciar turno ─────────────────────────────────────────────────── */}
      <section className="rounded-3xl border border-gray-200 bg-white p-5 md:p-6 shadow-sm">
        <h2 className="text-lg font-black mb-4">Iniciar turno (Ride)</h2>

        <form onSubmit={handleStartRide} className="grid gap-4 md:grid-cols-4">
          <div className="md:col-span-1">
            <label className="text-xs font-bold text-gray-500 mb-1 block">
              Empleado
            </label>
            <select
              value={employeeId}
              onChange={e => setEmployeeId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-gray-400"
            >
              <option value="">Selecciona…</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} {emp.role ? `· ${emp.role}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-1">
            <label className="text-xs font-bold text-gray-500 mb-1 block">
              Vehículo
            </label>
            <select
              value={vehicleId}
              onChange={e => setVehicleId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-gray-400"
            >
              <option value="">Selecciona…</option>
              {vehicles
                .filter(v => v.isActive)
                .map(v => (
                  <option key={v.id} value={v.id}>
                    {v.name} · {v.type}
                    {v.plate ? ` · ${v.plate}` : ""}
                  </option>
                ))}
            </select>
          </div>

          <div className="md:col-span-1">
            <label className="text-xs font-bold text-gray-500 mb-1 block">
              Km inicial (opcional)
            </label>
            <input
              type="number"
              min={0}
              value={startMileage}
              onChange={e => setStartMileage(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-gray-400"
              placeholder="p. ej. 12450"
            />
          </div>

          <div className="md:col-span-1 flex items-end">
            <button
              type="submit"
              disabled={savingRide}
              className="w-full px-4 py-2.5 rounded-xl bg-black text-white text-sm font-black uppercase tracking-wide disabled:opacity-50 active:scale-95 transition-transform"
            >
              {savingRide ? "Guardando…" : "Iniciar turno"}
            </button>
          </div>

          {rideError && (
            <p className="md:col-span-4 text-sm text-red-500 mt-1">{rideError}</p>
          )}

          {vehicles.filter(v => v.isActive).length === 0 && (
            <p className="md:col-span-4 text-xs text-amber-600 mt-1">
              No tienes vehículos activos. Agrega uno abajo para poder iniciar
              un turno.
            </p>
          )}
        </form>
      </section>

      {/* ── Turnos activos ───────────────────────────────────────────────── */}
      <section className="rounded-3xl border border-gray-200 bg-white p-5 md:p-6 shadow-sm">
        <h2 className="text-lg font-black mb-4">Turnos activos</h2>

        {openRides.length === 0 ? (
          <p className="text-sm text-gray-400">
            No hay turnos abiertos en este momento.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-gray-100">
            {openRides.map(r => (
              <div
                key={r.id}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="font-bold text-sm">
                    {r.employee?.name || r.employeeId}
                  </p>
                  <p className="text-xs text-gray-400">
                    {r.vehicle?.name} · {r.vehicle?.type}
                    {r.startMileage != null ? ` · ${r.startMileage} km` : ""}
                    {" · inicio "}
                    {new Date(r.startTime).toLocaleString("es-MX", {
                      hour: "2-digit",
                      minute: "2-digit",
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </p>
                </div>
                <button
                  onClick={() => handleCloseRide(r.id)}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-bold hover:bg-gray-50"
                >
                  Cerrar turno
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Vehículos ────────────────────────────────────────────────────── */}
      <section className="rounded-3xl border border-gray-200 bg-white p-5 md:p-6 shadow-sm">
        <h2 className="text-lg font-black mb-4">Vehículos</h2>

        <form
          onSubmit={handleCreateVehicle}
          className="grid gap-3 md:grid-cols-4 mb-5"
        >
          <input
            type="text"
            value={vName}
            onChange={e => setVName(e.target.value)}
            placeholder="Nombre (ej. Moto A)"
            className="md:col-span-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-gray-400"
            required
          />
          <input
            type="text"
            value={vPlate}
            onChange={e => setVPlate(e.target.value)}
            placeholder="Placas (opcional)"
            className="md:col-span-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-gray-400"
          />
          <select
            value={vType}
            onChange={e => setVType(e.target.value as VehicleType)}
            className="md:col-span-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-gray-400"
          >
            {VEHICLE_TYPES.map(t => (
              <option key={t.value} value={t.value}>
                {t.emoji} {t.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={savingVehicle}
            className="md:col-span-1 px-4 py-2.5 rounded-xl bg-black text-white text-sm font-black uppercase tracking-wide disabled:opacity-50 active:scale-95 transition-transform"
          >
            {savingVehicle ? "Guardando…" : "Agregar"}
          </button>
        </form>

        {vehicles.length === 0 ? (
          <p className="text-sm text-gray-400">Sin vehículos registrados.</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {vehicles.map(v => (
              <div
                key={v.id}
                className={`flex items-center justify-between px-4 py-3 rounded-2xl border ${
                  v.isActive
                    ? "border-gray-200 bg-white"
                    : "border-gray-100 bg-gray-50 text-gray-400"
                }`}
              >
                <div>
                  <p className="font-bold text-sm">{v.name}</p>
                  <p className="text-xs text-gray-400">
                    {v.type}
                    {v.plate ? ` · ${v.plate}` : ""}
                    {!v.isActive ? " · Inactivo" : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
