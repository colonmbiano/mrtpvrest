import type { TPVEmployee } from "../store/authStore";

export type PosAction = "send" | "pay" | "settings" | "printers" | "relink" | "login" | "orders";
const sellingRoles = ["OWNER", "ADMIN", "MANAGER", "CASHIER", "WAITER"];
const chargingRoles = ["OWNER", "ADMIN", "MANAGER", "CASHIER"];

export function canPerform(employee: TPVEmployee | null, action: PosAction): boolean {
  if (!employee?.isActive) return false;
  if (action === "login") return true;
  if (["settings", "printers", "relink"].includes(action)) {
    return employee.role === "OWNER" || employee.role === "ADMIN";
  }
  if (action === "send" || action === "orders") return sellingRoles.includes(employee.role);
  return chargingRoles.includes(employee.role) && (
    employee.role === "OWNER" || employee.role === "ADMIN" ||
    employee.permissions?.includes("open_cash_drawer") === true
  );
}

export const roleLabels: Record<string, string> = {
  OWNER: "Propietario", ADMIN: "Administrador", MANAGER: "Encargado",
  CASHIER: "Cajero", WAITER: "Mesero", KITCHEN: "Cocina", COOK: "Cocina", DELIVERY: "Repartidor",
};

export function accessMessage(action: PosAction): string {
  if (action === "pay") return "Se necesita un cajero con permiso de cobro.";
  if (action === "send") return "Este empleado no tiene acceso a tomar pedidos.";
  if (action === "orders") return "Identifícate para consultar las órdenes de esta sucursal.";
  return "Esta opción requiere el PIN de un administrador o propietario.";
}
