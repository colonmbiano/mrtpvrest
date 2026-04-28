import { ArrowLeft } from "lucide-react";
import type { Restaurant, Location } from "../_lib/types";
import { Heading } from "./primitives";

type Props = {
  restaurants: Restaurant[];
  onPick: (r: Restaurant, loc: Location) => void;
  onBack: () => void;
};

export default function PickStep({ restaurants, onPick, onBack }: Props) {
  return (
    <>
      <Heading>Elige la sucursal</Heading>
      <p className="mt-1 mb-6 text-sm" style={{ color: "var(--text-secondary)" }}>
        ¿En qué sucursal está físicamente este TPV?
      </p>
      <div className="flex flex-col gap-2">
        {restaurants.map((r) =>
          (r.locations || []).length === 0 ? (
            <div key={r.id} className="text-sm" style={{ color: "var(--text-muted)" }}>
              {r.name}: sin sucursales activas
            </div>
          ) : (
            r.locations.map((loc) => (
              <button
                key={loc.id}
                onClick={() => onPick(r, loc)}
                className="w-full text-left p-4 rounded-2xl transition-all hover:brightness-110"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  cursor: "pointer",
                }}
              >
                <div className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
                  {loc.name}
                </div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {r.name} · {loc.address || "sin dirección"}
                </div>
              </button>
            ))
          ),
        )}
      </div>
      <button
        onClick={onBack}
        className="mt-4 text-sm inline-flex items-center gap-1.5"
        style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
      >
        <ArrowLeft size={14} /> Volver
      </button>
    </>
  );
}
