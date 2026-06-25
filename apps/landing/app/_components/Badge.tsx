import type { ReactNode } from 'react'

// Etiqueta pequeña para marcar contenido (p.ej. un testimonio de ejemplo
// no verificado como "Ejemplo ilustrativo").
export function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>
}
