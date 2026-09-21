export type BlockType = "TITLE" | "ORDER_INFO" | "ITEMS" | "DIVIDER" | "TEXT" | "FOOTER";
export interface TicketBlock {
  id: string;
  type: BlockType;
  showTable?: boolean;
  showCustomer?: boolean;
  showStation?: boolean;
  showOrderNumber?: boolean;
  showTime?: boolean;
  showType?: boolean;
  showModifiers?: boolean;
  showNotes?: boolean;
  groupBySeat?: boolean;
  text?: string;
  char?: string;
  size?: "normal" | "large" | "xlarge";
  weight?: "light" | "normal" | "bold";
}

export function parseKitchenLayout(json: string | undefined): TicketBlock[] {
  try {
    const parsed: unknown = JSON.parse(json || "[]");
    if (!Array.isArray(parsed)) return [];
    const types = ["TITLE", "ORDER_INFO", "ITEMS", "DIVIDER", "TEXT", "FOOTER"];
    if (!parsed.every((b) => b && typeof b === "object" && types.includes(b.type) &&
      (b.text === undefined || typeof b.text === "string") &&
      (b.char === undefined || typeof b.char === "string"))) return [];
    return parsed.map((b, i) => ({ ...b, id: typeof b.id === "string" ? b.id : `block-${i}` }));
  } catch {
    return [];
  }
}

export function legacyKitchenLayout(cfg: {
  showTableNumber?: boolean; showCustomerName?: boolean; ticketNameSize?: string;
  showOrderNumber?: boolean; showTime?: boolean; showOrderType?: boolean;
  showModifiers?: boolean; showNotes?: boolean; groupBySeat?: boolean;
  fontSize?: string; lineWeight?: string;
} = {}): TicketBlock[] {
  const size = (value?: string): TicketBlock["size"] =>
    value === "normal" || value === "xlarge" ? value : "large";
  return [
    { id: "def-1", type: "TITLE", showTable: cfg.showTableNumber ?? true,
      showCustomer: cfg.showCustomerName ?? true, showStation: true, size: size(cfg.ticketNameSize) },
    { id: "def-2", type: "ORDER_INFO", showOrderNumber: cfg.showOrderNumber ?? true,
      showTime: cfg.showTime ?? true, showType: cfg.showOrderType ?? true },
    { id: "def-3", type: "DIVIDER", char: "=" },
    { id: "def-4", type: "ITEMS", showModifiers: cfg.showModifiers ?? true,
      showNotes: cfg.showNotes ?? true, groupBySeat: cfg.groupBySeat ?? true,
      size: size(cfg.fontSize), weight: cfg.lineWeight === "light" ? "light" : cfg.lineWeight === "normal" ? "normal" : "bold" },
    { id: "def-5", type: "DIVIDER", char: "=" },
    { id: "def-6", type: "FOOTER" },
  ];
}
