# Setup Offline-First + RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:dispatching-parallel-agents to execute TIER 1-4 tasks in parallel. This plan is designed for maximum parallelism to minimize total execution time and tokens.

**Goal:** Implement Setup (strictly online) → Offline-First POS system with PIN authentication, RBAC, Manager Override, and background sync.

**Architecture:** Tiered implementation with design system foundation, followed by parallel execution of independent stores, components, and pages. Middleware provides final route protection.

**Tech Stack:** Next.js 14 (App Router), Zustand, SHA256 hashing, localStorage/IndexedDB, TypeScript

---

## File Structure

```
apps/tpv/src/
├── app/
│   ├── setup/
│   │   ├── page.tsx (NEW - orchestrador)
│   │   └── steps/
│   │       ├── LoginStep.tsx (NEW)
│   │       ├── LocationStep.tsx (NEW)
│   │       └── DeviceStep.tsx (NEW)
│   ├── locked/
│   │   └── page.tsx (NEW)
│   └── pos/
│       └── order-type/
│           └── page.tsx (MODIFY - integrar RequirePermission)
├── components/
│   ├── RequirePermission.tsx (NEW)
│   ├── ManagerOverrideModal.tsx (NEW)
│   └── NumpadPIN.tsx (NEW)
├── store/
│   ├── useAuthStore.ts (NEW)
│   └── useOfflineStore.ts (NEW)
├── lib/
│   ├── hash.ts (NEW - PIN hashing)
│   └── offline.ts (NEW - background sync)
├── styles/
│   └── globals.css (MODIFY - design system)
├── middleware.ts (NEW)
└── tailwind.config.js (MODIFY - design system)
```

---

## Execution Tiers

### TIER 0: Foundation (MUST be first)

#### Task 1: Design System (tailwind.config.js + globals.css)

**Files:**
- Modify: `apps/tpv/tailwind.config.js`
- Modify: `apps/tpv/src/styles/globals.css`

- [ ] **Step 1: Update tailwind.config.js with design system variables**

```javascript
// apps/tpv/tailwind.config.js
import type { Config } from "tailwindcss"

const config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary
        primary: "#FF8400",
        "primary-soft": "rgba(255, 132, 0, 0.15)",
        
        // Semantic
        success: "#88D66C",
        "success-soft": "rgba(136, 214, 108, 0.15)",
        danger: "#FF5C33",
        "danger-soft": "rgba(255, 92, 51, 0.15)",
        
        // Neutral
        background: "#0C0C0E",
        card: "#131316",
        foreground: "#FFFFFF",
        "foreground-secondary": "#B8B9B6",
        border: "#27272A",
        muted: "#2E2E2E",
      },
      fontFamily: {
        primary: ["JetBrains Mono", "monospace"],
        secondary: ["Geist", "sans-serif"],
      },
      borderRadius: {
        m: "16px",
        pill: "999px",
      },
      boxShadow: {
        glow: "0 4px 20px rgba(255, 132, 0, 0.4)",
        "glow-sm": "0 2px 8px rgba(255, 132, 0, 0.2)",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
} satisfies Config

export default config
```

- [ ] **Step 2: Update globals.css with glassmorphic styles and design tokens**

```css
/* apps/tpv/src/styles/globals.css */

@import "tailwindcss/base";
@import "tailwindcss/components";
@import "tailwindcss/utilities";

:root {
  /* Colors */
  --primary: #FF8400;
  --primary-soft: rgba(255, 132, 0, 0.15);
  --success: #88D66C;
  --success-soft: rgba(136, 214, 108, 0.15);
  --danger: #FF5C33;
  --danger-soft: rgba(255, 92, 51, 0.15);
  
  --background: #0C0C0E;
  --card: #131316;
  --foreground: #FFFFFF;
  --foreground-secondary: #B8B9B6;
  --border: #27272A;
  --muted: #2E2E2E;

  /* Typography */
  --font-primary: "JetBrains Mono", monospace;
  --font-secondary: "Geist", sans-serif;

  /* Spacing */
  --radius-m: 16px;
  --radius-pill: 999px;

  /* Effects */
  --shadow-glow: 0 4px 20px rgba(255, 132, 0, 0.4);
  --shadow-glow-sm: 0 2px 8px rgba(255, 132, 0, 0.2);
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-secondary);
  line-height: 1.6;
}

h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-primary);
  font-weight: 600;
}

/* Glassmorphic Utilities */
.glass {
  background: rgba(19, 19, 22, 0.8);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border);
  border-radius: var(--radius-m);
}

.glow-orange {
  background: radial-gradient(circle, rgba(255, 132, 0, 0.2) 0%, rgba(255, 132, 0, 0) 70%);
}

.glow-green {
  background: radial-gradient(circle, rgba(136, 214, 108, 0.15) 0%, rgba(136, 214, 108, 0) 70%);
}

/* Focus States */
input:focus,
button:focus,
select:focus {
  outline: none;
  box-shadow: 0 0 0 3px rgba(255, 132, 0, 0.2);
}
```

- [ ] **Step 3: Verify styles load correctly**

Run: `npm run dev` and check that the design system colors appear in DevTools

---

### TIER 1: Stores + Utils (Execute in PARALLEL after TIER 0)

#### Task 2: useAuthStore.ts

**Files:**
- Create: `apps/tpv/src/store/useAuthStore.ts`

- [ ] **Step 1: Create type definitions**

```typescript
// apps/tpv/src/store/useAuthStore.ts

export type UserRole = 'ADMIN' | 'MANAGER' | 'CASHIER' | 'WAITER';

export type Permission = 
  | 'void_item' 
  | 'void_order' 
  | 'apply_discount' 
  | 'comp_item' 
  | 'open_cash_drawer' 
  | 'process_refund' 
  | 'close_register'
  | 'transfer_table';

export interface OfflineEmployee {
  id: string;
  name: string;
  role: UserRole;
  pin: string; // Hash (SHA256)
  isActive: boolean;
  permissions: Permission[];
  lastSync: number;
}

export interface AuthState {
  // Current employee
  currentEmployee: OfflineEmployee | null;
  
  // Cached employee list
  employees: OfflineEmployee[];
  
  // Loading/error states
  loading: boolean;
  error: string | null;
  
  // Methods
  loginEmployee: (pin: string) => Promise<boolean>;
  logoutEmployee: () => void;
  refreshEmployeeList: (newEmployees: OfflineEmployee[]) => void;
  hasPermission: (permission: Permission) => boolean;
  setCurrentEmployee: (employee: OfflineEmployee | null) => void;
  setEmployees: (employees: OfflineEmployee[]) => void;
  setError: (error: string | null) => void;
}
```

- [ ] **Step 2: Implement Zustand store**

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { hashPin } from '@/lib/hash';

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentEmployee: null,
      employees: [],
      loading: false,
      error: null,

      loginEmployee: async (pin: string) => {
        set({ loading: true, error: null });
        try {
          const employees = get().employees;
          const pinHash = await hashPin(pin);
          
          const employee = employees.find(
            e => e.pin === pinHash && e.isActive
          );
          
          if (!employee) {
            set({ error: 'PIN incorrecto', loading: false });
            return false;
          }
          
          set({
            currentEmployee: employee,
            loading: false,
          });
          
          // Guardar en localStorage
          localStorage.setItem('currentEmployeeId', employee.id);
          localStorage.setItem('currentEmployeeName', employee.name);
          localStorage.setItem('currentEmployeeRole', employee.role);
          localStorage.setItem('currentEmployeePermissions', JSON.stringify(employee.permissions));
          
          return true;
        } catch (err) {
          set({ error: 'Error validando PIN', loading: false });
          return false;
        }
      },

      logoutEmployee: () => {
        set({ currentEmployee: null });
        localStorage.removeItem('currentEmployeeId');
        localStorage.removeItem('currentEmployeeName');
        localStorage.removeItem('currentEmployeeRole');
        localStorage.removeItem('currentEmployeePermissions');
        
        // Limpiar cookie
        document.cookie = 'tpv-session-active=; path=/; max-age=0; SameSite=Lax';
      },

      refreshEmployeeList: (newEmployees: OfflineEmployee[]) => {
        set({ employees: newEmployees });
        localStorage.setItem('employees', JSON.stringify(newEmployees));
      },

      hasPermission: (permission: Permission) => {
        const current = get().currentEmployee;
        return current?.permissions?.includes(permission) ?? false;
      },

      setCurrentEmployee: (employee: OfflineEmployee | null) => {
        set({ currentEmployee: employee });
      },

      setEmployees: (employees: OfflineEmployee[]) => {
        set({ employees });
        localStorage.setItem('employees', JSON.stringify(employees));
      },

      setError: (error: string | null) => {
        set({ error });
      },
    }),
    {
      name: 'auth-store',
      storage: typeof window !== 'undefined' ? localStorage : undefined,
    }
  )
);
```

- [ ] **Step 3: Commit**

```bash
git add apps/tpv/src/store/useAuthStore.ts
git commit -m "feat: implement useAuthStore with offline employee management"
```

---

#### Task 3: useOfflineStore.ts

**Files:**
- Create: `apps/tpv/src/store/useOfflineStore.ts`

- [ ] **Step 1: Create type definitions**

```typescript
// apps/tpv/src/store/useOfflineStore.ts

export interface OfflineTransaction {
  id: string;
  type: 'order' | 'payment' | 'adjustment' | 'override';
  data: Record<string, any>;
  timestamp: number;
  synced: boolean;
  supervisor?: {
    id: string;
    name: string;
  };
}

export interface OfflineState {
  queue: OfflineTransaction[];
  syncInProgress: boolean;
  lastSync: number | null;
  
  // Methods
  addToQueue: (transaction: OfflineTransaction) => void;
  markSynced: (transactionId: string) => void;
  clearQueue: () => void;
  setSyncInProgress: (inProgress: boolean) => void;
  setLastSync: (timestamp: number) => void;
  getUnsyncedTransactions: () => OfflineTransaction[];
}
```

- [ ] **Step 2: Implement Zustand store**

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useOfflineStore = create<OfflineState>()(
  persist(
    (set, get) => ({
      queue: [],
      syncInProgress: false,
      lastSync: null,

      addToQueue: (transaction: OfflineTransaction) => {
        set((state) => ({
          queue: [...state.queue, transaction],
        }));
      },

      markSynced: (transactionId: string) => {
        set((state) => ({
          queue: state.queue.map((t) =>
            t.id === transactionId ? { ...t, synced: true } : t
          ),
        }));
      },

      clearQueue: () => {
        set({ queue: [] });
      },

      setSyncInProgress: (inProgress: boolean) => {
        set({ syncInProgress: inProgress });
      },

      setLastSync: (timestamp: number) => {
        set({ lastSync: timestamp });
      },

      getUnsyncedTransactions: () => {
        return get().queue.filter((t) => !t.synced);
      },
    }),
    {
      name: 'offline-store',
      storage: typeof window !== 'undefined' ? localStorage : undefined,
    }
  )
);
```

- [ ] **Step 3: Commit**

```bash
git add apps/tpv/src/store/useOfflineStore.ts
git commit -m "feat: implement useOfflineStore for transaction queuing"
```

---

#### Task 4: lib/hash.ts

**Files:**
- Create: `apps/tpv/src/lib/hash.ts`

- [ ] **Step 1: Implement PIN hashing utility**

```typescript
// apps/tpv/src/lib/hash.ts

import crypto from 'crypto';

export async function hashPin(pin: string): Promise<string> {
  // Use browser's SubtleCrypto if available, fallback to crypto-js
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  } else {
    // Node.js (server-side)
    return crypto.createHash('sha256').update(pin).digest('hex');
  }
}

export function hashPinSync(pin: string): string {
  // Server-side only
  return crypto.createHash('sha256').update(pin).digest('hex');
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/tpv/src/lib/hash.ts
git commit -m "feat: add SHA256 PIN hashing utility"
```

---

#### Task 5: lib/offline.ts

**Files:**
- Create: `apps/tpv/src/lib/offline.ts`

- [ ] **Step 1: Implement background sync logic**

```typescript
// apps/tpv/src/lib/offline.ts

import { useAuthStore } from '@/store/useAuthStore';
import { useOfflineStore } from '@/store/useOfflineStore';
import api from '@/lib/api';

export async function syncOfflineQueue(): Promise<void> {
  const offlineStore = useOfflineStore.getState();
  const authStore = useAuthStore.getState();
  
  // Check internet connection
  if (!navigator.onLine) {
    return;
  }
  
  offlineStore.setSyncInProgress(true);
  
  try {
    const unsyncedTransactions = offlineStore.getUnsyncedTransactions();
    
    for (const transaction of unsyncedTransactions) {
      try {
        // POST transaction to backend
        await api.post('/api/transactions/sync', transaction);
        offlineStore.markSynced(transaction.id);
      } catch (err) {
        // Keep in queue if fails
        console.error(`Failed to sync transaction ${transaction.id}:`, err);
      }
    }
    
    // Sync employee list
    try {
      const response = await api.get('/api/employees/sync');
      authStore.setEmployees(response.data);
    } catch (err) {
      console.error('Failed to sync employees:', err);
    }
    
    offlineStore.setLastSync(Date.now());
  } catch (err) {
    console.error('Sync error:', err);
  } finally {
    offlineStore.setSyncInProgress(false);
  }
}

export function initBackgroundSync(): void {
  // Sync on app init
  syncOfflineQueue();
  
  // Sync every 5 seconds if online
  setInterval(() => {
    if (navigator.onLine) {
      syncOfflineQueue();
    }
  }, 5000);
  
  // Sync when connection is restored
  window.addEventListener('online', () => {
    syncOfflineQueue();
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/tpv/src/lib/offline.ts
git commit -m "feat: implement background sync for offline transactions"
```

---

### TIER 2: UI Components (Execute in PARALLEL after TIER 1)

#### Task 6: RequirePermission.tsx

**Files:**
- Create: `apps/tpv/src/components/RequirePermission.tsx`

- [ ] **Step 1: Create component**

```typescript
// apps/tpv/src/components/RequirePermission.tsx

'use client';

import { useAuthStore, type Permission } from '@/store/useAuthStore';
import { ReactNode, useState } from 'react';
import ManagerOverrideModal from './ManagerOverrideModal';

interface RequirePermissionProps {
  permission: Permission;
  children: ReactNode;
  onExecute?: () => void;
}

export default function RequirePermission({
  permission,
  children,
  onExecute,
}: RequirePermissionProps) {
  const hasPermission = useAuthStore((s) => s.hasPermission(permission));
  const [showOverride, setShowOverride] = useState(false);

  if (hasPermission) {
    return <>{children}</>;
  }

  // If no permission, wrap child in button that opens override modal
  return (
    <>
      <div onClick={() => setShowOverride(true)} className="cursor-not-allowed opacity-50">
        {children}
      </div>
      {showOverride && (
        <ManagerOverrideModal
          permission={permission}
          onClose={() => setShowOverride(false)}
          onSuccess={() => {
            setShowOverride(false);
            onExecute?.();
          }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/tpv/src/components/RequirePermission.tsx
git commit -m "feat: create RequirePermission wrapper component"
```

---

#### Task 7: ManagerOverrideModal.tsx

**Files:**
- Create: `apps/tpv/src/components/ManagerOverrideModal.tsx`

- [ ] **Step 1: Create component**

```typescript
// apps/tpv/src/components/ManagerOverrideModal.tsx

'use client';

import { useAuthStore, type Permission } from '@/store/useAuthStore';
import { useOfflineStore } from '@/store/useOfflineStore';
import { hashPin } from '@/lib/hash';
import { useState } from 'react';
import NumpadPIN from './NumpadPIN';

interface ManagerOverrideModalProps {
  permission: Permission;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ManagerOverrideModal({
  permission,
  onClose,
  onSuccess,
}: ManagerOverrideModalProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const employees = useAuthStore((s) => s.employees);
  const currentEmployee = useAuthStore((s) => s.currentEmployee);
  const offlineStore = useOfflineStore();

  const handleSubmit = async () => {
    if (pin.length !== 4) {
      setError('PIN debe tener 4 dígitos');
      return;
    }

    setLoading(true);
    try {
      const pinHash = await hashPin(pin);
      
      // Find supervisor with permission
      const supervisor = employees.find(
        (e) =>
          e.pin === pinHash &&
          e.isActive &&
          (e.role === 'ADMIN' || e.role === 'MANAGER') &&
          e.permissions.includes(permission)
      );

      if (!supervisor) {
        setError('PIN incorrecto o sin permisos suficientes');
        setLoading(false);
        return;
      }

      // Log override
      offlineStore.addToQueue({
        id: `override-${Date.now()}`,
        type: 'override',
        data: {
          action: permission,
          employee: currentEmployee?.id,
          supervisor: supervisor.id,
        },
        timestamp: Date.now(),
        synced: false,
        supervisor: {
          id: supervisor.id,
          name: supervisor.name,
        },
      });

      onSuccess();
    } catch (err) {
      setError('Error validando PIN');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div
        className="rounded-m p-8 max-w-sm w-full"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >
        <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--foreground)' }}>
          Autorización Requerida
        </h2>
        <p className="text-sm mb-6" style={{ color: 'var(--foreground-secondary)' }}>
          Ingresa PIN de supervisor para continuar
        </p>

        <NumpadPIN value={pin} onChange={setPin} disabled={loading} />

        {error && (
          <div className="mt-4 p-3 rounded-m text-sm" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
            {error}
          </div>
        )}

        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-m"
            style={{ background: 'var(--muted)', color: 'var(--foreground)' }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || pin.length !== 4}
            className="flex-1 py-2 rounded-m font-bold"
            style={{
              background: 'var(--primary)',
              color: '#000',
              opacity: loading || pin.length !== 4 ? 0.5 : 1,
            }}
          >
            {loading ? 'Validando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/tpv/src/components/ManagerOverrideModal.tsx
git commit -m "feat: create ManagerOverrideModal for supervisor authorization"
```

---

#### Task 8: NumpadPIN.tsx

**Files:**
- Create: `apps/tpv/src/components/NumpadPIN.tsx`

- [ ] **Step 1: Create component**

```typescript
// apps/tpv/src/components/NumpadPIN.tsx

'use client';

import { useState } from 'react';

interface NumpadPINProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  onSubmit?: () => void;
}

export default function NumpadPIN({
  value,
  onChange,
  disabled = false,
  onSubmit,
}: NumpadPINProps) {
  const handleKeyPress = (key: string) => {
    if (disabled) return;

    if (key === 'DEL') {
      onChange(value.slice(0, -1));
    } else if (key === 'OK') {
      onSubmit?.();
    } else if (value.length < 4) {
      onChange(value + key);
      playSound();
    }
  };

  const playSound = () => {
    // Simple beep sound
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    gain.gain.setValueAtTime(0.1, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
  };

  const buttons = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['DEL', '0', 'OK'],
  ];

  return (
    <div className="space-y-4">
      {/* PIN Display */}
      <div className="flex justify-center gap-3 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="w-12 h-12 rounded-m flex items-center justify-center font-bold text-lg"
            style={{
              background: 'var(--muted)',
              color: value.length > i ? 'var(--primary)' : 'transparent',
              border: '2px solid var(--border)',
            }}
          >
            {value.length > i ? '●' : '○'}
          </div>
        ))}
      </div>

      {/* Numpad Grid */}
      <div className="grid grid-cols-3 gap-2">
        {buttons.map((row) =>
          row.map((btn) => (
            <button
              key={btn}
              onClick={() => handleKeyPress(btn)}
              disabled={disabled}
              className="py-3 rounded-m font-bold text-lg transition-all"
              style={{
                background:
                  btn === 'DEL' || btn === 'OK'
                    ? 'var(--muted)'
                    : 'var(--card)',
                color: btn === 'OK' ? 'var(--success)' : 'var(--foreground)',
                border: '1px solid var(--border)',
                opacity: disabled ? 0.5 : 1,
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              {btn}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/tpv/src/components/NumpadPIN.tsx
git commit -m "feat: create NumpadPIN component with sound feedback"
```

---

### TIER 3: Setup Pages (Execute in PARALLEL, but page.tsx depends on steps)

#### Task 9: setup/page.tsx (Orchestrador)

**Files:**
- Create: `apps/tpv/src/app/setup/page.tsx`

- [ ] **Step 1: Create orchestrador**

```typescript
// apps/tpv/src/app/setup/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { useAuthStore } from '@/store/useAuthStore';
import LoginStep from './steps/LoginStep';
import LocationStep from './steps/LocationStep';
import DeviceStep from './steps/DeviceStep';

type SetupStep = 'login' | 'location' | 'device' | 'saving';

interface SetupState {
  email: string;
  password: string;
  selectedRestaurant: any;
  selectedLocation: any;
  deviceType: string;
}

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<SetupStep>('login');
  const [state, setState] = useState<SetupState>({
    email: '',
    password: '',
    selectedRestaurant: null,
    selectedLocation: null,
    deviceType: 'CAJA',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [restaurants, setRestaurants] = useState([]);
  const [authToken, setAuthToken] = useState('');
  
  const setEmployees = useAuthStore((s) => s.setEmployees);

  // Check if already linked
  useEffect(() => {
    const hasDevice = document.cookie.includes('tpv-device-linked=true');
    if (hasDevice) {
      router.replace('/locked');
    }
  }, [router]);

  // Check internet connection
  useEffect(() => {
    const checkConnection = () => {
      if (!navigator.onLine && step !== 'login') {
        setError('Conexión requerida para vincular dispositivo');
      }
    };

    window.addEventListener('offline', checkConnection);
    return () => window.removeEventListener('offline', checkConnection);
  }, [step]);

  const handleLogin = async (email: string, password: string) => {
    if (!navigator.onLine) {
      setError('Conexión requerida para vincular dispositivo');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await axios.post('/api/auth/login', { email, password });
      const token = response.data.accessToken;
      setAuthToken(token);

      // Fetch restaurants
      const restResponse = await axios.get('/api/admin/config', {
        headers: { Authorization: `Bearer ${token}` },
      });

      setRestaurants([restResponse.data]);
      setState((s) => ({
        ...s,
        email,
        password,
        selectedRestaurant: restResponse.data,
      }));

      setStep('location');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const handleLocationSelect = async (locationId: string) => {
    setLoading(true);
    try {
      const locResponse = await axios.get(`/api/admin/locations/${locationId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      setState((s) => ({
        ...s,
        selectedLocation: locResponse.data,
      }));

      setStep('device');
    } catch (err: any) {
      setError('Error al cargar sucursal');
    } finally {
      setLoading(false);
    }
  };

  const handleDeviceSetup = async (deviceType: string) => {
    if (!navigator.onLine) {
      setError('Conexión requerida para vincular dispositivo');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await axios.post(
        '/api/devices/create',
        {
          locationId: state.selectedLocation.id,
          deviceType,
          restaurantId: state.selectedRestaurant.id,
        },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      const { deviceToken, deviceId } = response.data;

      // Save device info
      localStorage.setItem('deviceToken', deviceToken);
      localStorage.setItem('deviceId', deviceId);
      localStorage.setItem('locationId', state.selectedLocation.id);
      localStorage.setItem('restaurantId', state.selectedRestaurant.id);

      // Fetch and cache employees
      const empResponse = await axios.get('/api/employees/sync', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      setEmployees(empResponse.data);

      // Set device cookie
      const expires = new Date();
      expires.setFullYear(expires.getFullYear() + 1);
      document.cookie = `tpv-device-linked=true; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;

      setStep('saving');

      // Redirect after short delay
      setTimeout(() => {
        router.replace('/locked');
      }, 500);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al vincular dispositivo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 overflow-auto flex items-center justify-center p-6"
      style={{ background: 'var(--background)' }}
    >
      {/* Glassmorphic Glows */}
      <div className="absolute pointer-events-none glow-orange" style={{ width: 800, height: 800, top: -200, left: -200 }} />
      <div className="absolute pointer-events-none glow-green" style={{ width: 900, height: 900, bottom: -150, right: -150 }} />

      <div className="w-full max-w-lg relative z-10">
        <div
          className="rounded-m p-12"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          {step === 'login' && (
            <LoginStep onSubmit={handleLogin} loading={loading} error={error} />
          )}
          {step === 'location' && (
            <LocationStep
              locations={state.selectedRestaurant?.locations || []}
              onSelect={handleLocationSelect}
              loading={loading}
              error={error}
            />
          )}
          {step === 'device' && (
            <DeviceStep
              onSubmit={handleDeviceSetup}
              loading={loading}
              error={error}
            />
          )}
          {step === 'saving' && (
            <div className="text-center py-10">
              <h1 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>
                Guardando configuración...
              </h1>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/tpv/src/app/setup/page.tsx
git commit -m "feat: create setup orchestrador with multi-step flow"
```

---

#### Task 10: setup/steps/LoginStep.tsx

**Files:**
- Create: `apps/tpv/src/app/setup/steps/LoginStep.tsx`

- [ ] **Step 1: Create component**

```typescript
// apps/tpv/src/app/setup/steps/LoginStep.tsx

'use client';

import { Lock } from 'lucide-react';
import { FormEvent, useState } from 'react';

interface LoginStepProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  loading: boolean;
  error: string;
}

export default function LoginStep({ onSubmit, loading, error }: LoginStepProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await onSubmit(email, password);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      <div className="flex flex-col items-center text-center">
        <div
          className="w-16 h-16 rounded-m flex items-center justify-center"
          style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
        >
          <Lock size={32} />
        </div>
        <h1 className="text-2xl font-bold mt-4" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-primary)' }}>
          Configuración Inicial
        </h1>
        <p className="mt-2 text-base" style={{ color: 'var(--foreground-secondary)', fontFamily: 'var(--font-secondary)' }}>
          Inicia sesión como administrador para registrar esta terminal
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <label htmlFor="email" className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
            Correo Electrónico
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@restaurant.com"
            required
            className="w-full rounded-m text-base outline-none transition-all p-4"
            style={{
              background: 'var(--muted)',
              color: 'var(--foreground)',
              border: '1px solid var(--border)',
            }}
          />
        </div>

        <div className="flex flex-col gap-3">
          <label htmlFor="password" className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            required
            className="w-full rounded-m text-base outline-none transition-all p-4"
            style={{
              background: 'var(--muted)',
              color: 'var(--foreground)',
              border: '1px solid var(--border)',
            }}
          />
        </div>
      </div>

      {error && (
        <div
          className="p-3 rounded-m text-sm"
          style={{ background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid var(--danger)' }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-4 rounded-m font-bold text-base transition-all"
        style={{
          background: 'var(--primary)',
          color: '#000',
          opacity: loading ? 0.5 : 1,
          cursor: loading ? 'not-allowed' : 'pointer',
          boxShadow: 'var(--shadow-glow)',
        }}
      >
        {loading ? 'Entrando…' : 'Continuar'}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/tpv/src/app/setup/steps/LoginStep.tsx
git commit -m "feat: create LoginStep component"
```

---

#### Task 11: setup/steps/LocationStep.tsx

**Files:**
- Create: `apps/tpv/src/app/setup/steps/LocationStep.tsx`

- [ ] **Step 1: Create component**

```typescript
// apps/tpv/src/app/setup/steps/LocationStep.tsx

'use client';

import { Building2 } from 'lucide-react';
import { useState } from 'react';

interface LocationStepProps {
  locations: Array<{ id: string; name: string }>;
  onSelect: (locationId: string) => Promise<void>;
  loading: boolean;
  error: string;
}

export default function LocationStep({
  locations,
  onSelect,
  loading,
  error,
}: LocationStepProps) {
  const [selected, setSelected] = useState(locations[0]?.id || '');

  const handleSubmit = async () => {
    await onSelect(selected);
  };

  return (
    <div className="flex flex-col items-center text-center gap-8">
      <div className="flex flex-col items-center text-center">
        <div
          className="w-16 h-16 rounded-m flex items-center justify-center"
          style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
        >
          <Building2 size={32} />
        </div>
        <h1 className="text-2xl font-bold mt-4" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-primary)' }}>
          Seleccionar Sucursal
        </h1>
        <p className="mt-2 text-base" style={{ color: 'var(--foreground-secondary)' }}>
          Elige la sucursal donde se instalará esta terminal
        </p>
      </div>

      <div className="w-full text-left">
        <label className="block text-sm font-medium mb-3" style={{ color: 'var(--foreground)' }}>
          Sucursal
        </label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="w-full rounded-m text-base outline-none p-4 transition-all"
          style={{
            background: 'var(--muted)',
            color: 'var(--foreground)',
            border: '1px solid var(--border)',
          }}
        >
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div
          className="w-full p-3 rounded-m text-sm"
          style={{ background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid var(--danger)' }}
        >
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full py-4 rounded-m font-bold text-base transition-all"
        style={{
          background: 'var(--primary)',
          color: '#000',
          opacity: loading ? 0.5 : 1,
          cursor: loading ? 'not-allowed' : 'pointer',
          boxShadow: 'var(--shadow-glow)',
        }}
      >
        {loading ? 'Cargando…' : 'Continuar'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/tpv/src/app/setup/steps/LocationStep.tsx
git commit -m "feat: create LocationStep component"
```

---

#### Task 12: setup/steps/DeviceStep.tsx

**Files:**
- Create: `apps/tpv/src/app/setup/steps/DeviceStep.tsx`

- [ ] **Step 1: Create component**

```typescript
// apps/tpv/src/app/setup/steps/DeviceStep.tsx

'use client';

import { Laptop } from 'lucide-react';
import { useState } from 'react';

interface DeviceStepProps {
  onSubmit: (deviceType: string) => Promise<void>;
  loading: boolean;
  error: string;
}

export default function DeviceStep({ onSubmit, loading, error }: DeviceStepProps) {
  const [deviceType, setDeviceType] = useState('CAJA');

  const handleSubmit = async () => {
    await onSubmit(deviceType);
  };

  return (
    <div className="flex flex-col items-center text-center gap-8">
      <div className="flex flex-col items-center text-center">
        <div
          className="w-16 h-16 rounded-m flex items-center justify-center"
          style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
        >
          <Laptop size={32} />
        </div>
        <h1 className="text-2xl font-bold mt-4" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-primary)' }}>
          Configurar Dispositivo
        </h1>
        <p className="mt-2 text-base" style={{ color: 'var(--foreground-secondary)' }}>
          Selecciona el tipo de dispositivo
        </p>
      </div>

      <div className="w-full text-left">
        <label className="block text-sm font-medium mb-3" style={{ color: 'var(--foreground)' }}>
          Tipo de Dispositivo
        </label>
        <select
          value={deviceType}
          onChange={(e) => setDeviceType(e.target.value)}
          className="w-full rounded-m text-base outline-none p-4 transition-all"
          style={{
            background: 'var(--muted)',
            color: 'var(--foreground)',
            border: '1px solid var(--border)',
          }}
        >
          <option value="CAJA">Caja Principal</option>
          <option value="KDS">KDS Cocina</option>
          <option value="MESERO">Tablet Mesero</option>
        </select>
      </div>

      {error && (
        <div
          className="w-full p-3 rounded-m text-sm"
          style={{ background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid var(--danger)' }}
        >
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full py-4 rounded-m font-bold text-base transition-all"
        style={{
          background: 'var(--primary)',
          color: '#000',
          opacity: loading ? 0.5 : 1,
          cursor: loading ? 'not-allowed' : 'pointer',
          boxShadow: 'var(--shadow-glow)',
        }}
      >
        {loading ? 'Vinculando…' : 'Vincular Dispositivo'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/tpv/src/app/setup/steps/DeviceStep.tsx
git commit -m "feat: create DeviceStep component"
```

---

### TIER 4: Locked Screen + Middleware

#### Task 13: locked/page.tsx

**Files:**
- Create: `apps/tpv/src/app/locked/page.tsx`

- [ ] **Step 1: Create component**

```typescript
// apps/tpv/src/app/locked/page.tsx

'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { initBackgroundSync } from '@/lib/offline';
import NumpadPIN from '@/components/NumpadPIN';

export default function LockedPage() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const loginEmployee = useAuthStore((s) => s.loginEmployee);

  // Init background sync
  useEffect(() => {
    initBackgroundSync();
  }, []);

  // Load employees on mount
  useEffect(() => {
    const storedEmployees = localStorage.getItem('employees');
    if (storedEmployees) {
      try {
        const employees = JSON.parse(storedEmployees);
        useAuthStore.setState({ employees });
      } catch (err) {
        console.error('Failed to load employees:', err);
      }
    }
  }, []);

  const handlePINSubmit = async () => {
    if (pin.length !== 4) return;

    setLoading(true);
    setError('');

    const success = await loginEmployee(pin);

    if (success) {
      // Set session cookie
      const expires = new Date();
      expires.setHours(expires.getHours() + 8); // 8 hour session
      document.cookie = `tpv-session-active=true; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;

      // Redirect to order type selector
      setTimeout(() => {
        router.replace('/pos/order-type');
      }, 300);
    } else {
      setError('PIN incorrecto');
      setPin('');
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 overflow-auto flex items-center justify-center p-6"
      style={{ background: 'var(--background)' }}
    >
      {/* Glassmorphic Glows */}
      <div className="absolute pointer-events-none glow-orange" style={{ width: 800, height: 800, top: -200, left: -200 }} />
      <div className="absolute pointer-events-none glow-green" style={{ width: 900, height: 900, bottom: -150, right: -150 }} />

      <div className="w-full max-w-sm relative z-10">
        <div
          className="rounded-m p-12"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          <div className="flex flex-col items-center text-center mb-8">
            <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-primary)' }}>
              Ingresa tu PIN
            </h1>
            <p className="mt-2 text-sm" style={{ color: 'var(--foreground-secondary)' }}>
              4 dígitos para continuar
            </p>
          </div>

          <NumpadPIN value={pin} onChange={setPin} onSubmit={handlePINSubmit} disabled={loading} />

          {error && (
            <div
              className="mt-6 p-3 rounded-m text-sm text-center"
              style={{ background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid var(--danger)' }}
            >
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/tpv/src/app/locked/page.tsx
git commit -m "feat: create locked screen with PIN authentication"
```

---

#### Task 14: middleware.ts

**Files:**
- Create: `apps/tpv/src/middleware.ts`

- [ ] **Step 1: Create middleware**

```typescript
// apps/tpv/src/middleware.ts

import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const device = request.cookies.get('tpv-device-linked');
  const session = request.cookies.get('tpv-session-active');

  // Setup route: allow anyone
  if (pathname.startsWith('/setup')) {
    return NextResponse.next();
  }

  // Locked route: require device
  if (pathname.startsWith('/locked')) {
    if (!device) {
      return NextResponse.redirect(new URL('/setup', request.url));
    }
    return NextResponse.next();
  }

  // POS + KDS routes: require device + session
  if (pathname.startsWith('/pos') || pathname.startsWith('/kds')) {
    if (!device) {
      return NextResponse.redirect(new URL('/setup', request.url));
    }
    if (!session) {
      return NextResponse.redirect(new URL('/locked', request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/setup/:path*', '/locked/:path*', '/pos/:path*', '/kds/:path*'],
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/tpv/src/middleware.ts
git commit -m "feat: add middleware for route protection"
```

---

## Summary

**Total Files:**
- Create: 14
- Modify: 2

**Total Commits:** 14

**Parallelizable Phases:**
1. **TIER 0:** Design System (prerequisite)
2. **TIER 1:** 4 tasks (stores + utils) - all parallel
3. **TIER 2:** 3 tasks (UI components) - all parallel
4. **TIER 3:** 4 tasks (setup steps) - largely parallel
5. **TIER 4:** 2 tasks (locked + middleware) - parallel

**Estimated Token Savings with Parallel Execution:**
- Sequential: ~15,000 tokens
- Parallel (4 concurrent agents): ~6,000 tokens (~60% savings)

