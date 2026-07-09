export const DAYS = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
];

export const LINK_TYPES = [
  { value: "NONE", label: "Sin enlace" },
  { value: "CATEGORY", label: "Ir a categoría" },
  { value: "ITEM", label: "Ir a producto" },
  { value: "URL", label: "URL externa" },
];

export const emptyForm = {
  title: "",
  description: "",
  imageUrl: "",
  linkType: "NONE",
  linkValue: "",
  isActive: false,
  scheduleDays: [] as number[],
  scheduleStart: "",
  scheduleEnd: "",
  dateFrom: "",
  dateTo: "",
};

export type BannerForm = typeof emptyForm;

export type Banner = {
  id: string;
  title?: string;
  description?: string;
  imageUrl: string;
  linkType?: string;
  linkValue?: string;
  isActive: boolean;
  scheduleDays?: string;
  scheduleStart?: string;
  scheduleEnd?: string;
  dateFrom?: string;
  dateTo?: string;
};
export type Cat = { id: string; name: string };
export type Item = { id: string; name: string };

export function scheduleLabel(banner: Banner) {
  const parts: string[] = [];
  try {
    const days: number[] = JSON.parse(banner.scheduleDays || "[]");
    if (days.length > 0) parts.push(days.map((d) => DAYS[d]?.label ?? "").filter(Boolean).join(", "));
  } catch {
    /* noop */
  }
  if (banner.scheduleStart && banner.scheduleEnd) parts.push(`${banner.scheduleStart} - ${banner.scheduleEnd}`);
  if (banner.dateFrom || banner.dateTo) {
    const from = banner.dateFrom
      ? new Date(banner.dateFrom).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" })
      : "...";
    const to = banner.dateTo
      ? new Date(banner.dateTo).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" })
      : "...";
    parts.push(`${from} → ${to}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "Sin programación";
}
