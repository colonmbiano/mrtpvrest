"use client";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

/* Los inputs se renderizan como HERMANOS del <label> (no anidados):
   los e2e localizan campos con `label:has-text(...) ~ input`. */

const CONTROL_CLS =
  "w-full rounded-ds-md px-3 py-2.5 text-[13.5px] font-medium outline-none transition-shadow focus:shadow-[0_0_0_4px_var(--accent-soft)]";
const CONTROL_STYLE = {
  background: "var(--surf-1)",
  border: "1px solid var(--bd-2)",
  color: "var(--tx)",
} as const;

export function Field({
  label,
  hint,
  error,
  required = false,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-3 ${className}`}>
      <label className="mb-1.5 block font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">
        {label}
        {required && <span style={{ color: "var(--err)" }}> *</span>}
      </label>
      {children}
      {error ? (
        <div className="mt-1 text-[11px] font-semibold" style={{ color: "var(--err)" }}>{error}</div>
      ) : hint ? (
        <div className="mt-1 text-[11px] text-tx-dim">{hint}</div>
      ) : null}
    </div>
  );
}

export function Input({ className = "", style, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${CONTROL_CLS} ${className}`} style={{ ...CONTROL_STYLE, ...style }} {...props} />;
}

export function Select({ className = "", style, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${CONTROL_CLS} cursor-pointer appearance-none ${className}`} style={{ ...CONTROL_STYLE, ...style }} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className = "", style, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${CONTROL_CLS} min-h-[90px] resize-y ${className}`} style={{ ...CONTROL_STYLE, ...style }} {...props} />;
}

export function Toggle({
  checked,
  onChange,
  label = "Activar",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative shrink-0 rounded-full transition-transform active:scale-95 before:absolute before:-inset-2 before:content-['']"
      style={{
        width: 42,
        height: 25,
        border: "none",
        background: checked ? "var(--brand-primary)" : "var(--surf-3)",
        transition: "background .2s",
      }}
    >
      <span
        className="absolute rounded-full bg-white"
        style={{
          top: 3,
          left: checked ? 20 : 3,
          width: 19,
          height: 19,
          transition: "left .2s cubic-bezier(.5,1.5,.5,1)",
          boxShadow: "0 1px 3px rgba(0,0,0,.3)",
        }}
      />
    </button>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: readonly { value: T; label: string }[] | readonly T[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const items = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <div className={`flex flex-wrap gap-1 gap-y-1 rounded-ds-md p-1 ${className}`} style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
      {items.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className="min-h-10 flex-1 rounded-[10px] px-2 text-xs font-bold transition-colors"
            style={{
              color: active ? "var(--accent-contrast)" : "var(--tx-mut)",
              background: active ? "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))" : "transparent",
              boxShadow: active ? "0 3px 10px var(--accent-glow)" : "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: readonly { value: T; label: string }[] | readonly T[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const items = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <div className={`ds-scrollbar flex gap-2 overflow-x-auto ${className}`}>
      {items.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className="min-h-10 shrink-0 rounded-full px-3.5 text-xs font-bold transition-colors"
            style={{
              border: `1px solid ${active ? "transparent" : "var(--bd-1)"}`,
              color: active ? "var(--accent-contrast)" : "var(--tx-mut)",
              background: active ? "var(--brand-primary)" : "var(--surf-1)",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
