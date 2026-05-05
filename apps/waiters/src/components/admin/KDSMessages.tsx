"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";

export default function KDSMessages() {
  const [messages, setMessages] = useState<any[]>([]);
  const [open, setOpen]         = useState(false);

  async function fetchMessages() {
    try {
      const { data } = await api.get("/api/kds/messages/unread");
      setMessages(data);
    } catch {}
  }

  async function markRead(id: string) {
    try {
      await api.put(`/api/kds/messages/${id}/read`);
      setMessages(p => p.filter(m => m.id !== id));
    } catch {}
  }

  useEffect(() => {
    fetchMessages();
    const t = setInterval(fetchMessages, 10000);
    return () => clearInterval(t);
  }, []);

  const STATION_LABELS: Record<string,string> = {
    KITCHEN:"🍳 Cocina", BAR:"🍹 Barra", FRYER:"🍟 Freidora"
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen(p => !p)}
        className="relative px-3 py-2 rounded-xl text-xs font-bold border"
        style={{borderColor: messages.length > 0 ? "#f59e0b" : "var(--border)",
          background: messages.length > 0 ? "rgba(245,158,11,0.1)" : "var(--surf2)",
          color: messages.length > 0 ? "#f59e0b" : "var(--muted)"}}>
        📺 KDS
        {messages.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-xs font-black flex items-center justify-center"
            style={{background:"#ef4444",color:"#fff"}}>
            {messages.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-80 rounded-2xl border z-50 overflow-hidden"
          style={{background:"var(--surf)",borderColor:"var(--border)"}}>
          <div className="px-4 py-3 border-b flex items-center justify-between"
            style={{borderColor:"var(--border)",background:"var(--surf2)"}}>
            <span className="font-syne font-bold text-sm">📺 Mensajes de cocina</span>
            <button onClick={() => setOpen(false)} style={{color:"var(--muted)"}}>✕</button>
          </div>
          {messages.length === 0 ? (
            <div className="text-center py-6 text-sm" style={{color:"var(--muted)"}}>Sin mensajes</div>
          ) : messages.map(msg => (
            <div key={msg.id} className="px-4 py-3 border-b flex items-start gap-3"
              style={{borderColor:"var(--border)"}}>
              <div className="flex-1">
                <div className="text-xs font-bold mb-0.5" style={{color:"#f59e0b"}}>
                  {STATION_LABELS[msg.station] || msg.station}
                </div>
                <div className="text-xs font-bold">{msg.orderId}</div>
                <div className="text-sm mt-0.5">{msg.message}</div>
                <div className="text-xs mt-1" style={{color:"var(--muted)"}}>
                  {new Date(msg.createdAt).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}
                </div>
              </div>
              <button onClick={() => markRead(msg.id)}
                className="px-2 py-1 rounded-lg text-xs font-bold flex-shrink-0"
                style={{background:"rgba(34,197,94,0.1)",color:"#22c55e"}}>
                ✓ OK
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
