// /onboarding · Onboarding conversacional con IA (chat)
//
// Flujo POST-verify-email para dueños recién registrados: la IA conduce una
// conversación que completa los datos del negocio y llama a /api/onboarding/chat.
// Es la puerta de entrada al dashboard para un tenant nuevo.
//
// NO confundir con /admin/configurar-negocio (app/(setup)/…): ese wizard de
// cards (Restaurante/Retail/Bar/Café) se usa post-login cuando el usuario
// no tiene un restaurante, o desde el Sidebar al "Añadir sucursal".
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getApiUrl } from "@/lib/config";

const API = getApiUrl();

// ── Tipos ────────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface OnboardingState {
  businessData: {
    name: string | null;
    businessType: string | null;
    phone: string | null;
    address: string | null;
  };
  activatedModules: string[];
  suggestedCategories: string[];
  currentStep: "greeting" | "collecting" | "confirming" | "done";
}

const MODULE_META: Record<string, { label: string; emoji: string; color: string }> = {
  pos_standard:        { label: "POS",            emoji: "💳", color: "#FF8400" },
  kds:                 { label: "Cocina (KDS)",   emoji: "🍳", color: "#FFB84D" },
  delivery:            { label: "Delivery",       emoji: "🛵", color: "#22D3EE" },
  inventory:           { label: "Inventario",     emoji: "📦", color: "#A78BFA" },
  employee_management: { label: "Empleados",      emoji: "👥", color: "#60A5FA" },
  cash_shift:          { label: "Turnos de Caja", emoji: "💼", color: "#88D66C" },
  client_menu:         { label: "Tienda Online",  emoji: "🛍",  color: "#F472B6" },
};

const STEP_LABELS: Record<OnboardingState["currentStep"], string> = {
  greeting:   "Bienvenida",
  collecting: "Configurando",
  confirming: "Confirmando",
  done:       "Listo",
};

const STEP_ORDER: OnboardingState["currentStep"][] = [
  "greeting", "collecting", "confirming", "done",
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function authHeader(): Record<string, string> {
  const t = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// ── Componentes internos ─────────────────────────────────────────────────────

function AIAvatar({ size = 32 }: { size?: number }) {
  return (
    <div
      className="relative shrink-0 rounded-full flex items-center justify-center"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, #FF8400 0%, #FFB84D 100%)",
        boxShadow: "0 4px 12px rgba(255,132,0,0.35)",
      }}
    >
      <span
        className="absolute inset-0 rounded-full opacity-60"
        style={{
          background: "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.5), transparent 60%)",
        }}
      />
      <span className="relative font-black text-black" style={{ fontSize: size * 0.32 }}>
        AI
      </span>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2.5 mb-5">
      <AIAvatar size={32} />
      <div
        className="px-4 py-3 rounded-2xl rounded-bl-sm"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(20px)",
        }}
      >
        <div className="flex gap-1.5 items-center h-4">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full animate-bounce"
              style={{
                background: "linear-gradient(135deg, #FF8400, #FFB84D)",
                animationDelay: `${i * 150}ms`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div
      className={`flex items-end gap-2.5 mb-5 animate-in fade-in slide-in-from-bottom-2 duration-300 ${
        isUser ? "flex-row-reverse" : ""
      }`}
    >
      {!isUser && <AIAvatar size={32} />}

      <div
        className="max-w-[78%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap"
        style={
          isUser
            ? {
                background: "linear-gradient(135deg, #FF8400 0%, #FFB84D 100%)",
                color: "#0C0C0E",
                fontWeight: 500,
                borderRadius: "20px 20px 4px 20px",
                boxShadow: "0 6px 16px rgba(255,132,0,0.25)",
              }
            : {
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#F5F5F5",
                backdropFilter: "blur(20px)",
                borderRadius: "20px 20px 20px 4px",
              }
        }
      >
        {msg.content}
      </div>
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();

  // Auth + gate
  const [booting, setBooting]       = useState(true);
  const [tenantName, setTenantName] = useState("");

  // Chat
  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory]   = useState<Message[]>([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);

  const [obState, setObState] = useState<OnboardingState>({
    businessData:        { name: null, businessType: null, phone: null, address: null },
    activatedModules:    ["pos_standard"],
    suggestedCategories: [],
    currentStep:         "greeting",
  });

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const didGreet  = useRef(false);

  // ── Auth guard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) { router.replace("/login"); return; }

    fetch(`${API}/api/tenant/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (r.status === 401) { router.replace("/login"); return null; }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        if (data.isOnboarded)       { router.replace("/admin");                 return; }
        if (!data.emailVerifiedAt)  { router.replace("/register?pending=true"); return; }
        setTenantName(data.name || "");
        setBooting(false);
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  // ── Primer mensaje automático ──────────────────────────────────────────────
  useEffect(() => {
    if (booting || didGreet.current) return;
    didGreet.current = true;
    sendMessage("inicio", []);
  }, [booting]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ── Enviar mensaje ─────────────────────────────────────────────────────────
  async function sendMessage(userText: string, currentHistory: Message[]) {
    const token = localStorage.getItem("accessToken");
    if (!token) { router.replace("/login"); return; }

    setLoading(true);

    const isGreeting = userText === "inicio" && currentHistory.length === 0;
    if (!isGreeting) {
      setMessages((prev) => [...prev, { role: "user", content: userText }]);
    }

    const historyToSend = isGreeting
      ? []
      : [...currentHistory, { role: "user" as const, content: userText }];

    try {
      const res = await fetch(`${API}/api/onboarding/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body:    JSON.stringify({ message: userText, history: historyToSend }),
      });

      if (res.status === 401) { router.replace("/login"); return; }

      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.error || "Ocurrió un error. Intenta de nuevo." },
        ]);
        return;
      }

      setObState({
        businessData:        data.businessData        ?? obState.businessData,
        activatedModules:    data.activatedModules    ?? obState.activatedModules,
        suggestedCategories: data.suggestedCategories ?? obState.suggestedCategories,
        currentStep:         data.currentStep         ?? obState.currentStep,
      });

      const aiMsg: Message = { role: "assistant", content: data.message };
      setMessages((prev) => [...prev, aiMsg]);

      const nextHistory: Message[] = isGreeting ? [aiMsg] : [...historyToSend, aiMsg];
      setHistory(nextHistory);

      if (data.currentStep === "done") {
        setTimeout(() => router.replace("/admin"), 2000);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error de conexión. Intenta de nuevo." },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    sendMessage(text, history);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  }

  // ── Loading inicial ────────────────────────────────────────────────────────
  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0C0C0E" }}>
        <div className="flex flex-col items-center gap-4">
          <AIAvatar size={48} />
          <div
            className="w-6 h-6 rounded-full animate-spin"
            style={{
              border: "2px solid rgba(255,132,0,0.2)",
              borderTopColor: "#FF8400",
            }}
          />
          <p className="text-xs text-zinc-500">Preparando tu asistente…</p>
        </div>
      </div>
    );
  }

  const isDone = obState.currentStep === "done";
  const stepIdx = STEP_ORDER.indexOf(obState.currentStep);
  const businessFilled = Object.values(obState.businessData).filter(Boolean).length;
  const businessTotal  = Object.keys(obState.businessData).length;

  // ── UI principal ───────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen text-white flex relative overflow-hidden"
      style={{ background: "#0C0C0E", fontFamily: "'Inter', sans-serif" }}
    >
      {/* Glows decorativos */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-48 -left-32 w-[800px] h-[800px] rounded-full opacity-50"
        style={{ background: "radial-gradient(circle, rgba(255,132,0,0.18) 0%, transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[400px] -right-32 w-[700px] h-[700px] rounded-full opacity-40"
        style={{ background: "radial-gradient(circle, rgba(136,214,108,0.12) 0%, transparent 70%)" }}
      />

      {/* ── Sidebar branding ─────────────────────────────────────────────── */}
      <aside
        className="hidden lg:flex flex-col w-[360px] shrink-0 relative z-10"
        style={{
          borderRight: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(12,12,14,0.4)",
          backdropFilter: "blur(20px)",
        }}
      >
        {/* Header */}
        <div className="p-8" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2.5 mb-4">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider"
              style={{
                background: "rgba(255,132,0,0.18)",
                border: "1px solid rgba(255,132,0,0.4)",
                color: "#FF8400",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#FF8400" }} />
              ASISTENTE IA
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tighter mb-1">
            MRTPV<span style={{ color: "#FF8400" }}>REST</span>
          </h1>
          <p className="text-zinc-500 text-xs">
            Sistema POS para LATAM · v2.4
          </p>
        </div>

        {/* Tenant card + progress */}
        <div className="p-6 space-y-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div>
            <p className="text-[10px] font-bold tracking-wider mb-2" style={{ color: "#666" }}>
              CONFIGURANDO
            </p>
            <p className="text-sm font-bold truncate">{tenantName || "Tu negocio"}</p>
          </div>

          {/* Progress steps */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold tracking-wider" style={{ color: "#666" }}>
                PROGRESO
              </p>
              <span className="text-[10px] font-bold" style={{ color: "#FF8400" }}>
                {Math.round(((stepIdx + 1) / STEP_ORDER.length) * 100)}%
              </span>
            </div>
            <div className="flex gap-1.5 mb-3">
              {STEP_ORDER.map((s, i) => (
                <div
                  key={s}
                  className="h-1 flex-1 rounded-full transition-all"
                  style={{
                    background: i <= stepIdx
                      ? "linear-gradient(90deg, #FF8400, #FFB84D)"
                      : "rgba(255,255,255,0.06)",
                  }}
                />
              ))}
            </div>
            <p className="text-xs text-zinc-400">
              {STEP_LABELS[obState.currentStep]}
              <span className="text-zinc-600">
                {" "}· {businessFilled}/{businessTotal} datos
              </span>
            </p>
          </div>
        </div>

        {/* Módulos activados */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold tracking-wider" style={{ color: "#666" }}>
                MÓDULOS ACTIVOS
              </p>
              <span
                className="text-[10px] font-bold px-1.5 rounded-full tabular-nums"
                style={{ background: "rgba(136,214,108,0.18)", color: "#88D66C" }}
              >
                {obState.activatedModules.length}
              </span>
            </div>
            <div className="space-y-1.5">
              {obState.activatedModules.map((mod) => {
                const meta = MODULE_META[mod] || { label: mod, emoji: "✦", color: "#FF8400" };
                return (
                  <div
                    key={mod}
                    className="flex items-center gap-3 px-3 py-2 rounded-xl animate-in fade-in slide-in-from-left-3"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-base"
                      style={{ background: `${meta.color}20` }}
                    >
                      {meta.emoji}
                    </div>
                    <span className="flex-1 text-xs font-semibold">{meta.label}</span>
                    <svg className="w-3.5 h-3.5" style={{ color: "#88D66C" }} viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                );
              })}
            </div>
          </div>

          {obState.suggestedCategories.length > 0 && (
            <div>
              <p className="text-[10px] font-bold tracking-wider mb-3" style={{ color: "#666" }}>
                CATEGORÍAS SUGERIDAS
              </p>
              <div className="flex flex-wrap gap-1.5">
                {obState.suggestedCategories.map((cat) => (
                  <span
                    key={cat}
                    className="text-xs px-2.5 py-1 rounded-full animate-in fade-in"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      color: "#B8B9B6",
                    }}
                  >
                    {cat}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-6" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-zinc-600 text-[10px] flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-zinc-700" />
            Powered by Gemini · Onboarding privado
          </p>
        </div>
      </aside>

      {/* ── Main: chat ───────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-h-screen relative z-10">
        {/* Header */}
        <header
          className="shrink-0 flex items-center justify-between px-5 lg:px-10 py-4"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-center gap-3">
            <AIAvatar size={36} />
            <div>
              <p className="text-sm font-bold">Asistente MRTPVREST</p>
              <p className="text-[10px] flex items-center gap-1.5" style={{ color: "#88D66C" }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#88D66C" }} />
                En línea · responde en segundos
              </p>
            </div>
          </div>

          {/* Mobile progress chip */}
          <div className="lg:hidden flex items-center gap-2">
            <div className="flex gap-0.5">
              {STEP_ORDER.map((s, i) => (
                <div
                  key={s}
                  className="w-3 h-1 rounded-full"
                  style={{ background: i <= stepIdx ? "#FF8400" : "rgba(255,255,255,0.1)" }}
                />
              ))}
            </div>
          </div>

          <div className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <span className="text-[10px] font-bold tracking-wider" style={{ color: "#666" }}>PASO</span>
            <span className="text-[11px] font-bold">{stepIdx + 1}/{STEP_ORDER.length}</span>
            <span className="text-[10px]" style={{ color: "#FF8400" }}>· {STEP_LABELS[obState.currentStep]}</span>
          </div>
        </header>

        {/* Mensajes */}
        <div className="flex-1 overflow-y-auto px-4 md:px-10 py-8">
          <div className="max-w-2xl mx-auto">
            {messages.map((msg, i) => (
              <ChatBubble key={i} msg={msg} />
            ))}
            {loading && <TypingIndicator />}
            {isDone && (
              <div className="text-center mt-8 animate-in fade-in zoom-in duration-500">
                <div
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full"
                  style={{
                    background: "rgba(136,214,108,0.18)",
                    border: "1px solid rgba(136,214,108,0.4)",
                  }}
                >
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#88D66C" }} />
                  <span className="text-xs font-bold" style={{ color: "#88D66C" }}>
                    Configuración completa — abriendo tu panel…
                  </span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input */}
        <form
          onSubmit={handleSubmit}
          className="shrink-0 px-4 md:px-10 py-5"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="max-w-2xl mx-auto">
            <div
              className="flex items-end gap-2 p-2 rounded-3xl transition-all focus-within:border-orange-500/40"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                backdropFilter: "blur(20px)",
              }}
            >
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading || isDone}
                placeholder={isDone ? "Configuración completada" : "Escribe tu respuesta…"}
                className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none resize-none disabled:opacity-40 disabled:cursor-not-allowed max-h-32"
                style={{ minHeight: 40 }}
              />
              <button
                type="submit"
                disabled={!input.trim() || loading || isDone}
                aria-label="Enviar"
                className="shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:scale-100"
                style={{
                  background: "linear-gradient(135deg, #FF8400 0%, #FFB84D 100%)",
                  boxShadow: input.trim() && !loading ? "0 4px 14px rgba(255,132,0,0.4)" : "none",
                }}
              >
                {loading ? (
                  <div
                    className="w-4 h-4 rounded-full animate-spin"
                    style={{ border: "2px solid rgba(0,0,0,0.3)", borderTopColor: "#0C0C0E" }}
                  />
                ) : (
                  <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.269 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                )}
              </button>
            </div>
            <p className="mt-2 text-center text-[10px]" style={{ color: "#444" }}>
              Enter para enviar · Shift+Enter para salto de línea
            </p>
          </div>
        </form>
      </main>
    </div>
  );
}
