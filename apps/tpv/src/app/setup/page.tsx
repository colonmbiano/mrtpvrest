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
    localStorage.setItem("restaurantId", restaurant.id);
    localStorage.setItem("restaurantName", restaurant.name);
    localStorage.setItem("locationId", location.id);
    localStorage.setItem("locationName", location.name);

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
