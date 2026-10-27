// La red requiere activación explícita; ser repartidor de la tienda no la habilita.
export function marketplaceNetworkEnabled(flag: unknown): boolean {
  return flag === 'true';
}
