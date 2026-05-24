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

  useEffect(() => {
    if (isOpen && typeof document !== "undefined") {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [isOpen]);

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

  const chip = (icon: React.ReactNode, label: string, prompt: string) => (
    <button
      onClick={() => handleSend(prompt)}
      className="ai-chip"
      type="button"
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <>
      {/* ── Trigger / FAB ── */}
      <button
        onClick={() => setIsOpen(true)}
        className={`ai-fab ${isOpen ? "ai-fab--hidden" : ""}`}
        aria-label="Abrir MRTPV Intelligence"
      >
        <Bot size={28} />
        <span className="ai-fab-dot"><span /></span>
      </button>

      {/* ── Overlay (mobile + desktop dim) ── */}
      {isOpen && (
        <div
          className="ai-overlay"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Agent Shell ── */}
      <div
        className={`ai-shell ${isOpen ? "ai-shell--open" : ""} ${isMinimized ? "ai-shell--min" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="MRTPV Intelligence"
      >
        {/* Handle (Mobile) */}
        <div className="ai-handle" />

        {/* Header */}
        <header className="ai-header">
          <div className="ai-header-left">
            <div className="ai-avatar">
              <Sparkles size={18} strokeWidth={2.4} />
            </div>
            <div className="ai-header-text">
              <h3>MRTPV Intelligence</h3>
              <span>
                <i className="ai-status-dot" />
                AI Engine · Online
              </span>
            </div>
          </div>
          <div className="ai-header-actions">
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="ai-icon-btn ai-icon-btn--desktop"
              aria-label={isMinimized ? "Maximizar" : "Minimizar"}
            >
              {isMinimized ? <Maximize2 size={16} /> : <Minus size={16} />}
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="ai-icon-btn"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {!isMinimized && (
          <>
            {/* Messages */}
            <div ref={scrollRef} className="ai-messages">
              {messages.map((m, i) => (
                <div key={i} className={`ai-row ${m.role === "user" ? "ai-row--user" : "ai-row--bot"}`}>
                  {m.role === "assistant" && (
                    <div className="ai-bubble-avatar">
                      <Sparkles size={12} strokeWidth={2.6} />
                    </div>
                  )}
                  <div className={`ai-bubble ${m.role === "user" ? "ai-bubble--user" : "ai-bubble--bot"}`}>
                    {m.content.split("\n").map((line, j) => (
                      <p key={j}>{line}</p>
                    ))}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="ai-row ai-row--bot">
                  <div className="ai-bubble-avatar">
                    <Sparkles size={12} strokeWidth={2.6} />
                  </div>
                  <div className="ai-bubble ai-bubble--bot ai-bubble--loading">
                    <Loader2 size={14} className="ai-spin" />
                    <span>Analizando plataforma…</span>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="ai-chips">
              {chip(<BarChart3 size={13} />, "Stats Globales", "Dime el estado actual del SaaS")}
              {chip(<Users size={13} />, "Últimos Tenants", "Lista los últimos restaurantes registrados")}
              {chip(<AlertCircle size={13} />, "Errores", "Analiza errores críticos recientes")}
              {chip(<TrendingUp size={13} />, "Churn Risk", "Riesgo de churn este mes")}
            </div>

            {/* Input */}
            <div className="ai-composer">
              <div className="ai-composer-wrap">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Escribe un comando o consulta…"
                />
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || isLoading}
                  className="ai-send"
                  aria-label="Enviar"
                >
                  <Send size={17} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <style jsx global>{`
        /* ── FAB ── */
        .ai-fab {
          position: fixed;
          right: 18px;
          bottom: 96px;
          width: 56px;
          height: 56px;
          border-radius: 18px;
          border: none;
          cursor: pointer;
          color: #fff;
          background: linear-gradient(135deg, var(--orange), var(--orange2));
          box-shadow:
            0 10px 26px rgba(124, 58, 237, 0.45),
            inset 0 0 0 1px rgba(255, 255, 255, 0.12);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 55;
          transition: transform 0.18s ease, opacity 0.18s ease;
        }
        .ai-fab:hover { transform: scale(1.06); }
        .ai-fab:active { transform: scale(0.95); }
        .ai-fab--hidden { opacity: 0; pointer-events: none; transform: scale(0.85); }
        .ai-fab-dot {
          position: absolute;
          top: 4px; right: 4px;
          width: 12px; height: 12px;
          background: var(--green);
          border-radius: 50%;
          border: 2px solid var(--bg);
          display: flex; align-items: center; justify-content: center;
        }
        .ai-fab-dot span {
          width: 4px; height: 4px;
          background: #fff;
          border-radius: 50%;
          animation: ai-pulse 1.8s ease-in-out infinite;
        }
        @media (min-width: 768px) {
          .ai-fab { width: 64px; height: 64px; border-radius: 50%; bottom: 24px; right: 24px; }
        }

        /* ── Overlay ── */
        .ai-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.62);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          z-index: 60;
          animation: ai-fade 0.22s ease;
        }
        @media (min-width: 768px) {
          .ai-overlay { background: rgba(0, 0, 0, 0.35); backdrop-filter: blur(3px); }
        }

        /* ── Shell ── */
        .ai-shell {
          position: fixed;
          z-index: 70;
          left: 0; right: 0; bottom: 0;
          height: 90dvh;
          max-height: 90dvh;
          background: var(--surface);
          border: 1px solid var(--border);
          border-bottom: none;
          border-radius: 24px 24px 0 0;
          box-shadow:
            0 -20px 60px rgba(0, 0, 0, 0.55),
            0 -2px 0 rgba(255, 255, 255, 0.03) inset;
          display: flex;
          flex-direction: column;
          transform: translateY(100%);
          opacity: 0;
          transition: transform 0.32s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.22s ease;
          overflow: hidden;
        }
        .ai-shell--open { transform: translateY(0); opacity: 1; }

        @media (min-width: 768px) {
          .ai-shell {
            left: auto; right: 24px; bottom: 24px;
            width: 420px;
            height: 640px;
            max-height: calc(100dvh - 48px);
            border-radius: 22px;
            border: 1px solid var(--border);
            box-shadow:
              0 24px 60px rgba(0, 0, 0, 0.5),
              0 0 0 1px rgba(124, 58, 237, 0.08);
            transform: translateY(20px) scale(0.98);
          }
          .ai-shell--open { transform: translateY(0) scale(1); }
          .ai-shell--min { height: 64px; max-height: 64px; }
        }

        /* ── Handle ── */
        .ai-handle {
          width: 38px; height: 4px;
          background: var(--border2);
          border-radius: 999px;
          margin: 8px auto 0;
          opacity: 0.5;
          flex-shrink: 0;
        }
        @media (min-width: 768px) { .ai-handle { display: none; } }

        /* ── Header ── */
        .ai-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px 12px;
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
          position: relative;
        }
        .ai-header::after {
          content: "";
          position: absolute;
          inset: 0 0 auto 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, var(--orange), transparent);
          opacity: 0.5;
        }
        .ai-header-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
        .ai-avatar {
          width: 40px; height: 40px;
          border-radius: 12px;
          background: linear-gradient(135deg, var(--orange), var(--orange2));
          display: flex; align-items: center; justify-content: center;
          color: #fff;
          box-shadow:
            0 6px 16px rgba(124, 58, 237, 0.35),
            inset 0 0 0 1px rgba(255, 255, 255, 0.15);
          flex-shrink: 0;
        }
        .ai-header-text { min-width: 0; }
        .ai-header-text h3 {
          font-size: 15px;
          font-weight: 700;
          color: var(--text);
          letter-spacing: -0.3px;
          line-height: 1.15;
          margin: 0;
          font-family: 'Syne', 'DM Sans', sans-serif;
        }
        .ai-header-text span {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          font-weight: 600;
          color: var(--text3);
          margin-top: 4px;
          letter-spacing: 1.4px;
          text-transform: uppercase;
          font-family: 'DM Mono', monospace;
        }
        .ai-status-dot {
          width: 6px; height: 6px;
          background: var(--green);
          border-radius: 50%;
          box-shadow: 0 0 6px var(--green);
          animation: ai-pulse 2s ease-in-out infinite;
        }
        .ai-header-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
        .ai-icon-btn {
          width: 34px; height: 34px;
          border-radius: 10px;
          border: 1px solid transparent;
          background: transparent;
          color: var(--text2);
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: background 0.15s, color 0.15s, border-color 0.15s;
        }
        .ai-icon-btn:hover {
          background: var(--surface2);
          color: var(--text);
          border-color: var(--border);
        }
        .ai-icon-btn--desktop { display: none; }
        @media (min-width: 768px) { .ai-icon-btn--desktop { display: flex; } }

        /* ── Messages ── */
        .ai-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px 14px 8px;
          background:
            radial-gradient(circle at 50% -20%, var(--orange-dim) 0%, transparent 50%),
            var(--bg);
          display: flex;
          flex-direction: column;
          gap: 12px;
          scrollbar-width: thin;
          scrollbar-color: var(--border2) transparent;
        }
        .ai-messages::-webkit-scrollbar { width: 4px; }
        .ai-messages::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 4px; }
        .ai-messages::-webkit-scrollbar-track { background: transparent; }

        .ai-row { display: flex; gap: 8px; max-width: 100%; }
        .ai-row--user { justify-content: flex-end; }
        .ai-row--bot  { justify-content: flex-start; }

        .ai-bubble-avatar {
          width: 24px; height: 24px;
          border-radius: 8px;
          background: linear-gradient(135deg, var(--orange), var(--orange2));
          color: #fff;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          margin-top: 2px;
          box-shadow: 0 2px 8px rgba(124, 58, 237, 0.3);
        }

        .ai-bubble {
          max-width: 80%;
          padding: 11px 14px;
          font-size: 13.5px;
          line-height: 1.5;
          border-radius: 16px;
          word-wrap: break-word;
        }
        .ai-bubble p { margin: 0; }
        .ai-bubble p + p { margin-top: 6px; }

        .ai-bubble--bot {
          background: var(--surface2);
          color: var(--text);
          border: 1px solid var(--border);
          border-top-left-radius: 4px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
        }
        .ai-bubble--user {
          background: linear-gradient(135deg, var(--orange), var(--orange2));
          color: #fff;
          border-top-right-radius: 4px;
          box-shadow: 0 4px 14px rgba(124, 58, 237, 0.35);
        }
        .ai-bubble--loading {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: var(--text2);
        }
        .ai-spin { animation: ai-spin 0.9s linear infinite; color: var(--orange); }

        /* ── Chips ── */
        .ai-chips {
          display: flex;
          gap: 8px;
          padding: 10px 14px;
          overflow-x: auto;
          background: var(--surface);
          border-top: 1px solid var(--border);
          flex-shrink: 0;
          scrollbar-width: none;
        }
        .ai-chips::-webkit-scrollbar { display: none; }
        .ai-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 12px;
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 999px;
          font-size: 11px;
          font-weight: 600;
          color: var(--text2);
          white-space: nowrap;
          cursor: pointer;
          transition: background 0.15s, color 0.15s, border-color 0.15s;
          font-family: 'DM Sans', sans-serif;
          flex-shrink: 0;
        }
        .ai-chip:hover {
          background: var(--orange-dim);
          color: var(--orange);
          border-color: var(--orange-glow);
        }
        .ai-chip svg { opacity: 0.85; }

        /* ── Composer ── */
        .ai-composer {
          padding: 12px 14px max(12px, env(safe-area-inset-bottom));
          background: var(--surface);
          border-top: 1px solid var(--border);
          flex-shrink: 0;
        }
        .ai-composer-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 6px 6px 6px 4px;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .ai-composer-wrap:focus-within {
          border-color: var(--orange);
          box-shadow: 0 0 0 3px var(--orange-glow);
        }
        .ai-composer-wrap input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          font-size: 14px;
          color: var(--text);
          padding: 8px 10px;
          font-family: 'DM Sans', sans-serif;
          min-width: 0;
        }
        .ai-composer-wrap input::placeholder { color: var(--text3); }
        .ai-send {
          width: 38px; height: 38px;
          border-radius: 11px;
          border: none;
          background: linear-gradient(135deg, var(--orange), var(--orange2));
          color: #fff;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: transform 0.12s, opacity 0.15s;
          box-shadow: 0 4px 12px rgba(124, 58, 237, 0.35);
          flex-shrink: 0;
        }
        .ai-send:hover { transform: scale(1.04); }
        .ai-send:active { transform: scale(0.94); }
        .ai-send:disabled {
          opacity: 0.45;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        /* ── Animations ── */
        @keyframes ai-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes ai-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes ai-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </>
  );
}
