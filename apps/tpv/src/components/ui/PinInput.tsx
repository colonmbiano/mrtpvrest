"use client";
import React from "react";
import { Lock } from "lucide-react";

/**
 * PinInput — entrada de PIN numérico reutilizable.
 *
 * Centraliza la regla de "solo dígitos, máximo N" que estaba copiada en
 * EmployeeModal y DiscountModal (`value.replace(/\D/g, "").slice(0, 6)`), más
 * el `inputMode="numeric"` y el estilo basado en tokens. Variantes:
 *  - `masked`: oculta los dígitos (type=password) para PIN de autorización.
 *  - `withIcon`: muestra un candado a la izquierda (por defecto = masked).
 */
export interface PinInputProps {
  value: string;
  onChange: (digits: string) => void;
  /** Máximo de dígitos. Default 6 (los PIN del TPV son de 4 a 6). */
  maxLength?: number;
  /** Oculta los dígitos (PIN de autorización). Default false. */
  masked?: boolean;
  /** Muestra el icono de candado. Default: igual que `masked`. */
  withIcon?: boolean;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  id?: string;
  ariaLabel?: string;
  className?: string;
}

const BASE_CLASS = "w-full px-3 py-2.5 rounded-lg text-sm outline-none";
const BASE_STYLE: React.CSSProperties = {
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  color: "var(--text-primary)",
};

export default function PinInput({
  value,
  onChange,
  maxLength = 6,
  masked = false,
  withIcon,
  placeholder = "••••",
  disabled,
  autoFocus,
  id,
  ariaLabel,
  className = "",
}: PinInputProps) {
  const showIcon = withIcon ?? masked;

  const input = (
    <input
      id={id}
      value={value}
      onChange={(e) =>
        onChange(e.target.value.replace(/\D/g, "").slice(0, maxLength))
      }
      type={masked ? "password" : "text"}
      inputMode="numeric"
      autoComplete="off"
      disabled={disabled}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={`${BASE_CLASS} ${showIcon ? "pl-9" : ""} ${className}`.trim()}
      style={BASE_STYLE}
    />
  );

  if (!showIcon) return input;

  return (
    <div className="relative">
      <Lock
        size={14}
        className="absolute left-3 top-1/2 -translate-y-1/2"
        style={{ color: "var(--text-muted)" }}
      />
      {input}
    </div>
  );
}
