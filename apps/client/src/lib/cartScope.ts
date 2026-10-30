// Alcance mono-tienda del carrito. Un carrito pertenece a UNA tienda: si la página
// de otra tienda se vincula, las líneas de la anterior se descartan. Módulo puro
// (sin dependencias) para poder probarlo con Node.
const SLUG_RE = /^[a-z0-9-]{1,100}$/;

export type CartScopeDecision = {
  storeSlug: string;
  // true solo cuando el carrito estaba vinculado a OTRA tienda: sus líneas se descartan.
  clearLines: boolean;
};

export function bindCartToStore(current: string | null, next: string): CartScopeDecision {
  if (typeof next !== 'string' || !SLUG_RE.test(next)) throw new Error('Slug de tienda invalido');
  return { storeSlug: next, clearLines: current !== null && current !== next };
}
