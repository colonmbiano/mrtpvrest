# Setup Multi-Paso + Offline-First RBAC

**Fecha:** 2026-05-02  
**Versión:** 1.0  
**Scope:** Arquitectura completa de Setup, seguridad offline, RBAC y Manager Override

---

## 1. Visión General

El TPV tiene **dos fases distintas**:

### Fase 1: Setup (STRICTLY ONLINE)
- Usuario configura el dispositivo con credenciales admin
- Obtiene `deviceToken` del backend
- Si no hay internet → error claro, no puede continuar
- Al terminar → `tpv-device-linked=true` cookie + `deviceToken` en localStorage

### Fase 2: Operación (100% OFFLINE-FIRST)
- Empleados ingresan con PIN
- Todas las transacciones funcionan sin internet
- Manager Override para acciones críticas también offline
- Background sync cuando hay conexión

---

## 2. Rutas y Flujo

```
/setup (STRICTLY ONLINE)
  ├─ /setup?step=login → Email + Password
  ├─ /setup?step=location → Seleccionar Sucursal
  ├─ /setup?step=device → Seleccionar Tipo Device + deviceToken
  └─ Al completar: deviceToken guardado, redirige a /locked

/locked (OFFLINE-CAPABLE)
  ├─ Numpad PIN (4 dígitos)
  ├─ Valida against OfflineEmployee list (localStorage)
  ├─ Hash comparison (PIN nunca en texto plano)
  ├─ Si correcto: tpv-session-active cookie
  └─ Redirige a /pos/order-type

/pos/order-type (OFFLINE-CAPABLE)
  ├─ Selector: DINE_IN | TAKEOUT | DELIVERY
  └─ Redirige a /pos/menu

/pos/menu (OFFLINE-CAPABLE)
  ├─ TPV completo
  ├─ Acciones sensibles requieren RequirePermission
  ├─ Si usuario NO tiene permiso → ManagerOverrideModal
  └─ Todas transacciones en useOfflineStore
```

---

## 3. Design System (Variables del .pen)

**Paleta:**
- Primary: `#FF8400` (Ámbar)
- Success: `#88D66C` (Verde Salvia)
- Background: `#0C0C0E` (Obsidiana)
- Card: `#131316` (Gris Oscuro)
- Foreground: `#FFFFFF` (Blanco)
- Border: `#27272A` (Gris Borde)
- Muted: `#B8B9B6` (Gris Mutado)

**Tipografía:**
- Primary (títulos): `JetBrains Mono`
- Secondary (cuerpo): `Geist`

**Espaciado:**
- radius-m: `16px`
- radius-pill: `999px`

**Estilos:**
- Glassmorphism: glows radiales (#FF8400 y #88D66C)
- Bordes suaves, 1px de grosor
- Sombras blur (shadow-glow)

---

## 4. Modelos de Datos

### OfflineEmployee (localStorage/IndexedDB)
```typescript
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
  pin: string; // Hash (SHA256 o similar)
  isActive: boolean;
  permissions: Permission[];
  lastSync: number; // timestamp
}
```

### OfflineTransaction (useOfflineStore)
```typescript
interface OfflineTransaction {
  id: string;
  type: 'order' | 'payment' | 'adjustment';
  data: Record<string, any>;
  timestamp: number;
  synced: boolean;
}
```

---

## 5. Flujos Detallados

### 5.1 Setup (Strictly Online)

**Prerequisitos:**
- NO hay `tpv-device-linked` cookie

**Pasos:**

1. **LoginStep**
   - Input: email, password
   - POST `/api/auth/login`
   - Si error de conexión → mostrar "Conexión requerida para vincular dispositivo"
   - Si éxito → obtener token, guardar en sessionStorage (temporal)

2. **LocationStep**
   - GET `/api/admin/locations` (con auth token)
   - Mostrar dropdown de sucursales
   - Seleccionar una
   - Si error de conexión → mostrar error (NO puede continuar)

3. **DeviceStep**
   - Dropdown: "Caja Principal" | "KDS Cocina" | "Tablet Mesero"
   - POST `/api/devices/create` con { locationId, deviceType }
   - Backend genera deviceToken (UUID v4)
   - Frontend recibe deviceToken
   - **Guardar:**
     - localStorage["deviceToken"]
     - localStorage["deviceId"]
     - localStorage["locationId"]
     - localStorage["restaurantId"]
     - Cookie: `tpv-device-linked=true` (expires 1 año)
   - POST `/api/employees/sync` → descargar lista de empleados cacheados
     - Guardar en localStorage["employees"] como JSON

4. **Completar Setup**
   - Limpiar sessionStorage (token temporal)
   - Redirige a `/locked`

**Validación:**
- Cada step es transaccional
- Si falla en medio → volver al step anterior
- NO hay offline queue en setup (si falla = start over)

---

### 5.2 Locked Screen (Offline-Capable)

**Prerequisitos:**
- ✓ `tpv-device-linked` cookie
- ✓ localStorage["employees"] poblado
- ✗ `tpv-session-active` cookie

**Pasos:**

1. **PIN Input**
   - Numpad de 4 dígitos (0-9)
   - Cada dígito suena/vibra
   - Mostrar dots (● ● ● ●)

2. **PIN Validation** (LOCAL)
   - Obtener lista de OfflineEmployee desde localStorage
   - Calcular hash del PIN ingresado (SHA256)
   - Comparar con `employee.pin`
   - Si match → éxito
   - Si no → error, limpiar input, reintentar

3. **Session Creation**
   - Si PIN correcto:
     - Cookie: `tpv-session-active=true` (expires: session)
     - localStorage["currentEmployeeId"] = employee.id
     - localStorage["currentEmployeeName"] = employee.name
     - localStorage["currentEmployeeRole"] = employee.role
     - localStorage["currentEmployeePermissions"] = employee.permissions

4. **Redirect**
   - A `/pos/order-type`

**Validación:**
- Numpad siempre offline-capable
- No requiere conexión a internet
- Si device está desincronizado (employee desactivado en BD), lo detecta en el siguiente sync en POS

---

### 5.3 POS Menu (Offline-Capable)

**Prerequisitos:**
- ✓ `tpv-device-linked` cookie
- ✓ `tpv-session-active` cookie
- ✓ localStorage["currentEmployeeId"] poblado

**Flujo de Permisos:**

1. **RequirePermission Hook**
   ```typescript
   <RequirePermission permission="void_item">
     <button onClick={handleVoidItem}>Anular Item</button>
   </RequirePermission>
   ```
   - Obtener currentEmployeePermissions desde localStorage
   - Si tiene permiso → renderizar botón normal
   - Si NO tiene → renderizar botón deshabilitado o modal de override

2. **ManagerOverrideModal**
   - Al click en acción sin permiso:
     - Modal abre
     - Pide PIN de supervisor
     - Obtiene lista OfflineEmployee
     - Busca employee con ese PIN y con rol "ADMIN" o "MANAGER"
     - Si encuentra y tiene permiso:
       - Ejecuta acción original
       - Log en useOfflineStore: { action, supervisor, timestamp }
       - NO cierra sesión del empleado original
     - Si no encuentra:
       - Mostrar "PIN incorrecto o sin permisos"

3. **Transacciones Offline**
   - POST `/api/orders` falla sin internet
   - Guarda en useOfflineStore["queue"]
   - Muestra: "Guardado localmente, sincronizando..."
   - Background sync cada 5s si hay conexión

---

### 5.4 Background Sync

**Trigger:**
- Al entrar a `/pos` (si hay internet)
- Cada 5s si hay conexión
- Al recuperar conexión (online event)

**Acciones:**
1. GET `/api/employees/sync` → actualizar localStorage["employees"]
2. Procesar useOfflineStore["queue"]:
   - Iterar transacciones
   - POST a backend
   - Si éxito → marcar synced=true
   - Si falla → mantener en queue

---

## 6. Middleware (Next.js)

```typescript
// middleware.ts

export function middleware(request: NextRequest) {
  const device = request.cookies.get("tpv-device-linked");
  const session = request.cookies.get("tpv-session-active");
  const pathname = request.nextUrl.pathname;

  // Setup route: permite cualquiera
  if (pathname.startsWith("/setup")) {
    return NextResponse.next();
  }

  // Locked route: requiere device
  if (pathname.startsWith("/locked")) {
    if (!device) return NextResponse.redirect(new URL("/setup", request.url));
    return NextResponse.next();
  }

  // POS routes: requiere device + session
  if (pathname.startsWith("/pos") || pathname.startsWith("/kds")) {
    if (!device) return NextResponse.redirect(new URL("/setup", request.url));
    if (!session) return NextResponse.redirect(new URL("/locked", request.url));
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/setup/:path*", "/locked/:path*", "/pos/:path*", "/kds/:path*"],
};
```

---

## 7. Stores (Zustand)

### useAuthStore
- currentEmployee (OfflineEmployee)
- employees[] (lista cacheada)
- loginEmployee(pin: string)
- logoutEmployee()
- refreshEmployeeList()

### useOfflineStore
- queue[] (TransactionQueue)
- addToQueue(transaction)
- markSynced(transactionId)
- clearQueue()

---

## 8. Componentes

### RequirePermission
- Props: permission, children
- Valida `localStorage["currentEmployeePermissions"]`
- Si no tiene → envuelve en ManagerOverrideModal automático

### ManagerOverrideModal
- Numpad para PIN supervisor
- Valida contra localStorage["employees"]
- Ejecuta callback original si éxito
- Log de override en useOfflineStore

### NumpadPIN
- Grid 3x4 (0-9 + DEL + OK)
- Visual feedback
- Sonido/vibración por dígito

---

## 9. Archivos a Crear/Modificar

| Archivo | Responsabilidad |
|---------|-----------------|
| `tailwind.config.js` | Variables design system |
| `globals.css` | Reset + glassmorphic styles |
| `store/useAuthStore.ts` | Auth + employee management |
| `store/useOfflineStore.ts` | Transaction queue |
| `lib/offline.ts` | Background sync logic |
| `lib/hash.ts` | PIN hashing |
| `components/RequirePermission.tsx` | Permission wrapper |
| `components/ManagerOverrideModal.tsx` | Override flow |
| `components/NumpadPIN.tsx` | Numpad UI |
| `app/setup/page.tsx` | Setup orchestrador |
| `app/setup/steps/LoginStep.tsx` | Email + password |
| `app/setup/steps/LocationStep.tsx` | Location selector |
| `app/setup/steps/DeviceStep.tsx` | Device type + token |
| `app/locked/page.tsx` | PIN screen |
| `middleware.ts` | Route protection |

---

## 10. Criterios de Éxito

✓ Setup requiere internet, error claro si no hay  
✓ Post-setup funciona 100% offline (PIN, transacciones, overrides)  
✓ Manager override no requiere internet  
✓ Background sync sincroniza transacciones en queue  
✓ Design system usa variables del .pen  
✓ RBAC bloquea acciones sin permiso  
✓ Middleware protege rutas  
✓ PIN es hash (nunca texto plano)  
✓ Desempleo offline en Employee override  

---

## 11. Consideraciones Técnicas

**Seguridad:**
- PIN siempre hasheado, nunca texto plano
- deviceToken en httpOnly cookie (si es posible en web)
- Manager override loguea quién override qué

**Performance:**
- localStorage para caches < 5MB
- IndexedDB para caches > 5MB (future)
- Background sync no bloquea UI

**UX:**
- Offline indicator en navbar
- "Sincronizando..." feedback
- Retry automático si falla sync

---

**FIN DE SPEC**
