"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LogIn, Store } from "lucide-react";
import api from "@/lib/api";

interface Workspace {
  id: string;
  restaurantId: string;
  restaurantName: string;
  name: string;
  address?: string | null;
  businessType?: string | null;
}

type Step = "login" | "workspace" | "done";

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [showEmailDomains, setShowEmailDomains] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId);
  const emailDomains = ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com"];

  const applyEmailDomain = (domain: string) => {
    setEmail((current) => {
      const localPart = current.includes("@") ? current.split("@")[0] : current;
      return localPart ? `${localPart}@${domain}` : `@${domain}`;
    });
    setShowEmailDomains(false);
  };

  const handleLogin = async () => {
    setLoading(true);
    setError("");

    try {
      const loginResponse = await api.post("/api/auth/login", { email, password });
      const nextToken = loginResponse.data.accessToken as string;
      sessionStorage.setItem("tpv-access-token", nextToken);
      localStorage.setItem("accessToken", nextToken);

      const workspaceResponse = await api.get<{ workspaces: Workspace[] }>("/api/workspaces/me", {
        headers: { Authorization: `Bearer ${nextToken}` },
      });
      const nextWorkspaces = workspaceResponse.data.workspaces || [];
      setWorkspaces(nextWorkspaces);
      setSelectedWorkspaceId(nextWorkspaces[0]?.id || "");
      setStep("workspace");
    } catch (err: unknown) {
      const message =
        typeof err === "object" &&
        err !== null &&
        "response" in err &&
        typeof (err as { response?: { data?: { error?: string } } }).response?.data?.error === "string"
          ? (err as { response: { data: { error: string } } }).response.data.error
          : "No se pudo iniciar sesion.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (!selectedWorkspace) {
      setError("Selecciona una sucursal.");
      return;
    }

    localStorage.setItem("restaurantId", selectedWorkspace.restaurantId);
    localStorage.setItem("activeRestaurantId", selectedWorkspace.restaurantId);
    localStorage.setItem("locationId", selectedWorkspace.id);
    localStorage.setItem("activeLocationId", selectedWorkspace.id);
    localStorage.setItem("meseros-lite-workspace", JSON.stringify(selectedWorkspace));
    sessionStorage.removeItem("tpv-access-token");
    localStorage.removeItem("accessToken");
    localStorage.removeItem("tpv-employee-token");
    localStorage.removeItem("currentEmployeeId");
    localStorage.removeItem("currentEmployeeName");
    localStorage.removeItem("currentEmployeeRole");

    setStep("done");
    window.setTimeout(() => router.replace("/pin"), 650);
  };

  return (
    <section className="min-h-screen bg-[var(--bg)] px-5 py-5 text-[var(--text-primary)]">
      <header className="mb-5">
        <p className="text-sm font-bold uppercase tracking-wide text-[var(--brand)]">
          Alta de tablet
        </p>
        <h1 className="text-3xl font-black text-[var(--text-primary)]">Configurar meseros lite</h1>
      </header>

      <div className="mx-auto max-w-2xl rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4">
        {step === "login" && (
          <div className="grid gap-4">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-3)] p-4">
              <LogIn className="mb-3 text-[var(--brand)]" size={32} />
              <h2 className="text-2xl font-black text-[var(--text-primary)]">Cuenta admin</h2>
              <p className="mt-2 text-base font-bold text-[var(--text-secondary)]">
                Entra con una cuenta del restaurante para elegir la sucursal de esta tablet.
              </p>
            </div>

            <label className="grid gap-2">
              <span className="text-sm font-black uppercase text-[var(--text-muted)]">Correo</span>
              <div className="grid grid-cols-[1fr_72px] gap-2">
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  inputMode="email"
                  autoComplete="username"
                  className="min-h-[64px] min-w-0 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 text-xl font-bold text-[var(--text-primary)] outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowEmailDomains((current) => !current)}
                  className="min-h-[64px] rounded-lg border border-[var(--border)] bg-[var(--surface-3)] text-2xl font-black text-[var(--brand)] active:scale-95 transition-all duration-150"
                  aria-expanded={showEmailDomains}
                  aria-label="Mostrar terminaciones de correo"
                >
                  @
                </button>
              </div>
              {showEmailDomains && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {emailDomains.map((domain) => (
                    <button
                      key={domain}
                      type="button"
                      onClick={() => applyEmailDomain(domain)}
                      className="min-h-[64px] rounded-lg border border-[var(--border)] bg-[var(--surface-3)] px-3 text-base font-black text-[var(--text-primary)] active:scale-95 transition-all duration-150"
                    >
                      @{domain}
                    </button>
                  ))}
                </div>
              )}
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-black uppercase text-[var(--text-muted)]">Password</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                className="min-h-[64px] rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 text-xl font-bold text-[var(--text-primary)] outline-none"
              />
            </label>

            {error && (
              <p className="rounded-lg border border-[var(--brand)] bg-[var(--surface-3)] p-4 text-base font-black text-[var(--brand)]">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={handleLogin}
              disabled={loading || !email || !password}
              className={[
                "min-h-[72px] rounded-lg border px-5 text-xl font-black",
                "active:scale-95 transition-all duration-150",
                loading || !email || !password
                  ? "border-[var(--border)] bg-[var(--surface-3)] text-[var(--text-muted)]"
                  : "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-fg)]",
              ].join(" ")}
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </div>
        )}

        {step === "workspace" && (
          <div className="grid gap-4">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-3)] p-4">
              <Store className="mb-3 text-[var(--brand)]" size={32} />
              <h2 className="text-2xl font-black text-[var(--text-primary)]">Restaurante y sucursal</h2>
              <p className="mt-2 text-base font-bold text-[var(--text-secondary)]">
                Esta seleccion queda guardada en la tablet y se usa para el header x-restaurant-id.
              </p>
            </div>

            {workspaces.length === 0 ? (
              <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-3)] p-4 text-base font-black text-[var(--text-secondary)]">
                Esta cuenta no tiene sucursales activas.
              </p>
            ) : (
              <div className="grid gap-3">
                {workspaces.map((workspace) => {
                  const selected = workspace.id === selectedWorkspaceId;
                  return (
                    <button
                      key={workspace.id}
                      type="button"
                      onClick={() => setSelectedWorkspaceId(workspace.id)}
                      className={[
                        "min-h-[88px] rounded-lg border bg-[var(--surface-3)] p-4 text-left",
                        "active:scale-95 transition-all duration-150",
                        selected ? "border-[var(--brand)]" : "border-[var(--border)]",
                      ].join(" ")}
                    >
                      <p className="text-xl font-black text-[var(--text-primary)]">
                        {workspace.restaurantName}
                      </p>
                      <p className="mt-1 text-base font-bold text-[var(--brand)]">{workspace.name}</p>
                      {workspace.address && (
                        <p className="mt-1 text-sm font-bold text-[var(--text-muted)]">
                          {workspace.address}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {error && (
              <p className="rounded-lg border border-[var(--brand)] bg-[var(--surface-3)] p-4 text-base font-black text-[var(--brand)]">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={!selectedWorkspace}
              className={[
                "min-h-[72px] rounded-lg border px-5 text-xl font-black",
                "active:scale-95 transition-all duration-150",
                selectedWorkspace
                  ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-fg)]"
                  : "border-[var(--border)] bg-[var(--surface-3)] text-[var(--text-muted)]",
              ].join(" ")}
            >
              Guardar dispositivo
            </button>
          </div>
        )}

        {step === "done" && (
          <div className="grid min-h-[260px] place-items-center text-center">
            <div>
              <Check className="mx-auto mb-4 text-[var(--brand)]" size={48} />
              <h2 className="text-3xl font-black text-[var(--text-primary)]">Tablet configurada</h2>
              <p className="mt-2 text-base font-bold text-[var(--text-secondary)]">
                Abriendo acceso por PIN...
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
