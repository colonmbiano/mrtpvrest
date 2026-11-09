"use client";
import { useState } from "react";
import { createRoot } from "react-dom/client";

/** Uses an in-app dialog so Android WebView does not depend on native prompts. */
export function requestControlText(label: string): Promise<string | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    function finish(value: string | null) {
      resolve(value);
      queueMicrotask(() => { root.unmount(); host.remove(); });
    }
    function ControlDialog() {
      const [value, setValue] = useState("");
      return <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/70 p-4">
        <form role="dialog" aria-modal="true" aria-labelledby="control-text-label"
          onKeyDown={(event) => { if (event.key === "Escape") finish(null); }}
          onSubmit={(event) => { event.preventDefault(); if (value.trim().length >= 5) finish(value.trim()); }}
          className="w-full max-w-md space-y-4 rounded-2xl bg-[var(--bg)] border border-white/10 p-5 text-[var(--text)]">
          <label id="control-text-label" htmlFor="control-text" className="block font-bold">{label}</label>
          <textarea id="control-text" autoFocus value={value} maxLength={500} rows={3}
            onChange={(event) => setValue(event.target.value)} className="w-full rounded-xl border border-white/20 bg-white/5 p-3" />
          <p className="text-xs opacity-70">Mínimo 5 caracteres. Quedará registrado con tu usuario.</p>
          <div className="flex gap-3">
            <button type="button" onClick={() => finish(null)} className="flex-1 rounded-xl border p-3">Cancelar</button>
            <button type="submit" disabled={value.trim().length < 5} className="flex-1 rounded-xl bg-[var(--brand)] p-3 text-[var(--brand-fg)] disabled:opacity-40">Continuar</button>
          </div>
        </form>
      </div>;
    }
    root.render(<ControlDialog />);
  });
}
