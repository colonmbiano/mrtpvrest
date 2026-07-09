"use client";
import { useState } from "react";
import { Send } from "lucide-react";
import { IconButton, Pill } from "@/components/ds";
import { CHIPS } from "./types";

/* Hero del asistente: prompt libre + chips de sugerencia.
   El envío delega en el chat de la página (onAsk → sendChat). */
export function AiHero({ onAsk }: { onAsk: (q: string) => void }) {
  const [prompt, setPrompt] = useState("");

  function submit() {
    if (prompt.trim()) {
      onAsk(prompt);
      setPrompt("");
    }
  }

  return (
    <section
      className="relative mb-5 overflow-hidden rounded-ds-xl p-5 shadow-card md:p-6"
      style={{
        background:
          "radial-gradient(ellipse at top left,var(--accent-glow),transparent 55%),radial-gradient(ellipse at bottom right,var(--warn-soft),transparent 55%),var(--surf-1)",
        border: "1px solid var(--bd-2)",
      }}
    >
      <Pill tone="ac" live>
        MESERO · ASISTENTE DE DATOS
      </Pill>
      <h2 className="mt-3 font-display text-[22px] font-extrabold tracking-[-.02em] text-tx-hi">
        Pregúntale a Mesero lo que quieras saber
      </h2>
      <p className="mt-1.5 max-w-[720px] text-[13px] leading-relaxed text-tx-mid">
        Obtén reportes personalizados en lenguaje natural. Mesero analiza tus ventas, inventario y equipo para darte
        respuestas claras con gráficos y acciones listas para ejecutar.
      </p>

      {/* Prompt box */}
      <div
        className="mt-4 flex items-end gap-2.5 rounded-ds-lg px-4 py-3.5"
        style={{ background: "var(--surf-2)", border: "1.5px solid var(--bd-2)" }}
      >
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ej: compara las ventas de esta semana vs la anterior por sede, y dime qué productos bajaron más"
          className="max-h-[120px] min-h-[24px] flex-1 resize-none bg-transparent text-sm leading-relaxed text-tx outline-none"
        />
        <IconButton icon={Send} label="Enviar pregunta" variant="primary" size={44} onClick={submit} />
      </div>

      {/* Chips */}
      <div className="mt-3.5 flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <button
            key={c.text}
            type="button"
            onClick={() => setPrompt(c.q)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-tx-mid transition-colors hover:bg-surf-3"
            style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
          >
            <span className="text-primary">{c.icon}</span> {c.text}
          </button>
        ))}
      </div>
    </section>
  );
}
