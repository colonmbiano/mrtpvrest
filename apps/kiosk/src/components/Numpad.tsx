"use client";
import { IconBackspace, IconCheck } from "@/components/Icon";

export function Numpad({ value, onChange, onConfirm, max = 999 }: {
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  max?: number;
}) {
  function press(d: string) {
    if (value.length >= String(max).length) return;
    const next = value + d;
    if (parseInt(next, 10) > max) return;
    onChange(next);
  }
  function backspace() { onChange(value.slice(0, -1)); }

  const keys = ["1","2","3","4","5","6","7","8","9"];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
      {keys.map((k) => (
        <NumKey key={k} onClick={() => press(k)}>{k}</NumKey>
      ))}
      <NumKey onClick={backspace}><IconBackspace size={28} /></NumKey>
      <NumKey onClick={() => press("0")}>0</NumKey>
      <NumKey
        onClick={onConfirm}
        disabled={value === ""}
        style={{ background: "var(--brand-primary)", color: "var(--bg)" }}
      >
        <IconCheck size={28} />
      </NumKey>
    </div>
  );
}

function NumKey({ children, onClick, disabled, style }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        all: "unset",
        display: "flex", alignItems: "center", justifyContent: "center",
        minHeight: 76,
        background: "var(--surf2)", color: "var(--text)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        fontSize: 28, fontWeight: 800, fontFamily: "var(--font-mono)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
