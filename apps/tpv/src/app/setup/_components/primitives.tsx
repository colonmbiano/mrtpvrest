import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Page({ children }: { children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 overflow-auto flex items-center justify-center p-6"
      style={{ background: "var(--bg)" }}
    >
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <h1
            className="text-3xl font-black tracking-tighter"
            style={{ color: "var(--brand)", fontFamily: "var(--font-display)" }}
          >
            MRTPVREST
          </h1>
          <p
            className="text-[10px] mt-1 font-bold uppercase tracking-widest"
            style={{ color: "var(--text-muted)", letterSpacing: "0.18em" }}
          >
            Configuración de dispositivo
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-3xl p-7 relative"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-lg)",
      }}
    >
      {children}
    </div>
  );
}

export function Heading({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      {icon && (
        <span
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
        >
          {icon}
        </span>
      )}
      <h1
        className="text-xl font-black tracking-tight"
        style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
      >
        {children}
      </h1>
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2
      className="text-[10px] font-bold uppercase tracking-widest mb-2.5"
      style={{ color: "var(--text-muted)", letterSpacing: "0.14em" }}
    >
      {children}
    </h2>
  );
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-[10px] font-bold uppercase tracking-widest mt-4 mb-1.5"
      style={{ color: "var(--text-muted)", letterSpacing: "0.14em" }}
    >
      {children}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-xl text-base outline-none transition-colors"
      style={{
        padding: "12px 14px",
        background: "var(--surface-2)",
        color: "var(--text-primary)",
        border: "1px solid var(--border)",
        ...props.style,
      }}
    />
  );
}

export function PrimaryButton({ children, onClick, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      onClick={onClick}
      {...rest}
      className="w-full mt-2 py-4 rounded-2xl font-black uppercase text-sm transition-all hover:brightness-110 active:scale-[0.98]"
      style={{
        background: "var(--brand)",
        color: "var(--brand-fg)",
        border: "none",
        cursor: rest.disabled ? "not-allowed" : "pointer",
        opacity: rest.disabled ? 0.5 : 1,
        boxShadow: "var(--shadow-glow)",
        letterSpacing: "0.08em",
      }}
    >
      {children}
    </button>
  );
}
