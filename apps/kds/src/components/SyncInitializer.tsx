'use client';

import { useEffect } from 'react';
import { initBackgroundSync } from '@/lib/offline';
import { useAuthStore } from '@/store/authStore';

export default function SyncInitializer() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    // Solo iniciar sync si estamos autenticados (tenemos permisos/contexto)
    if (isAuthenticated) {
      initBackgroundSync();
    }
  }, [isAuthenticated]);

  return null;
}
