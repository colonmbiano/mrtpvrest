"use client";

import React, { useState, useRef, useEffect } from "react";
import { Bot, X, Send, Minus, Maximize2, Loader2, Sparkles, BarChart3, Users, AlertCircle, TrendingUp } from "lucide-react";
import api from "@/lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function SaaSAgent() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "¡Hola! Soy el Agente de Inteligencia de MRTPVREST. ¿En qué puedo ayudarte hoy a gestionar tu plataforma SaaS?" }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen, isMinimized]);

  const handleSend = async (text?: string) => {
    const userMsg = (text || input).trim();
    if (!userMsg || isLoading) return;

    setInput("");
    const newMessages: Message[] = [...messages, { role: "user", content: userMsg }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const { data } = await api.post("/api/saas-ai/agent", { messages: newMessages });
      
      if (data.message) {
        setMessages([...newMessages, { role: "assistant", content: data.message }]);
      } else {
        setMessages([...newMessages, { role: "assistant", content: "Lo siento, tuve un problema procesando esa solicitud." }]);
      }
    } catch (error: any) {
      console.error("SaaS Agent Error:", error);
      setMessages([...newMessages, { role: "assistant", content: "Error de conexión: " + (error.response?.data?.error || error.message) }]);
    } finally {
      setIsLoading(false);
    }
  };

  const QuickChips = () => (
    <div className="px-4 py-2 flex gap-2 overflow-x-auto scrollbar-hide shrink-0 bg-surface-1">
      <button 
        onClick={() => handleSend("Dime el estado actual del SaaS")}
        className="flex items-center gap-2 px-3 py-1.5 bg-surface-2 border border-border rounded-full text-[11px] font-bold text-text-secondary hover:bg-surface-hover transition-colors whitespace-nowrap"
      >
        <BarChart3 size={14} /> Stats Globales
      </button>
      <button 
        onClick={() => handleSend("Lista los últimos restaurantes registrados")}
        className="flex items-center gap-2 px-3 py-1.5 bg-surface-2 border border-border rounded-full text-[11px] font-bold text-text-secondary hover:bg-surface-hover transition-colors whitespace-nowrap"
      >
        <Users size={14} /> Últimos Tenants
      </button>
      <button 
        onClick={() => handleSend("Analiza errores críticos recientes")}
        className="flex items-center gap-2 px-3 py-1.5 bg-surface-2 border border-border rounded-full text-[11px] font-bold text-text-secondary hover:bg-surface-hover transition-colors whitespace-nowrap"
      >
        <AlertCircle size={14} /> Errores
      </button>
      <button 
        onClick={() => handleSend("Riesgo de churn este mes")}
        className="flex items-center gap-2 px-3 py-1.5 bg-surface-2 border border-border rounded-full text-[11px] font-bold text-text-secondary hover:bg-surface-hover transition-colors whitespace-nowrap"
      >
        <TrendingUp size={14} /> Churn Risk
      </button>
    </div>
  );

  return (
    <>
      {/* ── Trigger / FAB ── */}
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed md:bottom-6 md:right-6 bottom-[96px] right-[18px] w-[52px] h-[52px] md:w-16 md:h-16 rounded-2xl md:rounded-full shadow-glow flex items-center justify-center text-white transition-all hover:scale-110 active:scale-95 z-[55] group
          ${isOpen ? "opacity-0 pointer-events-none" : "opacity-100"}
          bg-gradient-to-br from-brand-hi to-brand`}
        style={{
          background: "linear-gradient(135deg, var(--orange2), var(--orange))",
          boxShadow: "0 8px 24px rgba(124, 58, 237, 0.4), inset 0 0 0 1px rgba(255,255,255,0.1)"
        }}
      >
        <Bot size={28} className="group-hover:rotate-12 transition-transform md:w-8 md:h-8" />
        <div className="absolute top-1 right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-black flex items-center justify-center">
          <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
        </div>
      </button>

      {/* ── Overlay (Mobile) ── */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* ── Agent Shell ── */}
      <div className={`
        fixed z-[70] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]
        ${isOpen ? "translate-y-0 opacity-100" : "translate-y-full md:translate-y-20 opacity-0 pointer-events-none"}
        
        /* Mobile: Bottom Sheet */
        bottom-0 left-0 right-0 h-[88%] bg-surface-1 rounded-t-[22px] flex flex-col md:hidden
        
        /* Desktop: Float Card */
        md:bottom-6 md:right-6 md:left-auto md:w-[400px] md:rounded-3xl md:border md:border-border md:shadow-lg md:h-[600px]
        ${isMinimized ? "md:h-16" : ""}
      `}>
        {/* Handle (Mobile) */}
        <div className="w-9 h-1 bg-border-2 rounded-full mx-auto mt-3 mb-1 md:hidden opacity-40" />

        {/* Header */}
        <div className="p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 md:w-10 md:h-10 bg-brand rounded-xl flex items-center justify-center text-white shadow-glow shadow-brand-glow/20">
              <Sparkles size={18} />
            </div>
            <div>
              <h3 className="font-bold text-sm leading-none text-text-primary">MRTPV Intelligence</h3>
              <span className="text-[9px] md:text-[10px] opacity-60 uppercase tracking-widest font-black text-text-secondary">AI Engine</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setIsMinimized(!isMinimized)} className="p-2 hover:bg-surface-2 rounded-lg transition-colors hidden md:block">
              {isMinimized ? <Maximize2 size={18} /> : <Minus size={18} />}
            </button>
            <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-surface-2 rounded-lg transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {(!isMinimized || typeof window !== 'undefined' && window.innerWidth < 768) && (
          <>
            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide bg-surface-0/30">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed ${
                    m.role === "user" 
                      ? "bg-brand text-white rounded-tr-none shadow-md shadow-brand-glow/10" 
                      : "bg-surface-2 text-text-primary rounded-tl-none border border-border shadow-sm"
                  }`}
                  style={m.role === "user" ? { background: "var(--orange)" } : {}}
                  >
                    <div className="prose prose-invert max-w-none">
                      {m.content.split('\n').map((line, j) => (
                        <p key={j} className={j > 0 ? "mt-2" : ""}>{line}</p>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-surface-2 p-4 rounded-2xl rounded-tl-none border border-border flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin text-brand" />
                    <span className="text-xs text-text-secondary">Analizando plataforma...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <QuickChips />

            {/* Input */}
            <div className="p-4 bg-surface-1 border-t border-border shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="flex items-center gap-2 bg-surface-2 border border-border p-2 rounded-2xl focus-within:border-brand transition-colors">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Escribe un comando o consulta..."
                  className="flex-1 bg-transparent border-none outline-none text-sm px-2 text-text-primary placeholder:text-text-muted"
                />
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || isLoading}
                  className="w-10 h-10 bg-brand text-white rounded-xl flex items-center justify-center disabled:opacity-50 transition-all active:scale-95 shadow-glow shadow-brand-glow/20"
                  style={{ background: "var(--orange)" }}
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        .shadow-glow { box-shadow: 0 0 20px rgba(124, 58, 237, 0.2); }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </>
  );
}
