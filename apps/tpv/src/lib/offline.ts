import useOfflineStore from '@/store/useOfflineStore';
import useAuthStore from '@/store/useAuthStore';

let syncInterval: NodeJS.Timeout | null = null;

export function initBackgroundSync() {
  if (syncInterval) return; // Already running

  // Sync immediately
  syncOfflineQueue();

  // Set up 5-second interval
  syncInterval = setInterval(() => {
    if (navigator.onLine) {
      syncOfflineQueue();
    }
  }, 5000);

  // Sync when connection returns
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      syncOfflineQueue();
    });
  }
}

export async function syncOfflineQueue() {
  const store = useOfflineStore.getState();
  const authStore = useAuthStore.getState();

  if (store.syncInProgress) return;

  const unsyncedTransactions = store.getUnsyncedTransactions();
  if (unsyncedTransactions.length === 0) return;

  store.setSyncInProgress(true);

  try {
    // Sync employees first
    const employeesResponse = await fetch('/api/employees/sync');
    if (employeesResponse.ok) {
      const employees = await employeesResponse.json();
      authStore.setEmployees(employees);
    }

    // Process each unsynced transaction
    for (const transaction of unsyncedTransactions) {
      try {
        const response = await fetch('/api/sync/transaction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(transaction),
        });

        if (response.ok) {
          store.markSynced(transaction.id);
        }
      } catch (err) {
        console.error(`Failed to sync transaction ${transaction.id}:`, err);
        // Keep in queue for retry
      }
    }

    store.setLastSync(Date.now());
  } catch (err) {
    console.error('Background sync error:', err);
  } finally {
    store.setSyncInProgress(false);
  }
}

export function stopBackgroundSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}
