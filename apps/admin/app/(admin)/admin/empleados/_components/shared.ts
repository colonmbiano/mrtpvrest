import {
  Crown, Banknote, ChefHat, Bike, Soup, Tag, Trash2, Unlock, Clock,
  Users, Eye, ShieldCheck, Gem, type LucideIcon,
} from "lucide-react";
import type { Tone } from "@/components/ds";

// Fecha de hoy en hora de México (YYYY-MM-DD), no en la zona del navegador.
export function mxToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
}

export const PAY_LABELS: Record<string, string> = {
  CASH: "Efectivo", CARD: "Tarjeta", TRANSFER: "Transferencia",
  CASH_ON_DELIVERY: "Efectivo", MP: "Mercado Pago", OTHER: "Otro",
};

export const ROLES: { value: string; label: string; short: string; icon: LucideIcon; tone: Tone }[] = [
  { value: "OWNER",    label: "Dueño",         short: "Dueño",      icon: Gem,        tone: "ac"   },
  { value: "ADMIN",    label: "Administrador", short: "Admin",       icon: Crown,   tone: "warn" },
  { value: "MANAGER",  label: "Encargado",     short: "Encargado",  icon: ShieldCheck, tone: "warn" },
  { value: "CASHIER",  label: "Cajero",        short: "Cajero",      icon: Banknote, tone: "ok"  },
  { value: "WAITER",   label: "Mesero",        short: "Mesero",      icon: Soup,    tone: "info" },
  { value: "DELIVERY", label: "Repartidor",    short: "Repartidor",  icon: Bike,    tone: "ac"   },
  { value: "COOK",     label: "Cocinero",      short: "Cocinero",    icon: ChefHat, tone: "err"  },
];

// Set canónico de permisos operativos (RBAC real · Fase 10). Alineado con
// ROLE_DEFAULTS del backend (employees.routes.js). Solo incluye permisos con
// enforcement real; las columnas legacy sin operación quedan deprecadas.
export const ROLE_DEFAULTS: Record<string, Record<string, boolean>> = {
  OWNER:    { canCharge: true,  canApplyDiscounts: true,  canCancelItems: true,  canReopenTables: true,  canManageUsers: true,  canManageDriverCash: true,  canViewExpectedCash: true,  canManageShifts: true  },
  ADMIN:    { canCharge: true,  canApplyDiscounts: true,  canCancelItems: true,  canReopenTables: true,  canManageUsers: true,  canManageDriverCash: true,  canViewExpectedCash: true,  canManageShifts: true  },
  MANAGER:  { canCharge: true,  canApplyDiscounts: true,  canCancelItems: true,  canReopenTables: true,  canManageUsers: true,  canManageDriverCash: true,  canViewExpectedCash: true,  canManageShifts: true  },
  CASHIER:  { canCharge: true,  canApplyDiscounts: true,  canCancelItems: false, canReopenTables: false, canManageUsers: false, canManageDriverCash: false, canViewExpectedCash: false, canManageShifts: true  },
  WAITER:   { canCharge: false, canApplyDiscounts: false, canCancelItems: false, canReopenTables: false, canManageUsers: false, canManageDriverCash: false, canViewExpectedCash: false, canManageShifts: false },
  DELIVERY: { canCharge: true,  canApplyDiscounts: false, canCancelItems: false, canReopenTables: false, canManageUsers: false, canManageDriverCash: false, canViewExpectedCash: false, canManageShifts: false },
  COOK:     { canCharge: false, canApplyDiscounts: false, canCancelItems: false, canReopenTables: false, canManageUsers: false, canManageDriverCash: false, canViewExpectedCash: false, canManageShifts: false },
};

export const DAYS = ["LUN", "MAR", "MIE", "JUE", "VIE", "SAB", "DOM"];

export const PERMS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "canCharge",         label: "Cobrar / abrir cajón",            icon: Banknote   },
  { key: "canApplyDiscounts", label: "Aplicar descuentos / cortesías",  icon: Tag        },
  { key: "canCancelItems",    label: "Anular productos enviados",        icon: Trash2     },
  { key: "canReopenTables",   label: "Reabrir cuentas cerradas",         icon: Unlock     },
  { key: "canManageShifts",   label: "Abrir / cerrar turno de caja",     icon: Clock      },
  { key: "canManageUsers",    label: "Gestionar empleados",              icon: Users      },
  { key: "canManageDriverCash", label: "Recibir caja de repartidores",   icon: Bike       },
  { key: "canViewExpectedCash", label: "Ver efectivo esperado (corte)",  icon: Eye        },
];

export const emptyForm = {
  name: "", phone: "", pin: "", role: "WAITER", photo: null as string | null,
  tables: [] as string[], scheduleStart: "", scheduleEnd: "", scheduleDays: [] as string[],
  isActive: true,
  canCharge: false, canApplyDiscounts: false, canCancelItems: false,
  canReopenTables: false, canManageUsers: false, canManageDriverCash: false,
  canViewExpectedCash: false, canManageShifts: false,
};

export function roleMeta(value: string) {
  return ROLES.find((r) => r.value === value);
}

export function initials(name: string) {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";
}
