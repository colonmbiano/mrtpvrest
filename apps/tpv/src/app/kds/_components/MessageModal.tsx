"use client";
import { useState } from "react";
import api from "@/lib/api";
import { QUICK_MESSAGES } from "../_lib/kds";

type Props = {
  order: { id: string; orderNumber: string };
  stationLabel: string;
  station: string;
  onClose: () => void;
};

export default function MessageModal({ order, stationLabel, station, onClose }: Props) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      await api.post("/api/kds/message", { orderId: order.id, station, message: trimmed });
      onClose();
    } catch {} finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/90">
      <div className="w-full max-w-md rounded-2xl border border-white/5 overflow-hidden bg-[#111]">
        <div className="px-6 py-4 border-b border-white/5 bg-[#0a0a0a] flex items-center justify-between">
          <div>
            <div className="font-black text-base text-yellow-400">📢 Avisar al TPV</div>
            <div className="text-xs text-white/30 mt-0.5">{order.orderNumber} · {stationLabel}</div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/5 text-white/30 flex items-center justify-center">
            ✕
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {QUICK_MESSAGES.map((msg) => (
              <button key={msg} onClick={() => setText(msg)}
                className="py-2.5 px-3 rounded-xl text-xs font-bold text-left transition-all"
                style={{
                  background: text === msg ? "rgba(245,158,11,0.15)" : "#1a1a1a",
                  color: text === msg ? "#f59e0b" : "#555",
                  border: `1px solid ${text === msg ? "#f59e0b44" : "#222"}`,
                }}>
                {msg}
              </button>
            ))}
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)}
            placeholder="O escribe un mensaje..."
            rows={2}
            className="w-full px-4 py-3 rounded-xl text-sm bg-black border border-white/5 text-white outline-none resize-none" />
          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-3 rounded-xl font-bold text-sm bg-white/5 text-white/30">
              Cancelar
            </button>
            <button onClick={send} disabled={sending || !text.trim()}
              className="flex-[2] py-3 rounded-xl font-black text-sm transition-all"
              style={{
                background: text.trim() ? "#f59e0b" : "#1a1a1a",
                color: text.trim() ? "#000" : "#333",
              }}>
              {sending ? "Enviando..." : "📢 Enviar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
