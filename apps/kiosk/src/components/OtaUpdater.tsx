'use client';

import { useEffect } from 'react';

// Lets Capgo know the active bundle booted correctly. If this is not called,
// the native updater can roll back to the previous bundle on the next launch.
export default function OtaUpdater() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform?.()) return;
        const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
        if (cancelled) return;
        await CapacitorUpdater.notifyAppReady();
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.debug('[OtaUpdater] notifyAppReady skipped:', err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
