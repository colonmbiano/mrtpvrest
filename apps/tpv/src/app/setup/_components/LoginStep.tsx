import type { FormEvent } from "react";
import { Lock } from "lucide-react";
import { Heading, Label, Input, PrimaryButton } from "./primitives";

type Props = {
  email: string;
  password: string;
  error: string;
  loading: boolean;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
};

export default function LoginStep({
  email,
  password,
  error,
  loading,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: Props) {
  return (
    <form onSubmit={onSubmit}>
      <Heading icon={<Lock />}>Vincular TPV</Heading>
      <p className="mt-1 mb-6 text-sm" style={{ color: "var(--text-secondary)" }}>
        Inicia sesión como administrador para asignar este dispositivo a una sucursal.
      </p>
      <Label htmlFor="email">Email</Label>
      <Input
        id="email"
        name="email"
        type="email"
        value={email}
        onChange={(e) => onEmailChange(e.target.value)}
        required
        autoComplete="email"
      />
      <Label htmlFor="password">Contraseña</Label>
      <Input
        id="password"
        name="password"
        type="password"
        value={password}
        onChange={(e) => onPasswordChange(e.target.value)}
        required
        autoComplete="current-password"
      />
      {error && (
        <div
          className="mt-3 p-3 rounded-xl text-sm"
          style={{
            background: "var(--danger-soft)",
            color: "var(--danger)",
            border: "1px solid var(--danger)",
          }}
        >
          {error}
        </div>
      )}
      <PrimaryButton disabled={loading} type="submit">
        {loading ? "Entrando…" : "Entrar"}
      </PrimaryButton>
    </form>
  );
}
