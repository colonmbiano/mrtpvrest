"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";

interface BackButtonProps {
  /** Override del comportamiento por defecto (router.back). */
  onClick?: () => void;
  /** Etiqueta accesible (default: "Atrás"). */
  ariaLabel?: string;
  /** Clase extra para layout específico del header. */
  className?: string;
  /** Tamaño táctil del botón. Default 44px (cumple guías Apple/Google). */
  size?: number;
}

/**
 * BackButton — botón circular reutilizable para cabeceras y modales.
 *
 * Estilo HALO/diseño operativo: bg white/5, backdrop-blur, borde sutil,
 * active:scale-95. Usa router.back() de Next.js para preservar el
 * estado de la navegación (filtros, scroll, memoria de la sesión).
 */
export default function BackButton({
  onClick,
  ariaLabel = "Atrás",
  className = "",
  size = 44,
}: BackButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }
    router.back();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={ariaLabel}
      style={{ width: size, height: size, minHeight: size, minWidth: size }}
      className={`
        rounded-full flex items-center justify-center
        bg-white/5 backdrop-blur-md border border-white/10
        active:scale-95 transition-transform duration-150
        text-white/85 hover:text-white
        ${className}
      `.trim()}
    >
      <ChevronLeft size={Math.round(size * 0.45)} strokeWidth={2.5} />
    </button>
  );
}
