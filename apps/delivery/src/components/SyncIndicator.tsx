'use client';

import { useOfflineStore } from '@/store/useOfflineStore';
import { CloudOff, CloudSync, CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { initBackgroundSync } from '@/lib/offline';

export default function SyncIndicator() {
  const queue = useOfflineStore((s) => s.queue);
  const syncInProgress = useOfflineStore((s) => s.syncInProgress);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Iniciar sync automático al montar
    initBackgroundSync();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const unsyncedCount = queue.filter(tx => !tx.synced).length;

  if (!isOnline) {
    return (
      <div className="fixed bottom-6 right-6 bg-red-500/90 text-white px-4 py-2 rounded-full flex items-center gap-2 shadow-lg backdrop-blur-md z-50 animate-pulse">
        <CloudOff size={16} />
        <span className="text-[10px] font-black uppercase">Sin Conexión</span>
      </div>
    );
  }

  if (syncInProgress) {
    return (
      <div className="fixed bottom-6 right-6 bg-orange-500/90 text-white px-4 py-2 rounded-full flex items-center gap-2 shadow-lg backdrop-blur-md z-50">
        <CloudSync size={16} className="animate-spin" />
        <span className="text-[10px] font-black uppercase">Sincronizando...</span>
      </div>
    );
  }

  if (unsyncedCount > 0) {
    return (
      <div className="fixed bottom-6 right-6 bg-blue-500/90 text-white px-4 py-2 rounded-full flex items-center gap-2 shadow-lg backdrop-blur-md z-50">
        <CloudSync size={16} />
        <span className="text-[10px] font-black uppercase">{unsyncedCount} pendientes</span>
      </div>
    );
  }

  return null;
}
