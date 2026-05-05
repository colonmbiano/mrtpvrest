"use client";
import { useState, useEffect } from "react";
import api from "@/lib/api";

export default function DeliveryAssignModal({ order, onClose, onAssigned }: {
  order: any; onClose: () => void; onAssigned: () => void;
}) {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/api/delivery").then(({ data }) => setDrivers(data));
  }, []);

  async function assign() {
    if (!selected) return;
    setSaving(true);
    try {
      await api.put("/api/delivery/assign", { orderId: order.id, driverId: selected });
      onAssigned();
      onClose();
    } catch (err: any) { alert(err.response?.data?.error || "Error"); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:"rgba(0,0,0,0.85)"}}>
      <div className="w-full max-w-sm rounded-2xl border p-6" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
        <h3 className="font-syne font-black text-xl mb-1">Asignar repartidor</h3>
        <p className="text-sm mb-4" style={{color:"var(--muted)"}}>
          {order.orderNumber} · ${Number(order.total).toFixed(0)}
        </p>
        {order.deliveryAddress && (
          <div className="text-xs p-3 rounded-xl mb-4" style={{background:"var(--surf2)",color:"var(--muted)"}}>
            📍 {order.deliveryAddress}
          </div>
        )}
        <div className="flex flex-col gap-2 mb-4">
          {drivers.length === 0 && (
            <p className="text-sm text-center py-4" style={{color:"var(--muted)"}}>No hay repartidores activos</p>
          )}
          {drivers.map((d: any) => (
            <button key={d.id} onClick={() => setSelected(d.id)}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-left"
              style={{
                background: selected === d.id ? "rgba(245,166,35,0.1)" : "var(--surf2)",
                border: "1px solid " + (selected === d.id ? "var(--gold)" : "var(--border)"),
              }}>
              {d.photo
                ? <img src={d.photo} alt="" className="w-10 h-10 rounded-full object-cover" />
                : <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{background:"var(--surf)"}}>🛵</div>
              }
              <div>
                <div className="font-bold text-sm">{d.name}</div>
                {d.phone && <div className="text-xs" style={{color:"var(--muted)"}}>{d.phone}</div>}
              </div>
              {selected === d.id && <span className="ml-auto" style={{color:"var(--gold)"}}>✓</span>}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl font-bold border"
            style={{borderColor:"var(--border)",color:"var(--muted)"}}>Cancelar</button>
          <button onClick={assign} disabled={!selected || saving}
            className="flex-1 py-3 rounded-xl font-syne font-black"
            style={{background: selected ? "var(--gold)" : "var(--surf2)", color: selected ? "#000" : "var(--muted)"}}>
            {saving ? "..." : "Asignar"}
          </button>
        </div>
      </div>
    </div>
  );
}
