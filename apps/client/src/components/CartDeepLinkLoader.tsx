'use client';

// Rehidrata el carrito desde `?cart=` al cargar la tienda (deep-link compartible).
// Se monta una sola vez (desde page.tsx) con el menú vigente; corre en cliente,
// suma al carrito lo que traiga el link y limpia el parámetro de la URL.
import { useEffect } from 'react';
import { useCart } from '../lib/cartStore';
import { hydrateCartFromUrl } from '../lib/cartLink';
import type { StoreProduct } from './ProductModal';

export default function CartDeepLinkLoader({ products }: { products: StoreProduct[] }) {
  const add = useCart((s) => s.add);
  useEffect(() => {
    hydrateCartFromUrl(products || [], add);
    // Solo al montar: hydrateCartFromUrl ya quita el parámetro para no repetir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
