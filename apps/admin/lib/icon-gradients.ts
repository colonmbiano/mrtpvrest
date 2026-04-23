export const ICON_GRADIENTS = {
  sales: "linear-gradient(135deg, #f97316, #ef4444)",
  orders: "linear-gradient(135deg, #8b5cf6, #6366f1)",
  inventory: "linear-gradient(135deg, #10b981, #059669)",
  employees: "linear-gradient(135deg, #38bdf8, #0ea5e9)",
  delivery: "linear-gradient(135deg, #fbbf24, #f97316)",
  settings: "linear-gradient(135deg, #94a3b8, #64748b)",
  money: "linear-gradient(135deg, #84cc16, #22c55e)",
  warning: "linear-gradient(135deg, #f43f5e, #ec4899)",
} as const;

export type IconGradientKey = keyof typeof ICON_GRADIENTS;
