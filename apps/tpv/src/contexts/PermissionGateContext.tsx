"use client";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import AdminPinModal from "@/components/AdminPinModal";

type Resolver = (token: string | null) => void;

type PermissionGateContextValue = {
  /**
   * Ejecuta una acción que recibe un overrideToken opcional.
   * Si la acción tira 403 con code PERMISSION_DENIED, abre el modal de PIN
   * de admin, obtiene un override token, y reintenta la acción.
   *
   * La acción debe pasar el overrideToken al backend en el header
   * X-Permission-Override cuando llega no-undefined.
   */
  run: <T>(action: (overrideToken?: string) => Promise<T>) => Promise<T>;
};

const PermissionGateContext = createContext<PermissionGateContextValue | null>(null);

const PERMISSION_LABELS: Record<string, string> = {
  canCharge:        "Cobrar tickets",
  canDiscount:      "Aplicar descuento",
  canModifyTickets: "Modificar ticket",
  canDeleteTickets: "Eliminar / cancelar ticket",
  canConfigSystem:  "Configurar sistema",
  canTakeDelivery:  "Tomar pedido delivery",
  canTakeTakeout:   "Tomar pedido para llevar",
  canManageShifts:  "Abrir / cerrar turno",
};

function getPermissionLabel(perm: string): string {
  return PERMISSION_LABELS[perm] ?? perm;
}

export function PermissionGateProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{ permission: string } | null>(null);
  const resolverRef = useRef<Resolver | null>(null);

  const requestOverride = useCallback((permission: string): Promise<string | null> => {
    return new Promise<string | null>((resolve) => {
      resolverRef.current = resolve;
      setPending({ permission });
    });
  }, []);

  const closeWith = useCallback((token: string | null) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setPending(null);
    resolver?.(token);
  }, []);

  const run = useCallback(async <T,>(action: (overrideToken?: string) => Promise<T>): Promise<T> => {
    try {
      return await action(undefined);
    } catch (err: any) {
      const code = err?.response?.data?.code;
      const perm = err?.response?.data?.permission;
      if (code !== "PERMISSION_DENIED" || !perm) throw err;

      const token = await requestOverride(perm);
      if (!token) {
        // Cancelado por el usuario; relanzamos el 403 original.
        throw err;
      }
      return await action(token);
    }
  }, [requestOverride]);

  return (
    <PermissionGateContext.Provider value={{ run }}>
      {children}
      {pending && (
        <AdminPinModal
          permission={pending.permission}
          permissionLabel={getPermissionLabel(pending.permission)}
          onApprove={(token) => closeWith(token)}
          onCancel={() => closeWith(null)}
        />
      )}
    </PermissionGateContext.Provider>
  );
}

export function usePermissionGate(): PermissionGateContextValue {
  const ctx = useContext(PermissionGateContext);
  if (!ctx) {
    throw new Error("usePermissionGate debe usarse dentro de <PermissionGateProvider>");
  }
  return ctx;
}
