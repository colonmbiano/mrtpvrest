"use client";

import axios from "axios";
import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://master-burguers-production.up.railway.app";
const ACCENT = "#ff5c35";

type Location = {
  id: string;
  name: string;
  address: string | null;
};

type Restaurant = {
  id: string;
  name: string;
  accentColor: string | null;
  locations: Location[];
};

export default function SetupPage() {
  const router = useRouter();

  const [linkedDevice, setLinkedDevice] = useState<null | {
    restaurantName: string;
    locationName: string;
  }>(null);
  const [step, setStep] = useState<"login" | "pick" | "saving">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);

  useEffect(() => {
    const restaurantId = localStorage.getItem("restaurantId");
    const locationId = localStorage.getItem("locationId");
    if (!restaurantId || !locationId) return;

    setLinkedDevice({
      restaurantName: localStorage.getItem("restaurantName") || "Restaurante vinculado",
      locationName: localStorage.getItem("locationName") || "Sucursal actual",
    });
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { data } = await axios.post(`${API_URL}/api/auth/login`, {
        email,
        password,
      });

      const accessToken = data.accessToken;
      const authed = axios.create({
        baseURL: API_URL,
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const me = await authed.get("/api/tenant/me");
      const tenantRestaurants: Restaurant[] = (me.data.restaurants || []).map(
        (restaurant: any) => ({
          id: restaurant.id,
          name: restaurant.name,
          accentColor: restaurant.accentColor || null,
          locations: Array.isArray(restaurant.locations)
            ? restaurant.locations
            : [],
        }),
      );

      await Promise.all(
        tenantRestaurants.map(async (restaurant) => {
          if (restaurant.locations.length > 0) return;
          try {
            const response = await authed.get(
              `/api/tenant/restaurants/${restaurant.id}/locations`,
            );
            restaurant.locations = response.data || [];
          } catch {
            restaurant.locations = [];
          }
        }),
      );

      if (tenantRestaurants.every((restaurant) => restaurant.locations.length === 0)) {
        throw new Error("No encontramos sucursales activas para esta cuenta.");
      }

      setRestaurants(tenantRestaurants);
      setStep("pick");
    } catch (err: any) {
      setError(
        err?.response?.data?.error ||
          err?.message ||
          "No se pudo iniciar sesion para vincular el dispositivo.",
      );
    } finally {
      setLoading(false);
    }
  }

  function saveLocation(restaurant: Restaurant, location: Location) {
    setStep("saving");
  function pickLocation(restaurant: Restaurant, location: Location) {
    setPicked({ restaurant, location });
    setStep("terminal");
  }

  async function finishSetup() {
    if (!picked) return;
    setStep("saving");
    const { restaurant, location } = picked;

    localStorage.setItem("restaurantId", restaurant.id);
    localStorage.setItem("restaurantName", restaurant.name);
    localStorage.setItem("locationId", location.id);
    localStorage.setItem("locationName", location.name);

    if (terminalId.trim()) {
      localStorage.setItem("terminalId", terminalId.trim());
    } else {
      localStorage.removeItem("terminalId");
    }

    if (restaurant.accentColor) {
      localStorage.setItem("mb-accent", restaurant.accentColor);
    }

    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");

    router.replace("/");
  }

  function unlinkDevice() {
    if (
      !confirm(
        "Se borrara la vinculacion local de esta terminal. Quieres continuar?",
      )
    ) {
      return;
    }

    // The setup session used an ADMIN token; wipe it so the PIN login owns the session.
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    document.cookie = "mb-role=; path=/; max-age=0; SameSite=Lax";

    router.replace("/login");
  }

  function unlink() {
    if (!confirm("¿Desvincular este TPV? Tendrás que volver a configurarlo.")) return;
    [
      "restaurantId",
      "restaurantName",
      "locationId",
      "locationName",
      "accessToken",
      "refreshToken",
      "user",
    ].forEach((key) => localStorage.removeItem(key));

    setLinkedDevice(null);
    setRestaurants([]);
    setEmail("");
    setPassword("");
    setError("");
    setStep("login");
  }

  if (linkedDevice && step === "login") {
    return (
      <PageShell>
        <Card>
          <Title>Terminal vinculada</Title>
          <Subtitle>
            Esta TPV ya esta conectada a una sucursal y puede volver a configurarse
            si lo necesitas.
          </Subtitle>

          <InfoRow label="Restaurante" value={linkedDevice.restaurantName} />
          <InfoRow label="Sucursal" value={linkedDevice.locationName} />

          <PrimaryButton onClick={() => router.replace("/")}>
            Volver al TPV
          </PrimaryButton>
          <SecondaryButton onClick={unlinkDevice}>
            Cambiar vinculacion
          </SecondaryButton>
        </Card>
      </PageShell>
      "terminalId",
      "mb-accent",
      "accessToken",
      "refreshToken",
      "user",
    ].forEach((k) => localStorage.removeItem(k));
    document.cookie = "mb-role=; path=/; max-age=0; SameSite=Lax";
    setAlreadyLinked(null);
    setStep("login");
    setEmail("");
    setPassword("");
  }

  function saveTerminalOnly() {
    const v = terminalId.trim();
    if (v) localStorage.setItem("terminalId", v);
    else localStorage.removeItem("terminalId");
    router.replace("/login");
  }

  if (alreadyLinked && step === "login") {
    return (
      <Page>
        <Card>
          <H1>Dispositivo vinculado</H1>
          <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
            <b>{alreadyLinked.restaurantName}</b> — {alreadyLinked.locationName}
          </p>

          <Label>Terminal de pagos (opcional)</Label>
          <Input
            value={terminalId}
            onChange={(e) => setTerminalId(e.target.value)}
            placeholder="Ej. 192.168.1.45 o TERM-001"
          />
          <PrimaryButton onClick={saveTerminalOnly}>Guardar y continuar</PrimaryButton>

          <div className="mt-8 pt-5 border-t" style={{ borderColor: "var(--border)" }}>
            <button
              onClick={unlink}
              className="text-sm"
              style={{ color: "#ef4444", background: "none", border: "none", cursor: "pointer" }}
            >
              Desvincular TPV
            </button>
          </div>
        </Card>
      </Page>
    );
  }

  return (
    <PageShell>
      <Card>
        {step === "login" && (
          <form onSubmit={handleLogin}>
            <Title>Configurar dispositivo TPV</Title>
            <Subtitle>
              Inicia sesion como administrador para vincular esta terminal con una
              sucursal.
            </Subtitle>

            <Label>Correo</Label>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@restaurante.com"
              required
            />

            <Label>Contrasena</Label>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              required
            />

            {error && <ErrorBox>{error}</ErrorBox>}

            <PrimaryButton disabled={loading} type="submit">
              {loading ? "Entrando..." : "Continuar"}
    <Page>
      <Card>
        {step === "login" && (
          <form onSubmit={login}>
            <H1>Vincular TPV</H1>
            <p className="mt-2 mb-6 text-sm" style={{ color: "var(--muted)" }}>
              Inicia sesión como administrador para asignar este dispositivo a una sucursal.
            </p>
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <Label>Contraseña</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            {error && (
              <div className="mt-2 text-sm" style={{ color: "#ef4444" }}>
                {error}
              </div>
            )}
            <PrimaryButton disabled={loading} type="submit">
              {loading ? "Entrando…" : "Entrar"}
            </PrimaryButton>
          </form>
        )}

        {step === "pick" && (
          <>
            <Title>Elige la sucursal</Title>
            <Subtitle>
              Selecciona la sucursal fisica donde se usara esta pantalla de TPV.
            </Subtitle>

            <div className="space-y-3">
              {restaurants.map((restaurant) =>
                restaurant.locations.length === 0 ? (
                  <div key={restaurant.id} style={mutedCardStyle}>
                    {restaurant.name}: sin sucursales disponibles
                  </div>
                ) : (
                  restaurant.locations.map((location) => (
                    <button
                      key={location.id}
                      onClick={() => saveLocation(restaurant, location)}
                      style={pickButtonStyle}
                      type="button"
                    >
                      <div style={pickTitleStyle}>{location.name}</div>
                      <div style={pickMetaStyle}>
                        {restaurant.name}
                        {location.address ? ` · ${location.address}` : ""}
                      </div>
                    </button>
                  ))
                ),
              )}
            </div>

            <SecondaryButton onClick={() => setStep("login")}>
              Volver
            </SecondaryButton>
          </>
        )}

        {step === "saving" && (
          <>
            <Title>Guardando...</Title>
            <Subtitle>Estamos terminando la configuracion de esta terminal.</Subtitle>
          </>
        )}
      </Card>
    </PageShell>
  );
}

function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen px-4 py-8" style={shellStyle}>
      {children}
            <H1>Elige la sucursal</H1>
            <p className="mt-2 mb-6 text-sm" style={{ color: "var(--muted)" }}>
              ¿En qué sucursal está físicamente este TPV?
            </p>
            {restaurants.map((r) =>
              (r.locations || []).length === 0 ? (
                <div key={r.id} className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
                  {r.name}: sin sucursales activas
                </div>
              ) : (
                r.locations.map((loc) => (
                  <button
                    key={loc.id}
                    onClick={() => pickLocation(r, loc)}
                    className="block w-full text-left p-5 mb-3 rounded-2xl border"
                    style={{ background: "var(--surf2, var(--bg))", borderColor: "var(--border)", cursor: "pointer" }}
                  >
                    <div className="text-xl font-extrabold" style={{ color: "var(--text)" }}>
                      {loc.name}
                    </div>
                    <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                      {r.name} · {loc.address || "sin dirección"}
                    </div>
                  </button>
                ))
              )
            )}
            <button
              onClick={() => {
                setStep("login");
                setRestaurants([]);
                setAuthToken(null);
              }}
              className="mt-3 text-sm"
              style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}
            >
              ← Volver
            </button>
          </>
        )}

        {step === "terminal" && picked && (
          <>
            <H1>Terminal de pagos</H1>
            <p className="mt-2 mb-6 text-sm" style={{ color: "var(--muted)" }}>
              Introduce el ID o IP de la terminal física asignada a este TPV. Es opcional — si lo dejas vacío, los pagos con tarjeta deberán cobrarse manualmente.
            </p>
            <div className="mb-4 p-3 rounded-xl" style={{ background: "var(--surf2, var(--bg))", border: "1px solid var(--border)" }}>
              <div className="text-xs uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                Vinculando
              </div>
              <div className="text-base font-bold mt-1" style={{ color: "var(--text)" }}>
                {picked.restaurant.name} · {picked.location.name}
              </div>
            </div>
            <Label>ID / IP de la terminal</Label>
            <Input
              value={terminalId}
              onChange={(e) => setTerminalId(e.target.value)}
              placeholder="Ej. 192.168.1.45 o TERM-001"
              autoFocus
            />
            <PrimaryButton onClick={finishSetup}>
              {terminalId.trim() ? "Guardar y vincular" : "Vincular sin terminal"}
            </PrimaryButton>
            <button
              onClick={() => setStep("pick")}
              className="mt-3 text-sm"
              style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}
            >
              ← Cambiar sucursal
            </button>
          </>
        )}

        {step === "saving" && (
          <div className="text-center py-10">
            <H1>Guardando…</H1>
          </div>
        )}
      </Card>
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 overflow-auto flex items-center justify-center p-6"
      style={{ background: "var(--bg)" }}
    >
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <h1 className="text-4xl font-black tracking-tighter" style={{ color: ACCENT }}>
            MRTPVREST
          </h1>
          <p className="text-xs mt-1 font-medium uppercase tracking-widest" style={{ color: "var(--muted)" }}>
            Configuración de dispositivo
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <div style={cardStyle}>{children}</div>;
}

function Title({ children }: { children: ReactNode }) {
  return <h1 style={titleStyle}>{children}</h1>;
}

function Subtitle({ children }: { children: ReactNode }) {
  return <p style={subtitleStyle}>{children}</p>;
}

function Label({ children }: { children: ReactNode }) {
  return <label style={labelStyle}>{children}</label>;
}

function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={inputStyle} />;
}

function ErrorBox({ children }: { children: ReactNode }) {
  return <div style={errorStyle}>{children}</div>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoRowStyle}>
      <div style={labelStyle}>{label}</div>
      <div style={infoValueStyle}>{value}</div>
    </div>
  );
}

function PrimaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} style={primaryButtonStyle} />;
}

function SecondaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} style={secondaryButtonStyle} />;
}

const shellStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background:
    "radial-gradient(circle at top, rgba(255,92,53,0.14), transparent 38%), var(--bg)",
};

const cardStyle: CSSProperties = {
  width: "100%",
  maxWidth: 560,
  background: "var(--surf)",
  border: "1px solid var(--border)",
  borderRadius: 28,
  padding: 32,
  boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 30,
  fontWeight: 900,
  color: "var(--text)",
};

const subtitleStyle: CSSProperties = {
  marginTop: 10,
  marginBottom: 24,
  color: "var(--muted)",
  lineHeight: 1.6,
  fontSize: 14,
};

const labelStyle: CSSProperties = {
  display: "block",
  marginTop: 14,
  marginBottom: 8,
  color: "var(--muted)",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 16,
  border: "1px solid var(--border)",
  background: "var(--surf2)",
  color: "var(--text)",
  outline: "none",
};

const errorStyle: CSSProperties = {
  marginTop: 14,
  borderRadius: 14,
  padding: "12px 14px",
  background: "rgba(239,68,68,0.1)",
  border: "1px solid rgba(239,68,68,0.25)",
  color: "#ef4444",
  fontSize: 13,
  fontWeight: 700,
};

const infoRowStyle: CSSProperties = {
  borderRadius: 16,
  padding: "14px 16px",
  background: "var(--surf2)",
  border: "1px solid var(--border)",
  marginBottom: 12,
};

const infoValueStyle: CSSProperties = {
  color: "var(--text)",
  fontSize: 16,
  fontWeight: 700,
};

const primaryButtonStyle: CSSProperties = {
  width: "100%",
  marginTop: 24,
  padding: "14px 16px",
  border: "none",
  borderRadius: 16,
  background: ACCENT,
  color: "#fff",
  fontSize: 15,
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  width: "100%",
  marginTop: 12,
  padding: "14px 16px",
  borderRadius: 16,
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--muted)",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
};

const pickButtonStyle: CSSProperties = {
  all: "unset",
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  cursor: "pointer",
  borderRadius: 18,
  padding: 18,
  background: "var(--surf2)",
  border: "1px solid var(--border)",
};

const mutedCardStyle: CSSProperties = {
  borderRadius: 18,
  padding: 18,
  background: "var(--surf2)",
  border: "1px solid var(--border)",
  color: "var(--muted)",
  fontSize: 14,
};

const pickTitleStyle: CSSProperties = {
  color: "var(--text)",
  fontSize: 18,
  fontWeight: 800,
};

const pickMetaStyle: CSSProperties = {
  marginTop: 6,
  color: "var(--muted)",
  fontSize: 13,
};
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-3xl border p-8 shadow-2xl"
      style={{ background: "var(--surf)", borderColor: "var(--border)" }}
    >
      {children}
    </div>
  );
}

function H1({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-2xl font-black tracking-tight" style={{ color: "var(--text)" }}>
      {children}
    </h1>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="block text-[11px] font-semibold uppercase tracking-widest mt-4 mb-1.5"
      style={{ color: "var(--muted)" }}
    >
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-xl text-base outline-none"
      style={{
        padding: "13px 15px",
        background: "var(--surf2, var(--bg))",
        color: "var(--text)",
        border: "1px solid var(--border2, var(--border))",
      }}
    />
  );
}

function PrimaryButton({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className="w-full mt-6 py-4 rounded-2xl font-black uppercase text-base"
      style={{
        background: ACCENT,
        color: "#000",
        border: "none",
        cursor: rest.disabled ? "not-allowed" : "pointer",
        opacity: rest.disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}
