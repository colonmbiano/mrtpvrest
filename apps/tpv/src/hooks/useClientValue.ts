"use client";
import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * Lee de forma SSR-safe un valor que solo existe en el cliente
 * (localStorage, navigator, window, …) sin caer en set-state-in-effect.
 *
 * En el servidor y en el primer render de hidratación devuelve
 * `serverValue`; tras hidratar, `read()`. React reconcilia el cambio
 * server→client automáticamente (es el propósito de useSyncExternalStore),
 * así que no hay mismatch de hidratación ni doble render manual.
 *
 * `subscribe` (opcional) registra listeners — eventos `online`/`offline`,
 * `storage`, custom events tipo `sidebar-width-changed`, … — y devuelve
 * su limpieza. React vuelve a leer `read()` cada vez que se notifica.
 *
 * NOTA: `read` debe devolver un primitivo (string/number/boolean) o una
 * referencia estable; devolver un objeto/array nuevo en cada llamada
 * provoca el warning "getSnapshot should be cached" y renders infinitos.
 */
export function useClientValue<T>(
  read: () => T,
  serverValue: T,
  subscribe: (onStoreChange: () => void) => () => void = noopSubscribe,
): T {
  return useSyncExternalStore(subscribe, read, () => serverValue);
}

/**
 * Helper de `subscribe` para useClientValue: re-lee cuando se dispara
 * cualquiera de los eventos de window indicados (custom events o
 * `storage`). La fuente de verdad es localStorage; quien escribe
 * dispara el evento y todos los lectores se reajustan.
 */
export function subscribeToEvents(...events: string[]) {
  return (onStoreChange: () => void) => {
    if (typeof window === "undefined") return () => {};
    for (const e of events) window.addEventListener(e, onStoreChange);
    return () => {
      for (const e of events) window.removeEventListener(e, onStoreChange);
    };
  };
}

/**
 * Gate de montaje SSR-safe: `false` en servidor / primer render,
 * `true` tras hidratar. Reemplaza el patrón
 * `const [mounted,setMounted]=useState(false); useEffect(()=>setMounted(true),[])`
 * sin set-state-in-effect.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
