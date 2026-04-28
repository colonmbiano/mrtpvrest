export const EMPLOYEE_TOKEN_KEY = "tpv-employee-token";
export const EMPLOYEE_DATA_KEY = "tpv-employee";

export const STATIONS = [
  { value: "KITCHEN", label: "🍳 COCINA",   color: "#ef4444" },
  { value: "BAR",     label: "🍹 BARRA",    color: "#3b82f6" },
  { value: "FRYER",   label: "🍟 FREIDORA", color: "#f97316" },
] as const;

export type Station = (typeof STATIONS)[number];

export const ORDER_TYPES: Record<string, string> = {
  DELIVERY: "🛵",
  DINE_IN: "🪑",
  TAKEOUT: "🥡",
};

export const QUICK_MESSAGES = [
  "Falta ingrediente",
  "Platillo agotado",
  "Orden va a tardar",
  "Error en la orden",
  "Necesito confirmación",
  "Pedido listo pronto",
];

export type Urgency = { color: string; label: string; bg: string };

export function getUrgency(mins: number): Urgency {
  if (mins >= 15) return { color: "#ef4444", label: "URGENTE",  bg: "rgba(239,68,68,0.18)" };
  if (mins >= 8)  return { color: "#f59e0b", label: "DEMORADO", bg: "rgba(245,158,11,0.15)" };
  return            { color: "#22c55e", label: "OK",       bg: "rgba(34,197,94,0.10)" };
}

export function playKDSAlert() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch {}
}
