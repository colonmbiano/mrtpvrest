'use client';

import { BoutiqueTheme, type BoutiqueThemeProps } from './BoutiqueThemeCore';

// Tema especializado para bebidas, cafeterías y postres. Comparte únicamente
// el motor estable de tienda (carrito, checkout y autenticación) con Mochi;
// su identidad visual y su ruta de selección son independientes.
export function BeverageTheme(props: BoutiqueThemeProps) {
  return <BoutiqueTheme {...props} variant="beverage" />;
}
