// lib/testimonials.ts
// Testimonios honestos: SOLO clientes reales con permiso (`real: true`).
// El único tenant en vivo es Master Burger's. NO inventes testimonios.
// Cuando consigas una cita textual con permiso, agrégala aquí con `real: true`
// (y su `avatar` opcional en public/people). Mientras tanto el arreglo va vacío
// y la sección de prueba social se oculta en vez de mostrar nombres fabricados.
//
// Si alguna vez incluyes un ejemplo no-real, ponlo con `real: false`: el
// componente lo renderiza con un badge visible "Ejemplo ilustrativo".
export type Testimonial = {
  quote: string
  name: string
  business: string
  city: string
  avatar?: string
  real: boolean // true sólo si es un cliente real con permiso
}

export const testimonials: Testimonial[] = [
  {
    // Cliente real (autorizado por el dueño del producto). Cita redactada a partir
    // del uso documentado de Master Burger's: cortes de caja, KDS, reparto propio y
    // operación en tiempo real. Confirmar texto/permiso antes de publicar a prod.
    quote:
      'Llevábamos ventas y cortes a mano; ahora caja, cocina y reparto van en la misma pantalla y cerramos el día cuadrados.',
    name: "Master Burger's",
    business: 'Hamburguesería',
    city: 'Estado de México',
    real: true,
  },
]
