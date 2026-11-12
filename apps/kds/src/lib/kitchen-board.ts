export function boardColumns(width: number, size: 'compact' | 'normal' | 'large') {
  const minimum = size === 'compact' ? 215 : size === 'large' ? 390 : 280;
  return Math.max(1, Math.min(6, Math.floor((width + 10) / (minimum + 10))));
}

// Mantener el primer pedido visible cuando entran o salen otros pedidos.
export function boardRange(ids: string[], anchor: { id: string; index: number } | null, columns: number) {
  const found = anchor ? ids.indexOf(anchor.id) : -1;
  const start = Math.min(Math.max(0, found >= 0 ? found : anchor?.index || 0), Math.max(0, ids.length - 1));
  return { start, end: Math.min(ids.length, start + Math.max(1, columns)) };
}
