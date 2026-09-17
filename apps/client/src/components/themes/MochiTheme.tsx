'use client';

import { BoutiqueTheme, type BoutiqueThemeProps } from './BoutiqueThemeCore';

// Tema pastel genérico. Su selección y su identidad quedan aisladas del tema
// especializado para bebidas.
export function MochiTheme(props: BoutiqueThemeProps) {
  return <BoutiqueTheme {...props} variant="mochi" />;
}
