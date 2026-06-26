// Índice de guías (posts) de MODA+ para el hub /moda/guias y el sitemap.
// Las páginas de cada guía viven en /moda/<slug> (standalone); este índice solo
// las lista. Mantener el title/excerpt en sync con cada página.
export type ModaGuide = { slug: string; title: string; excerpt: string }

export const modaGuides: ModaGuide[] = [
  {
    slug: 'cuanto-cuesta-un-punto-de-venta-para-tienda-de-ropa',
    title: '¿Cuánto cuesta un punto de venta para tienda de ropa?',
    excerpt: 'Qué se paga en software, equipo y etiquetas, y cómo bajar el costo inicial.',
  },
  {
    slug: 'como-controlar-inventario-de-una-tienda-de-ropa',
    title: 'Cómo controlar el inventario de una tienda de ropa',
    excerpt: 'Organiza por talla y color, usa código de barras y define mínimos de reposición.',
  },
  {
    slug: 'como-hacer-corte-de-caja-en-tu-tienda-de-ropa',
    title: 'Cómo hacer el corte de caja en tu tienda de ropa',
    excerpt: 'Abre turno con fondo, registra entradas y salidas, y cierra con esperado vs. contado.',
  },
  {
    slug: 'etiquetas-con-codigo-de-barras-para-ropa',
    title: 'Etiquetas con código de barras para ropa: guía práctica',
    excerpt: 'Qué necesitas para etiquetar y cobrar escaneando, sin teclear precios.',
  },
  {
    slug: 'como-abrir-una-tienda-de-ropa',
    title: 'Cómo abrir una tienda de ropa: guía y checklist',
    excerpt: 'Del nicho al inventario y el punto de venta: los pasos para abrir tu tienda de ropa.',
  },
]
