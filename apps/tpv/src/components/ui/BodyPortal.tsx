"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const noopSubscribe = () => () => {};

/**
 * Renderiza a sus hijos directamente en <body>.
 *
 * Úsalo para modales/hojas `fixed inset-0` que se montan dentro de un
 * contenedor con su propio stacking context (un flex/grid item con z-index,
 * o un ancestro con transform / filter / backdrop-filter). Sin portal, su
 * z-index solo compite DENTRO de ese contenedor: el modal queda debajo de
 * paneles hermanos con más z (p. ej. el ticket lateral z-20 del POS) o de
 * elementos globales (OfflineIndicator z-[60], FAB móvil z-50).
 *
 * El árbol de React (stores, contextos, eventos sintéticos) no cambia; solo
 * el lugar del DOM. En el render del servidor no pinta nada.
 */
export default function BodyPortal({ children }: { children: ReactNode }) {
  const isClient = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  if (!isClient) return null;
  return createPortal(children, document.body);
}
