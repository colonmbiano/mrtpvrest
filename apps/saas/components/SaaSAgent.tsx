"use client";

import React, { useState, useRef, useEffect } from "react";
import { Bot, X, Send, Minus, Maximize2, Loader2, Sparkles, Database, BarChart3, Users } from "lucide-react";
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
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
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

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-16 h-16 bg-brand rounded-full shadow-glow shadow-brand-glow/50 flex items-center justify-center text-white transition-all hover:scale-110 active:scale-95 z-[9999] group"
      >
        <Bot size={32} className="group-hover:rotate-12 transition-transform" />
        <div className="absolute -top-1 -right-1 w-5 h-5 bg-danger rounded-full border-2 border-bg-app flex items-center justify-center">
          <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
        </div>
      </button>
    );
  }

  return (
    <div className={`fixed bottom-6 right-6 w-[400px] bg-surface-1 border border-border shadow-lg rounded-3xl overflow-hidden z-[9999] transition-all flex flex-col ${isMinimized ? "h-16" : "h-[600px]"}`}>
      {/* Header */}
      <div className="bg-brand p-4 flex items-center justify-between text-white shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
            <Sparkles size={20} />
          </div>
          <div>
            <h3 className="font-bold text-sm leading-none">MRTPV Intelligence</h3>
            <span className="text-[10px] opacity-80 uppercase tracking-widest font-black">Super Admin AI</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setIsMinimized(!isMinimized)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            {isMinimized ? <Maximize2 size={18} /> : <Minus size={18} />}
          </button>
          <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide bg-surface-0/50">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed ${
                  m.role === "user" 
                    ? "bg-brand text-white rounded-tr-none shadow-md" 
                    : "bg-surface-2 text-text-primary rounded-tl-none border border-border shadow-sm"
                }`}>
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
          <div className="px-4 py-2 flex gap-2 overflow-x-auto scrollbar-hide shrink-0 bg-surface-1">
            <button 
              onClick={() => setInput("Dime el estado actual del SaaS")}
              className="flex items-center gap-2 px-3 py-1.5 bg-surface-2 border border-border rounded-full text-[11px] font-bold text-text-secondary hover:bg-surface-hover transition-colors whitespace-nowrap"
            >
              <BarChart3 size={14} /> Stats Globales
            </button>
            <button 
              onClick={() => setInput("Lista los últimos restaurantes registrados")}
              className="flex items-center gap-2 px-3 py-1.5 bg-surface-2 border border-border rounded-full text-[11px] font-bold text-text-secondary hover:bg-surface-hover transition-colors whitespace-nowrap"
            >
              <Users size={14} /> Últimos Tenants
            </button>
          </div>

          {/* Input */}
          <div className="p-4 bg-surface-1 border-t border-border shrink-0">
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
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="w-10 h-10 bg-brand text-white rounded-xl flex items-center justify-center disabled:opacity-50 transition-all active:scale-95"
              >
                <Send size={18} />
              </button>
            </div>
            <div className="mt-2 flex justify-center">
              <span className="text-[9px] text-text-muted uppercase tracking-widest font-black">Powered by Gemini AI Engine</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
