// IngredientShortageModal.tsx — Modal TPV para notificar falta de ingrediente
// Colocar en: admin/components/admin/IngredientShortageModal.tsx
"use client";
import { useState } from "react";
import api from "@/lib/api";

const QUICK_OPTIONS = [
  "Sin ese ingrediente",
  "Sustituir por otro ingrediente",
  "Cancelar ese producto y descontar del total",
  "Cancelar el pedido completo",
];

export default function IngredientShortageModal({ order, onClose }: {
  order: any; onClose: () => void;
}) {
  const [missingItem, setMissingItem] = useState("");
  const [options, setOptions]         = useState<string[]>([...QUICK_OPTIONS]);
  const [customOption, setCustomOption] = useState("");
  const [sending, setSending]         = useState(false);
  const [sent, setSent]               = useState(false);

  function addCustomOption() {
    if (!customOption.trim()) return;
    setOptions(p => [...p, customOption.trim()]);
    setCustomOption("");
  }

  function removeOption(idx: number) {
    setOptions(p => p.filter((_, i) => i !== idx));
  }

  async function sendNotification() {
    if (!missingItem.trim()) { alert("Indica qué ingrediente falta"); return; }
    setSending(true);
    try {
      await api.post("/api/notifications/ingredient-shortage", {
        orderId: order.id,
        missingItem: missingItem.trim(),
        options: options.filter(Boolean),
      });
      setSent(true);
    } catch (err: any) { alert(err.response?.data?.error || "Error al enviar"); }
    finally { setSending(false); }
  }

  if (sent) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:"rgba(0,0,0,0.85)"}}>
      <div className="w-full max-w-sm rounded-2xl border p-6 text-center" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
        <div className="text-5xl mb-3">✅</div>
        <h3 className="font-syne font-black text-xl mb-2">Notificación enviada</h3>
        <p className="text-sm mb-4" style={{color:"var(--muted)"}}>
          Se notificó al cliente por WhatsApp y notificación push con las opciones disponibles.
        </p>
        <button onClick={onClose}
          className="w-full py-3 rounded-xl font-syne font-black"
          style={{background:"var(--gold)",color:"#000"}}>
          Cerrar
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" style={{background:"rgba(0,0,0,0.85)"}}>
      <div className="w-full max-w-md rounded-2xl border my-4" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{borderColor:"var(--border)"}}>
          <div>
            <h3 className="font-syne font-black text-lg">⚠️ Falta de ingrediente</h3>
            <p className="text-xs" style={{color:"var(--muted)"}}>{order.orderNumber} · {order.customerName || "Cliente"}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{background:"var(--surf2)",color:"var(--muted)"}}>✕</button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          {/* Ingrediente faltante */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider mb-2" style={{color:"var(--muted)"}}>
              ¿Qué ingrediente falta?
            </label>
            <input value={missingItem} onChange={e => setMissingItem(e.target.value)}
              placeholder="Ej: Aguacate, Queso manchego, Pan brioche..."
              className="w-full px-4 py-3 rounded-xl text-sm outline-none"
              style={{background:"var(--surf2)",border:"2px solid var(--gold)",color:"var(--text)"}} />
          </div>

          {/* Productos del pedido */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider mb-2" style={{color:"var(--muted)"}}>
              Productos del pedido
            </label>
            <div className="rounded-xl border overflow-hidden" style={{borderColor:"var(--border)"}}>
              {(order.items || []).map((item: any, i: number) => (
                <div key={i} className="flex justify-between px-4 py-2 border-b last:border-0 text-sm"
                  style={{borderColor:"var(--border)"}}>
                  <span>{item.quantity}x {item.name || item.menuItem?.name}</span>
                  <span style={{color:"var(--gold)"}}>${Number(item.subtotal).toFixed(0)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Opciones para el cliente */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider mb-2" style={{color:"var(--muted)"}}>
              Opciones que verá el cliente
            </label>
            <div className="flex flex-col gap-2 mb-2">
              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2 px-3 py-2 rounded-xl"
                  style={{background:"var(--surf2)"}}>
                  <span className="text-xs font-bold w-5 text-center" style={{color:"var(--gold)"}}>{idx+1}</span>
                  <span className="text-sm flex-1">{opt}</span>
                  <button onClick={() => removeOption(idx)}
                    className="text-xs w-6 h-6 rounded-lg flex items-center justify-center"
                    style={{background:"rgba(239,68,68,0.1)",color:"#ef4444"}}>✕</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={customOption} onChange={e => setCustomOption(e.target.value)}
                placeholder="Agregar opción personalizada..."
                onKeyDown={e => e.key === "Enter" && addCustomOption()}
                className="flex-1 px-3 py-2 rounded-xl text-xs outline-none"
                style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
              <button onClick={addCustomOption}
                className="px-3 py-2 rounded-xl text-xs font-bold"
                style={{background:"var(--surf2)",color:"var(--muted)",border:"1px solid var(--border)"}}>
                + Agregar
              </button>
            </div>
          </div>

          {/* Preview del mensaje */}
          <div className="rounded-xl p-4" style={{background:"rgba(37,211,102,0.08)",border:"1px solid rgba(37,211,102,0.2)"}}>
            <div className="text-xs font-black mb-2" style={{color:"#25d366"}}>📱 Preview WhatsApp</div>
            <div className="text-xs" style={{color:"var(--muted)",whiteSpace:"pre-line"}}>
              {`*Master Burger's*\n⚠️ Aviso sobre tu pedido ${order.orderNumber}:\nNos falta *${missingItem || "[ingrediente]"}* para preparar tu pedido.\n${options.map((o,i) => `${i+1}. ${o}`).join('\n')}\nResponde con el número de tu opción.`}
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl font-bold border"
            style={{borderColor:"var(--border)",color:"var(--muted)"}}>Cancelar</button>
          <button onClick={sendNotification} disabled={sending || !missingItem.trim()}
            className="flex-1 py-3 rounded-xl font-syne font-black"
            style={{background: (!missingItem.trim() || sending) ? "var(--muted)" : "var(--gold)", color:"#000"}}>
            {sending ? "Enviando..." : "📲 Notificar cliente"}
          </button>
        </div>
      </div>
    </div>
  );
}
