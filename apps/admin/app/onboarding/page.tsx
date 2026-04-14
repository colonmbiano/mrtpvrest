"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

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

const MODULE_LABELS: Record<string, string> = {
  pos_standard:        "POS",
  kds:                 "Cocina (KDS)",
  delivery:            "Delivery",
  inventory:           "Inventario",
  employee_management: "Empleados",
  cash_shift:          "Turnos de Caja",
  client_menu:         "Tienda Online",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function authHeader(): Record<string, string> {
  const t = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// ── Componentes internos ─────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 mb-4">
      <div className="w-7 h-7 rounded-full bg-[var(--brand-primary)]/20 border border-[var(--brand-primary)]/30 flex items-center justify-center shrink-0">
        <span className="text-[var(--brand-primary)] text-[10px] font-black">AI</span>
      </div>
      <div className="bg-white/[0.06] border border-white/10 rounded-2xl rounded-bl-sm px-4 py-3">
        <div className="flex gap-1 items-center h-4">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }}
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
    <div className={`flex items-end gap-2 mb-4 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-[var(--brand-primary)]/20 border border-[var(--brand-primary)]/30 flex items-center justify-center shrink-0">
          <span className="text-[var(--brand-primary)] text-[10px] font-black">AI</span>
        </div>
      )}

      {/* Bubble */}
      <div
        className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-[var(--brand-primary)] text-black font-medium rounded-br-sm"
            : "bg-white/[0.06] border border-white/10 text-gray-100 rounded-bl-sm"
        }`}
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
  const [history, setHistory]   = useState<Message[]>([]);   // lo que se envía al backend
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);

  // Estado del onboarding deducido desde las respuestas de la IA
  const [obState, setObState] = useState<OnboardingState>({
    businessData:        { name: null, businessType: null, phone: null, address: null },
    activatedModules:    ["pos_standard"],
    suggestedCategories: [],
    currentStep:         "greeting",
  });

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
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

      // Actualizar estado del onboarding
      setObState({
        businessData:        data.businessData        ?? obState.businessData,
        activatedModules:    data.activatedModules    ?? obState.activatedModules,
        suggestedCategories: data.suggestedCategories ?? obState.suggestedCategories,
        currentStep:         data.currentStep         ?? obState.currentStep,
      });

      const aiMsg: Message = { role: "assistant", content: data.message };
      setMessages((prev) => [...prev, aiMsg]);

      const nextHistory: Message[] = isGreeting
        ? [aiMsg]
        : [...historyToSend, aiMsg];
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

  // ── Loading inicial ────────────────────────────────────────────────────────
  if (booting) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--brand-primary)]/30 border-t-[var(--brand-primary)] rounded-full animate-spin" />
      </div>
    );
  }

  const isDone = obState.currentStep === "done";

  // ── UI principal ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[var(--bg)] text-white flex" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ── Columna izquierda: branding ──────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col justify-between w-[340px] shrink-0 border-r border-white/[0.06] p-10">
        {/* Logo */}
        <div>
          <h1 className="text-2xl font-black tracking-tighter mb-1">
            MRTPV<span className="text-[var(--brand-primary)]">REST</span>
          </h1>
          <p className="text-gray-500 text-sm">Sistema POS para LATAM</p>
        </div>

        {/* Módulos activados */}
        <div className="flex-1 flex flex-col justify-center gap-6 py-10">
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
              Módulos activos
            </p>
            <div className="flex flex-wrap gap-2">
              {obState.activatedModules.map((mod) => (
                <span
                  key={mod}
                  className="text-xs px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/25 text-green-400 font-semibold"
                >
                  {MODULE_LABELS[mod] ?? mod}
                </span>
              ))}
            </div>
          </div>

          {/* Categorías sugeridas */}
          {obState.suggestedCategories.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
                Categorías sugeridas
              </p>
              <div className="flex flex-wrap gap-2">
                {obState.suggestedCategories.map((cat) => (
                  <span
                    key={cat}
                    className="text-xs px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/10 text-gray-300"
                  >
                    {cat}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Pie */}
        <p className="text-gray-600 text-xs">
          {tenantName ? `Configurando: ${tenantName}` : "Configurando tu negocio…"}
        </p>
      </aside>

      {/* ── Columna derecha: chat ─────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-h-screen">

        {/* Header móvil */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <h1 className="text-lg font-black tracking-tighter">
            MRTPV<span className="text-[var(--brand-primary)]">REST</span>
          </h1>
          {obState.activatedModules.length > 0 && (
            <div className="flex gap-1 flex-wrap justify-end max-w-[60%]">
              {obState.activatedModules.map((mod) => (
                <span key={mod} className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/25 text-green-400 font-semibold">
                  {MODULE_LABELS[mod] ?? mod}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Mensajes */}
        <div className="flex-1 overflow-y-auto px-4 md:px-10 py-6">
          {messages.map((msg, i) => (
            <ChatBubble key={i} msg={msg} />
          ))}
          {loading && <TypingIndicator />}
          {isDone && (
            <p className="text-center text-gray-500 text-xs mt-4 animate-pulse">
              Redirigiendo al panel…
            </p>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <form
          onSubmit={handleSubmit}
          className="shrink-0 flex items-center gap-3 px-4 md:px-10 py-4 border-t border-white/[0.06]"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading || isDone}
            placeholder={isDone ? "Configuración completada" : "Escribe tu respuesta…"}
            className="flex-1 bg-white/[0.04] border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-gray-600 outline-none focus:border-[var(--brand-primary)]/50 focus:bg-white/[0.06] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading || isDone}
            className="w-10 h-10 rounded-2xl bg-[var(--brand-primary)] flex items-center justify-center shrink-0 transition-all hover:bg-[var(--brand-primary)] disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Enviar"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.269 20.876L5.999 12zm0 0h7.5" />
              </svg>
            )}
          </button>
        </form>
      </main>
    </div>
  );
}
