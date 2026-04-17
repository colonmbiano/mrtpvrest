"use client";
import { useRouter } from "next/navigation";
import { SetupGuard } from "@/components/SetupGuard";
import { IconDineIn, IconTakeout } from "@/components/Icon";

export default function OrderTypePage() {
  return <SetupGuard><Inner /></SetupGuard>;
}

function Inner() {
  const router = useRouter();
  function pick(t: "dine_in" | "takeout") {
    router.push(`/menu?t=${t}`);
  }

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", padding: 32, gap: 24, background: "var(--bg)" }}>
      <div style={{ textAlign: "center", marginTop: 20 }}>
        <div style={{ fontSize: 36, fontWeight: 900, fontFamily: "var(--font-display)" }}>
          ¿Cómo prefieres tu orden?
        </div>
        <div style={{ fontSize: 16, color: "var(--muted)", marginTop: 8 }}>
          Toca una opción para continuar
        </div>
      </div>

      <div style={{ flex: 1, display: "grid", gridTemplateRows: "1fr 1fr", gap: 20 }}>
        <Choice icon={<IconDineIn size={96} />} title="Comer aquí" hint="DINE_IN · te preguntamos mesa" onClick={() => pick("dine_in")} />
        <Choice icon={<IconTakeout size={96} />} title="Para llevar" hint="TAKEOUT · solo tu nombre" onClick={() => pick("takeout")} />
      </div>

      <button
        onClick={() => router.replace("/")}
        style={{ alignSelf: "center", background: "none", border: "none", color: "var(--muted)", fontSize: 14, cursor: "pointer", marginBottom: 8 }}
      >
        ← Cancelar
      </button>
    </div>
  );
}

function Choice({ icon, title, hint, onClick }: { icon: React.ReactNode; title: string; hint: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        all: "unset", cursor: "pointer",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16,
        border: "3px solid var(--brand-primary)", borderRadius: "var(--radius-lg)",
        background: "var(--surf)", color: "var(--text)",
      }}
    >
      <div style={{ color: "var(--brand-primary)" }}>{icon}</div>
      <div style={{ fontSize: 40, fontWeight: 900, fontFamily: "var(--font-display)" }}>{title}</div>
      <div style={{ fontSize: 14, color: "var(--muted)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: ".1em" }}>{hint}</div>
    </button>
  );
}
