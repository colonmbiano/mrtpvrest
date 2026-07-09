"use client";
import { useEffect, useRef, useState } from "react";
import { Bot, MessageSquare, Plus, Send, X } from "lucide-react";
import { Avatar, IconButton } from "@/components/ds";
import type { Msg } from "./types";

const QUICK = ["Resumir el reporte", "Enviar por email", "Predecir próxima semana"];

function OkDot() {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: "var(--ok)" }} />;
}

function Spinner() {
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 animate-spin rounded-full"
      style={{ border: "1.5px solid var(--brand-primary)", borderRightColor: "transparent" }}
    />
  );
}

/* Panel del chat de Mesero (POST /api/ai/assistant vía onSend del padre) +
   FAB para abrirlo. En móvil se muestra con scrim; en desktop flota a la
   derecha sin bloquear la página. Todo oculto al imprimir. */
export function ChatPanel({
  open,
  onOpen,
  onClose,
  msgs,
  sending,
  onSend,
  onClear,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  msgs: Msg[];
  sending: boolean;
  onSend: (text: string) => void;
  onClear: () => void;
}) {
  const [chatMsg, setChatMsg] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [msgs]);

  function send() {
    const clean = chatMsg.trim();
    if (!clean || sending) return;
    onSend(clean);
    setChatMsg("");
  }

  return (
    <>
      {/* Scrim solo móvil — mismo color que el Overlay de components/ds/overlay.tsx
          (no hay token para el scrim; excepción justificada). */}
      {open && (
        <button
          type="button"
          aria-label="Cerrar asistente"
          onClick={onClose}
          className="fixed inset-0 z-30 cursor-default backdrop-blur-[2px] print:hidden md:hidden"
          style={{ background: "rgba(11,18,32,.55)" }}
        />
      )}

      {open && (
        <aside
          aria-label="Asistente IA"
          className="ds-enter fixed inset-y-0 right-0 z-40 flex w-full max-w-[380px] flex-col shadow-card-lg print:hidden"
          style={{ background: "var(--surf-3)", borderLeft: "1px solid var(--bd-1)" }}
        >
          {/* Header */}
          <div className="flex items-center gap-2.5 border-b px-4 py-4" style={{ borderColor: "var(--bd-1)" }}>
            <div
              className="relative grid h-9 w-9 shrink-0 place-items-center rounded-[11px]"
              style={{
                background: "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))",
                color: "var(--accent-contrast)",
              }}
            >
              <Bot size={18} />
              <span
                className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full"
                style={{ background: "var(--ok)", border: "2px solid var(--surf-3)" }}
              />
            </div>
            <div>
              <h3 className="font-display text-sm font-extrabold text-tx-hi">Mesero</h3>
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[.08em]" style={{ color: "var(--ok)" }}>
                ● En línea · listo
              </div>
            </div>
            <div className="ml-auto flex gap-1">
              <IconButton icon={Plus} label="Limpiar chat" variant="ghost" size={32} onClick={onClear} />
              <IconButton icon={X} label="Ocultar chat" variant="ghost" size={32} onClick={onClose} />
            </div>
          </div>

          {/* Mensajes */}
          <div ref={chatRef} className="ds-scrollbar flex flex-1 flex-col gap-4 overflow-y-auto p-4">
            {msgs.map((m, i) => (
              <div key={i} className={`flex gap-2.5 ${m.role === "user" ? "justify-end" : ""}`}>
                {m.role === "ai" && <Avatar initials="M" size={28} />}
                <div className="min-w-0 flex-1">
                  <div
                    className={`max-w-[270px] whitespace-pre-wrap rounded-ds-md px-3.5 py-2.5 text-[13px] leading-relaxed ${
                      m.role === "user" ? "ml-auto rounded-tr-[4px]" : "rounded-tl-[4px]"
                    }`}
                    style={
                      m.role === "ai"
                        ? { background: "var(--surf-1)", color: "var(--tx-mid)", border: "1px solid var(--bd-1)" }
                        : {
                            background: "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))",
                            color: "var(--accent-contrast)",
                          }
                    }
                  >
                    {m.text}
                  </div>
                  {m.tools && m.tools.length > 0 && (
                    <div className="mt-1.5 flex flex-col gap-1">
                      {m.tools.map((t, ti) => (
                        <div
                          key={t}
                          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-tx-mid"
                          style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
                        >
                          {i < msgs.length - 1 ? <OkDot /> : ti === m.tools!.length - 1 ? <Spinner /> : <OkDot />}
                          {t}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {m.role === "user" && <Avatar initials="D" size={28} gradient="var(--ok)" />}
              </div>
            ))}

            {/* Indicador de escritura si el último mensaje es del usuario */}
            {msgs[msgs.length - 1]?.role === "user" && (
              <div className="flex gap-2.5">
                <Avatar initials="M" size={28} />
                <div
                  className="flex items-center gap-1 rounded-ds-md rounded-tl-[4px] px-3.5 py-2.5"
                  style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}
                >
                  {[0, 1, 2].map((k) => (
                    <span
                      key={k}
                      className="inline-block h-1.5 w-1.5 animate-pulse rounded-full"
                      style={{ background: "var(--brand-primary)", animationDelay: `${k * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t px-4 pb-4 pt-3.5" style={{ borderColor: "var(--bd-1)" }}>
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {QUICK.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChatMsg(c)}
                  className="rounded-full px-2.5 py-1 text-[11px] text-tx-mid transition-colors hover:text-tx"
                  style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
                >
                  {c}
                </button>
              ))}
            </div>
            <div
              className="flex items-center gap-2 rounded-ds-md p-2 pl-3.5"
              style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
            >
              <input
                value={chatMsg}
                onChange={(e) => setChatMsg(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Escribe o usa /reporte, /alerta, /predicción…"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-tx outline-none"
              />
              <IconButton icon={Send} label="Enviar" variant="primary" size={36} onClick={send} />
            </div>
            <div className="mt-2 flex items-center justify-between font-mono text-[10px] tracking-[.04em] text-tx-dim">
              <span className="flex items-center gap-1">
                <span className="inline-block h-[5px] w-[5px] rounded-full" style={{ background: "var(--ok)" }} />
                MESERO · modelo v2.1
              </span>
              <span>Enter para enviar</span>
            </div>
          </div>
        </aside>
      )}

      {/* FAB para abrir el asistente */}
      {!open && (
        <button
          type="button"
          onClick={onOpen}
          title="Abrir asistente IA"
          aria-label="Abrir asistente IA"
          className="fixed bottom-[88px] right-[18px] z-30 grid h-14 w-14 place-items-center rounded-full transition-transform hover:scale-105 active:scale-95 print:hidden md:bottom-6 md:right-6"
          style={{
            background: "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))",
            color: "var(--accent-contrast)",
            boxShadow: "0 6px 18px var(--accent-glow)",
          }}
        >
          <MessageSquare size={24} />
        </button>
      )}
    </>
  );
}
