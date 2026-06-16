"use client";
import { useAuthStore } from "@/store/authStore";

interface UserBadgeProps {
  /** Si `true`, muestra avatar + nombre + rol. Si `false`, solo avatar. */
  expanded?: boolean;
  className?: string;
}

/**
 * Pill compacta con el empleado activo. Pensada para layouts globales
 * (Panel Operación, Configuración, etc.) donde el cajero debe poder
 * confirmar siempre quién está logueado sin volver a la pantalla de orden.
 *
 * No interactúa: solo muestra. El logout/cambio se sigue haciendo desde
 * los menús específicos (avatar de /pos/menu, dropdown del admin layout).
 */
export default function UserBadge({ expanded = true, className = "" }: UserBadgeProps) {
  const employee = useAuthStore((s) => s.employee);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated || !employee) return null;

  const initial = employee.name?.charAt(0).toUpperCase() || "—";

  return (
    <div
      className={`inline-flex items-center gap-2 bg-white/5 border border-white/10 backdrop-blur-md px-2 py-1.5 rounded-full ${className}`}
    >
      <div
        className="w-7 h-7 rounded-full bg-[var(--brand)] text-[var(--brand-fg)] text-[11px] flex items-center justify-center font-black shrink-0"
        aria-hidden
      >
        {initial}
      </div>
      {expanded && (
        <div className="flex flex-col leading-tight pr-2 min-w-0">
          <span className="text-[11px] font-black text-white truncate max-w-[160px]">
            {employee.name}
          </span>
          <span className="text-[9px] font-black tracking-[0.2em] text-[var(--brand)] uppercase">
            {employee.role}
          </span>
        </div>
      )}
    </div>
  );
}
