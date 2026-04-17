"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { makeAuthApi } from "@/lib/auth-api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.mrtpvrest.com";

type Location = { id: string; name: string; address: string | null };
type Restaurant = {
  id: string; name: string; slug: string;
  accentColor: string | null;
  kioskStyle: "oled" | "pop" | "boutique" | null;
  locations: Location[];
};

export default function SetupPage() {
  const router = useRouter();

  const [alreadyLinked, setAlreadyLinked] = useState<null | {
    restaurantName: string;
    locationName: string;
    terminalId: string | null;
  }>(null);

  const [step, setStep] = useState<"login" | "pick" | "terminal" | "saving">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [picked, setPicked] = useState<{ restaurant: Restaurant; location: Location } | null>(null);

  const [terminalId, setTerminalId] = useState("");

  useEffect(() => {
    const rid = localStorage.getItem("kiosk-restaurant-id");
    if (rid) {
      setAlreadyLinked({
        restaurantName: localStorage.getItem("kiosk-restaurant-name") || "",
        locationName:   localStorage.getItem("kiosk-location-name")   || "",
        terminalId:     localStorage.getItem("kiosk-terminal-id"),
      });
      setTerminalId(localStorage.getItem("kiosk-terminal-id") || "");
    }
  }, []);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data } = await axios.post(`${API_URL}/api/auth/login`, { email, password });
      const accessToken = data.accessToken;
      const authed = makeAuthApi(accessToken);
      const me = await authed.get("/api/tenant/me");
      const rs: Restaurant[] = me.data.restaurants || [];
      if (rs.length === 0) throw new Error("Este usuario no tiene restaurantes");
      // If restaurants don't yet include locations (backend not updated), fetch separately
      const needLocations = rs.some(r => !Array.isArray((r as any).locations));
      if (needLocations) {
        await Promise.all(rs.map(async (r) => {
          try {
            const locs = await authed.get(`/api/tenant/restaurants/${r.id}/locations`);
            (r as any).locations = locs.data || [];
          } catch {
            (r as any).locations = [];
          }
        }));
      }
      setRestaurants(rs);
      setStep("pick");
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  function pickLocation(restaurant: Restaurant, location: Location) {
    setPicked({ restaurant, location });
    setStep("terminal");
  }

  async function finishSetup() {
    if (!picked) return;
    setStep("saving");
    const { restaurant, location } = picked;

    localStorage.setItem("kiosk-restaurant-id",   restaurant.id);
    localStorage.setItem("kiosk-restaurant-name", restaurant.name);
    localStorage.setItem("kiosk-location-id",     location.id);
    localStorage.setItem("kiosk-location-name",   location.name);
    if (terminalId.trim()) {
      localStorage.setItem("kiosk-terminal-id", terminalId.trim());
    } else {
      localStorage.removeItem("kiosk-terminal-id");
    }
    if (restaurant.accentColor) localStorage.setItem("mb-accent", restaurant.accentColor);
    localStorage.setItem("kiosk-style", restaurant.kioskStyle || "oled");

    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    document.cookie = "mb-role=; path=/; max-age=0; SameSite=Lax";

    router.replace("/");
  }

  function unlink() {
    if (!confirm("¿Desvincular este kiosko? Tendrás que iniciar sesión otra vez.")) return;
    ["kiosk-restaurant-id","kiosk-restaurant-name","kiosk-location-id","kiosk-location-name","kiosk-terminal-id","mb-accent","kiosk-style"]
      .forEach(k => localStorage.removeItem(k));
    setAlreadyLinked(null);
    setStep("login");
  }

  function saveTerminalOnly() {
    const v = terminalId.trim();
    if (v) localStorage.setItem("kiosk-terminal-id", v);
    else localStorage.removeItem("kiosk-terminal-id");
    router.replace("/");
  }

  if (alreadyLinked && step === "login") {
    return (
      <Page>
        <Card>
          <H1>Dispositivo vinculado</H1>
          <p style={{ color: "var(--muted)", marginTop: 8 }}>
            <b>{alreadyLinked.restaurantName}</b> — {alreadyLinked.locationName}
          </p>

          <Label>Terminal de pagos</Label>
          <Input
            value={terminalId}
            onChange={(e) => setTerminalId(e.target.value)}
            placeholder="Ej. 192.168.1.45 o TERM-001"
          />
          <PrimaryButton onClick={saveTerminalOnly}>Guardar terminal</PrimaryButton>

          <div style={{ marginTop: 32, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
            <button
              onClick={unlink}
              style={{ color: "#ef4444", background: "none", border: "none", fontSize: 14, cursor: "pointer" }}
            >
              Desvincular kiosko
            </button>
          </div>
        </Card>
      </Page>
    );
  }

  return (
    <Page>
      <Card>
        {step === "login" && (
          <form onSubmit={login}>
            <H1>Vincular kiosko</H1>
            <p style={{ color: "var(--muted)", marginTop: 8, marginBottom: 24 }}>
              Inicia sesión como administrador para asignar este dispositivo.
            </p>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Label>Contraseña</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            {error && <div style={{ color: "#ef4444", fontSize: 14, marginTop: 8 }}>{error}</div>}
            <PrimaryButton disabled={loading} type="submit">
              {loading ? "Entrando…" : "Entrar"}
            </PrimaryButton>
          </form>
        )}

        {step === "pick" && (
          <>
            <H1>Elige la sucursal</H1>
            <p style={{ color: "var(--muted)", marginTop: 8, marginBottom: 24 }}>
              ¿En qué sucursal está físicamente este kiosko?
            </p>
            {restaurants.map((r) =>
              (r.locations || []).length === 0 ? (
                <div key={r.id} style={{ marginBottom: 16, color: "var(--muted)" }}>
                  {r.name}: sin sucursales activas
                </div>
              ) : (
                r.locations.map((loc) => (
                  <button
                    key={loc.id}
                    onClick={() => pickLocation(r, loc)}
                    style={{
                      all: "unset", cursor: "pointer",
                      display: "block", width: "100%",
                      padding: 20, marginBottom: 12,
                      background: "var(--surf2)", border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    <div style={{ fontSize: 20, fontWeight: 800 }}>{loc.name}</div>
                    <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
                      {r.name} · {loc.address || "sin dirección"}
                    </div>
                  </button>
                ))
              )
            )}
          </>
        )}

        {step === "terminal" && picked && (
          <>
            <H1>Terminal de pagos</H1>
            <p style={{ color: "var(--muted)", marginTop: 8, marginBottom: 24 }}>
              Introduce el ID o IP de la terminal física asignada a este kiosko. Es opcional — si lo dejas vacío, los pagos con tarjeta quedarán deshabilitados.
            </p>
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
              style={{ marginTop: 12, background: "none", border: "none", color: "var(--muted)", fontSize: 14, cursor: "pointer" }}
            >
              ← Cambiar sucursal
            </button>
          </>
        )}

        {step === "saving" && (
          <div style={{ textAlign: "center", padding: 40 }}>
            <H1>Guardando…</H1>
          </div>
        )}
      </Card>
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center", padding: 40, background: "var(--bg)" }}>
      {children}
    </div>
  );
}
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ width: "100%", maxWidth: 520, background: "var(--surf)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 32 }}>
      {children}
    </div>
  );
}
function H1({ children }: { children: React.ReactNode }) {
  return <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, fontFamily: "var(--font-display)" }}>{children}</h1>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display: "block", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", marginTop: 16, marginBottom: 6 }}>{children}</label>;
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        width: "100%", padding: "14px 16px", fontSize: 16,
        background: "var(--surf2)", color: "var(--text)",
        border: "1px solid var(--border2)", borderRadius: "var(--radius-md)",
        outline: "none",
      }}
    />
  );
}
function PrimaryButton({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      style={{
        width: "100%", marginTop: 24, padding: "16px 24px",
        background: "var(--brand-primary)", color: "var(--bg)",
        border: "none", borderRadius: "var(--radius-md)",
        fontSize: 18, fontWeight: 800, cursor: "pointer",
        opacity: rest.disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}
