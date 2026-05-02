'use client';

import { useEffect, useState, useCallback } from 'react';

/**
 * Tipo no estándar — `BeforeInstallPromptEvent` solo existe en navegadores
 * basados en Chromium (Chrome, Edge, Samsung Internet, Opera). Lo
 * declaramos aquí porque @types/dom no lo expone aún.
 *
 * Spec: https://developer.mozilla.org/en-US/docs/Web/API/BeforeInstallPromptEvent
 */
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt: () => Promise<void>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
    appinstalled: Event;
  }
}

interface UseInstallPromptResult {
  /** El evento capturado, listo para `.prompt()`. Null si no aplica. */
  installEvent: BeforeInstallPromptEvent | null;
  /** El navegador soporta A2HS y la app aún no está instalada. */
  canInstall: boolean;
  /** La app ya corre en modo standalone (instalada). */
  isInstalled: boolean;
  /** Dispara el prompt nativo y resuelve con true si el usuario aceptó. */
  promptInstall: () => Promise<boolean>;
}

/**
 * Hook que maneja el ciclo de vida del prompt A2HS.
 *
 * - Captura el evento `beforeinstallprompt` (Chromium-only) y lo retiene.
 * - Detecta `display-mode: standalone` para no mostrar el banner si
 *   la app ya está instalada.
 * - Limpia el evento cuando el usuario completa la instalación.
 */
export function useInstallPrompt(): UseInstallPromptResult {
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari fallback
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window.navigator as any).standalone === true;
    setIsInstalled(standalone);

    const onBeforeInstall = (e: BeforeInstallPromptEvent) => {
      // Suprimir el mini-infobar de Chrome para mostrar nuestro banner custom
      e.preventDefault();
      setInstallEvent(e);
    };

    const onInstalled = () => {
      setInstallEvent(null);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!installEvent) return false;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    setInstallEvent(null); // el evento no se puede reutilizar
    return choice.outcome === 'accepted';
  }, [installEvent]);

  return {
    installEvent,
    canInstall: !!installEvent && !isInstalled,
    isInstalled,
    promptInstall,
  };
}
