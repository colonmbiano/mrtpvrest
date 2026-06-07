"use client";
import React from "react";

/**
 * PinInput — input de PIN numérico reutilizable.
 *
 * Centraliza la regla "solo dígitos, máximo N" (`replace(/\D/g, "").slice`) y
 * `inputMode="numeric"` que estaba repetida en los editores de empleado y los
 * flujos de autorización. Es agnóstico de estilo: reenvía `className`, `style`,
 * `placeholder`, etc. al `<input>` para que cada caller conserve su look (el
 * admin usa el tema obsidiana, los modales POS usan tokens CSS).
 *
 *  - `masked`: oculta los dígitos (type=password) para PIN de autorización.
 */
export interface PinInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "onChange" | "value" | "type" | "inputMode"
  > {
  value: string;
  onChange: (digits: string) => void;
  /** Máximo de dígitos. Default 6 (los PIN del TPV son de 4 a 6). */
  maxLength?: number;
  /** Oculta los dígitos (PIN de autorización). Default false. */
  masked?: boolean;
}

export default function PinInput({
  value,
  onChange,
  maxLength = 6,
  masked = false,
  ...rest
}: PinInputProps) {
  return (
    <input
      {...rest}
      value={value}
      onChange={(e) =>
        onChange(e.target.value.replace(/\D/g, "").slice(0, maxLength))
      }
      type={masked ? "password" : "text"}
      inputMode="numeric"
      maxLength={maxLength}
    />
  );
}
