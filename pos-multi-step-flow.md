# Flujo Multi-Paso para POS (Next.js App Router)

Esta estructura divide las responsabilidades del TPV en rutas completamente independientes (`/setup`, `/locked`, `/pos/order-type`, `/pos/menu`), usando Zustand para la persistencia de estado y Middleware para proteger el acceso.

## B. Manejo de Estado Global (Zustand)

Instala `zustand` si no lo tienes, y crea el store con soporte para `persist` (localStorage).

**`apps/tpv/src/store/usePosFlowStore.ts`**
```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Employee = { id: string; name: string; role: string };

interface PosFlowState {
  deviceToken: string | null;
  activeEmployee: Employee | null;
  currentOrderType: string | null;
  
  setDeviceToken: (token: string) => void;
  setActiveEmployee: (emp: Employee | null) => void;
  setCurrentOrderType: (type: string) => void;
  logout: () => void;
  unlinkDevice: () => void;
}

export const usePosFlowStore = create<PosFlowState>()(
  persist(
    (set) => ({
      deviceToken: null,
      activeEmployee: null,
      currentOrderType: null,

      setDeviceToken: (token) => set({ deviceToken: token }),
      setActiveEmployee: (emp) => set({ activeEmployee: emp }),
      setCurrentOrderType: (type) => set({ currentOrderType: type }),
      
      logout: () => set({ activeEmployee: null, currentOrderType: null }),
      unlinkDevice: () => set({ deviceToken: null, activeEmployee: null, currentOrderType: null }),
    }),
    {
      name: 'pos-flow-storage', // Nombre en localStorage
    }
  )
);
```

---

## A. Estructura de Rutas y Componentes

### 1. `/setup` - Configuración Inicial

**`apps/tpv/src/app/setup/page.tsx`**
```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePosFlowStore } from "@/store/usePosFlowStore";
import api from "@/lib/api"; // tu cliente axios

export default function SetupPage() {
  const router = useRouter();
  const setDeviceToken = usePosFlowStore(s => s.setDeviceToken);
  const [tenantId, setTenantId] = useState("");
  const [deviceType, setDeviceType] = useState("CAJA");

  const handleSetup = async () => {
    // 1. Validar con backend
    const { data } = await api.post("/api/devices/register", { tenantId, deviceType });
    
    // 2. Guardar token en Zustand (que lo guarda en localStorage)
    setDeviceToken(data.deviceToken);
    
    // 3. (Opcional) Guardar cookie para el Middleware de Next.js
    document.cookie = `deviceToken=${data.deviceToken}; path=/`;

    // 4. Redirigir a pantalla de bloqueo
    router.replace("/locked");
  };

  return (
    <div className="flex h-screen items-center justify-center bg-[#0C0C0E] text-white">
      <div className="w-full max-w-md p-8 bg-[#131316] border border-[#27272A] rounded-2xl">
        <h1 className="text-2xl font-bold mb-6 text-[var(--brand)]">Configurar Terminal</h1>
        <input 
          placeholder="Tenant ID" 
          onChange={e => setTenantId(e.target.value)}
          className="w-full mb-4 p-4 bg-[#1A1A1E] rounded-xl border border-[#27272A]"
        />
        <select 
          onChange={e => setDeviceType(e.target.value)}
          className="w-full mb-8 p-4 bg-[#1A1A1E] rounded-xl border border-[#27272A]"
        >
          <option value="CAJA">Caja Principal</option>
          <option value="KDS">Cocina</option>
        </select>
        <button 
          onClick={handleSetup}
          className="w-full p-4 bg-[var(--brand)] text-white rounded-xl font-bold"
        >
          Vincular
        </button>
      </div>
    </div>
  );
}
```

### 2. `/locked` - Pantalla de Numpad (PIN)

**`apps/tpv/src/app/locked/page.tsx`**
```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePosFlowStore } from "@/store/usePosFlowStore";
import api from "@/lib/api";

export default function LockedPage() {
  const router = useRouter();
  const setActiveEmployee = usePosFlowStore(s => s.setActiveEmployee);
  const deviceToken = usePosFlowStore(s => s.deviceToken);
  const [pin, setPin] = useState("");

  const handlePinSubmit = async () => {
    try {
      // Validar PIN contra backend usando el contexto del device
      const { data } = await api.post("/api/auth/pin", { pin, deviceToken });
      
      setActiveEmployee(data.employee); // Guarda empleado en estado global
      
      // Guardar cookie de sesión activa para el Middleware
      document.cookie = `activeEmployeeId=${data.employee.id}; path=/`;

      // Redirigir al siguiente paso
      router.replace("/pos/order-type");
    } catch (error) {
      alert("PIN Inválido");
      setPin("");
    }
  };

  return (
    <div className="flex flex-col h-screen items-center justify-center bg-[#0C0C0E] text-white">
      <h1 className="text-2xl mb-4 text-[var(--brand)]">Ingresa tu PIN</h1>
      <div className="text-4xl tracking-[1em] mb-8 h-12">{pin.replace(/./g, '•')}</div>
      
      {/* GRID DEL NUMPAD (Simplificado) */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[1,2,3,4,5,6,7,8,9].map(num => (
          <button 
            key={num} 
            onClick={() => setPin(prev => prev + num)}
            className="w-16 h-16 rounded-full bg-[#1A1A1E] text-2xl font-bold"
          >
            {num}
          </button>
        ))}
        <div />
        <button onClick={() => setPin(prev => prev + "0")} className="w-16 h-16 rounded-full bg-[#1A1A1E] text-2xl font-bold">0</button>
        <button onClick={() => setPin(prev => prev.slice(0, -1))} className="w-16 h-16 rounded-full bg-red-500/20 text-red-500 text-xl font-bold">X</button>
      </div>

      <button onClick={handlePinSubmit} className="w-64 p-4 bg-[var(--brand)] rounded-xl font-bold">Entrar</button>
    </div>
  );
}
```

### 3. `/pos/order-type` - Tipo de Pedido

**`apps/tpv/src/app/pos/order-type/page.tsx`**
```tsx
"use client";
import { useRouter } from "next/navigation";
import { usePosFlowStore } from "@/store/usePosFlowStore";

export default function OrderTypePage() {
  const router = useRouter();
  const setCurrentOrderType = usePosFlowStore(s => s.setCurrentOrderType);

  const handleSelect = (type: string) => {
    setCurrentOrderType(type); // Guarda globalmente el tipo
    router.push("/pos/menu");  // Redirige al menú principal
  };

  return (
    <div className="flex h-screen items-center justify-center bg-[#0C0C0E] text-white p-6">
      <div className="w-full max-w-3xl text-center">
        <h1 className="text-4xl font-bold mb-12">¿Qué tipo de pedido?</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <button onClick={() => handleSelect("DINE_IN")} className="p-10 bg-[#1A1A1E] hover:bg-[#27272A] border border-[var(--brand)] rounded-3xl text-xl font-bold">
            Comer Aquí
          </button>
          <button onClick={() => handleSelect("TAKEAWAY")} className="p-10 bg-[#1A1A1E] hover:bg-[#27272A] border border-[#27272A] rounded-3xl text-xl font-bold">
            Para Llevar
          </button>
          <button onClick={() => handleSelect("DELIVERY")} className="p-10 bg-[#1A1A1E] hover:bg-[#27272A] border border-[#27272A] rounded-3xl text-xl font-bold">
            A Domicilio
          </button>
        </div>
      </div>
    </div>
  );
}
```

### 4. `/pos/menu` - Menú Principal (Toma de pedidos)

**`apps/tpv/src/app/pos/menu/page.tsx`**
```tsx
"use client";
import { usePosFlowStore } from "@/store/usePosFlowStore";

export default function MenuPage() {
  // Leemos del estado global sin haberlo perdido por cambiar de ruta
  const currentOrderType = usePosFlowStore(s => s.currentOrderType);
  const employee = usePosFlowStore(s => s.activeEmployee);

  return (
    <div className="flex h-screen bg-[#0C0C0E] text-white">
      <div className="flex-1 p-6">
        <h1 className="text-2xl font-bold">Menú TPV</h1>
        <p className="text-gray-400 mt-2">
          Atendiendo: {employee?.name} | Tipo: {currentOrderType}
        </p>
        
        {/* Renderizado del catálogo de productos... */}
      </div>
    </div>
  );
}
```

---

## C. Protección de Rutas (Middleware)

El Middleware en Next.js se ejecuta en el servidor (Edge), por lo que no puede leer localStorage, **solo Cookies**. Asegúrate de que `/setup` y `/locked` seteen las cookies `deviceToken` y `activeEmployeeId` respectivamente.

**`apps/tpv/src/middleware.ts`**
```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Extraer cookies que indican estado de la sesión
  const deviceToken = request.cookies.get("deviceToken")?.value;
  const activeEmployeeId = request.cookies.get("activeEmployeeId")?.value;

  // RUTAS PROTEGIDAS (Requieren que el dispositivo esté vinculado)
  if (pathname.startsWith('/locked') || pathname.startsWith('/pos')) {
    if (!deviceToken) {
      // Dispositivo no vinculado -> Forzar setup
      return NextResponse.redirect(new URL('/setup', request.url));
    }
  }

  // RUTAS DEL POS INTERNO (Requieren que un empleado haya ingresado su PIN)
  if (pathname.startsWith('/pos')) {
    if (!activeEmployeeId) {
      // Dispositivo vinculado, pero nadie logueado -> Forzar LockScreen
      return NextResponse.redirect(new URL('/locked', request.url));
    }
  }

  // RUTAS DE SETUP/LOGIN: Si ya estás vinculado/logueado, no te dejo verlas
  if (pathname === '/setup' && deviceToken) {
    return NextResponse.redirect(new URL('/locked', request.url));
  }
  
  if (pathname === '/locked' && deviceToken && activeEmployeeId) {
    // Si ya pusiste PIN, ve a escoger tipo de pedido o menú
    return NextResponse.redirect(new URL('/pos/order-type', request.url));
  }

  return NextResponse.next();
}

// Configurar a qué rutas aplica el middleware para optimizar
export const config = {
  matcher: ['/setup', '/locked', '/pos/:path*'],
};
```
