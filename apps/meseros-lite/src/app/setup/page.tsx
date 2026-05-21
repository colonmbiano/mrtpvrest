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
  const [token, setToken] = useState("");
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
      setToken(nextToken);
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
    <section className="min-h-screen bg-[#0a0a0c] px-5 py-5 text-neutral-200">
      <header className="mb-5">
        <p className="text-sm font-bold uppercase tracking-wide text-[#ffb84d]">
          Alta de tablet
        </p>
        <h1 className="text-3xl font-black text-neutral-100">Configurar meseros lite</h1>
      </header>

      <div className="mx-auto max-w-2xl rounded-lg border border-neutral-800 bg-[#121214] p-4">
        {step === "login" && (
          <div className="grid gap-4">
            <div className="rounded-lg border border-neutral-800 bg-[#18181b] p-4">
              <LogIn className="mb-3 text-[#ffb84d]" size={32} />
              <h2 className="text-2xl font-black text-neutral-100">Cuenta admin</h2>
              <p className="mt-2 text-base font-bold text-neutral-400">
                Entra con una cuenta del restaurante para elegir la sucursal de esta tablet.
              </p>
            </div>

            <label className="grid gap-2">
              <span className="text-sm font-black uppercase text-neutral-500">Correo</span>
              <div className="grid grid-cols-[1fr_72px] gap-2">
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  inputMode="email"
                  autoComplete="username"
                  className="min-h-[64px] min-w-0 rounded-lg border border-neutral-800 bg-[#0a0a0c] px-4 text-xl font-bold text-neutral-100 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowEmailDomains((current) => !current)}
                  className="min-h-[64px] rounded-lg border border-neutral-800 bg-[#18181b] text-2xl font-black text-[#ffb84d] active:scale-95 transition-all duration-150"
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
                      className="min-h-[64px] rounded-lg border border-neutral-800 bg-[#18181b] px-3 text-base font-black text-neutral-200 active:scale-95 transition-all duration-150"
                    >
                      @{domain}
                    </button>
                  ))}
                </div>
              )}
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-black uppercase text-neutral-500">Password</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                className="min-h-[64px] rounded-lg border border-neutral-800 bg-[#0a0a0c] px-4 text-xl font-bold text-neutral-100 outline-none"
              />
            </label>

            {error && (
              <p className="rounded-lg border border-[#ffb84d] bg-[#18181b] p-4 text-base font-black text-[#ffb84d]">
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
                  ? "border-neutral-800 bg-[#18181b] text-neutral-500"
                  : "border-[#ffb84d] bg-[#ffb84d] text-[#0a0a0c]",
              ].join(" ")}
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </div>
        )}

        {step === "workspace" && (
          <div className="grid gap-4">
            <div className="rounded-lg border border-neutral-800 bg-[#18181b] p-4">
              <Store className="mb-3 text-[#ffb84d]" size={32} />
              <h2 className="text-2xl font-black text-neutral-100">Restaurante y sucursal</h2>
              <p className="mt-2 text-base font-bold text-neutral-400">
                Esta seleccion queda guardada en la tablet y se usa para el header x-restaurant-id.
              </p>
            </div>

            {workspaces.length === 0 ? (
              <p className="rounded-lg border border-neutral-800 bg-[#18181b] p-4 text-base font-black text-neutral-400">
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
                        "min-h-[88px] rounded-lg border bg-[#18181b] p-4 text-left",
                        "active:scale-95 transition-all duration-150",
                        selected ? "border-[#ffb84d]" : "border-neutral-800",
                      ].join(" ")}
                    >
                      <p className="text-xl font-black text-neutral-100">
                        {workspace.restaurantName}
                      </p>
                      <p className="mt-1 text-base font-bold text-[#ffb84d]">{workspace.name}</p>
                      {workspace.address && (
                        <p className="mt-1 text-sm font-bold text-neutral-500">
                          {workspace.address}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {error && (
              <p className="rounded-lg border border-[#ffb84d] bg-[#18181b] p-4 text-base font-black text-[#ffb84d]">
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
                  ? "border-[#ffb84d] bg-[#ffb84d] text-[#0a0a0c]"
                  : "border-neutral-800 bg-[#18181b] text-neutral-500",
              ].join(" ")}
            >
              Guardar dispositivo
            </button>
          </div>
        )}

        {step === "done" && (
          <div className="grid min-h-[260px] place-items-center text-center">
            <div>
              <Check className="mx-auto mb-4 text-[#ffb84d]" size={48} />
              <h2 className="text-3xl font-black text-neutral-100">Tablet configurada</h2>
              <p className="mt-2 text-base font-bold text-neutral-400">
                Abriendo acceso por PIN...
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
