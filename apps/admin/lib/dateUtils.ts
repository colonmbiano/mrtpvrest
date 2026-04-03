export function timeAgo(date: string): string {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Ayer";
  return `Hace ${diff} días`;
}

export function formatDate(date: string, options?: Intl.DateTimeFormatOptions): string {
  return new Date(date).toLocaleDateString("es-MX", options ?? {
    day: "numeric", month: "short", year: "numeric",
  });
}

export function formatDateTime(date: string): string {
  return new Date(date).toLocaleDateString("es-MX", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
