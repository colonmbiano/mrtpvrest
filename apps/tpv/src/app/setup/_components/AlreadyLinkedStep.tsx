import { Check, Sparkles } from "lucide-react";
import { Heading, PrimaryButton } from "./primitives";

type Props = {
  restaurantName: string;
  locationName: string;
  onGoToTPV: () => void;
  onChangeAppearance: () => void;
  onUnlink: () => void;
};

export default function AlreadyLinkedStep({
  restaurantName,
  locationName,
  onGoToTPV,
  onChangeAppearance,
  onUnlink,
}: Props) {
  return (
    <>
      <Heading icon={<Check />}>Dispositivo vinculado</Heading>
      <p className="mt-1 mb-6 text-sm" style={{ color: "var(--text-secondary)" }}>
        <b style={{ color: "var(--text-primary)" }}>{restaurantName}</b>
        {" — "}
        {locationName}
      </p>

      <PrimaryButton onClick={onGoToTPV}>Ir al TPV</PrimaryButton>

      <button
        onClick={onChangeAppearance}
        className="w-full mt-3 py-3 rounded-2xl text-sm font-bold transition-colors"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          color: "var(--text-secondary)",
          cursor: "pointer",
        }}
      >
        <span className="inline-flex items-center gap-2">
          <Sparkles size={14} /> Cambiar apariencia
        </span>
      </button>

      <button
        onClick={onUnlink}
        className="w-full mt-3 py-3 rounded-2xl text-sm font-bold transition-colors"
        style={{
          background: "var(--danger-soft)",
          border: "1px solid var(--danger)",
          color: "var(--danger)",
          cursor: "pointer",
        }}
      >
        Desvincular y re-configurar
      </button>
    </>
  );
}
