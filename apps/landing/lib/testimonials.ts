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
  // Plantilla para el testimonio real de Master Burger's (rellenar con cita textual
  // y nombre reales del dueño antes de activar, y descomentar):
  // {
  //   quote: '…',
  //   name: '…',
  //   business: "Master Burger's",
  //   city: 'Estado de México',
  //   avatar: '/people/master-burguers.png',
  //   real: true,
  // },
]
