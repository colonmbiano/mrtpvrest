# Prompt Claude CLI — FASE 3 (post-verificación E2E delivery)

Eres dev senior en MRTPVREST. Las fases anteriores (`QA_REPORT_FIX_PROMPT.md` y `QA_REPORT_FIX_PROMPT_FASE2.md`) están abordadas. Esta fase consolida bugs detectados durante la verificación E2E del delivery + supervisión de la app del repartidor.

Reglas del CLAUDE.md aplican. Push directo a master OK.

---

## P0 — Lifecycle inconsistente del DeliveryOrder (CRÍTICO de operación)

### BUG-31: Triple inconsistencia de estado en TPV-943114
- **Repro:** crear orden DELIVERY en TPV con dirección+teléfono+repartidor → cobrar EFECTIVO → no tocar nada en app delivery → abrir app delivery como repartidor.
- **Síntoma:** la misma orden muestra 3 estados distintos según vista:
  - **RUTA ACTIVA** → "EN CAMINO" (badge ámbar)
  - **MI DESEMPEÑO → HISTORIAL DE ÓRDENES** → "ENTREGADO" con check verde, contador "ENTREGAS HOY: 1"
  - **MI CAJA → EFECTIVO EN MANO** → "$0" (debería ser $135 si entregó)
- **Causa probable:** distintos endpoints/queries leen el lifecycle de la orden con campos o filtros distintos. No hay state machine consistente.
- **Fix esperado:**
  1. Definir state machine claro: `ASIGNADO → EN_CAMINO → ENTREGADO`
  2. Endpoint `/api/delivery/history` filtra solo por `status='ENTREGADO'` — actualmente probablemente incluye `ASIGNADO/EN_CAMINO`
  3. `cash_held` del repartidor solo se incrementa cuando `status` transiciona a `ENTREGADO` por acción explícita del repartidor (tap en botón ENTREGAR), NO cuando el TPV cobra
  4. Agregar test e2e: orden cobrada en TPV → `RUTA ACTIVA` debe mostrarla, `HISTORIAL` NO debe incluirla, `CAJA` debe ser $0; tras tap ENTREGAR → `RUTA ACTIVA` debe quitarla, `HISTORIAL` mostrarla, `CAJA` sumar $135
- **Acceptance:** las 3 vistas son consistentes en cualquier momento del lifecycle.

---

## P1 — UX delivery (impacto operativo directo)

### BUG-30: Detalle delivery sin dirección texto y sin nombre producto
- **Repro:** app delivery → tap orden → DETALLE
- **Síntoma:** "UBICACIÓN DE ENTREGA" solo muestra pin de mapa (sin texto). "CONTENIDO DEL PEDIDO" solo muestra `1x — $135.00` sin nombre del producto.
- **Por qué importa:** el repartidor necesita leer la dirección antes de abrir mapa (referencias/edificio/piso) y saber QUÉ está llevando para verificar contenido antes de salir.
- **Fix:** en el componente `DeliveryDetailScreen` (o equivalente en la app delivery), renderizar:
  - `order.address` como texto bajo el pin (con fallback "Sin dirección registrada")
  - `order.items[].name` y `order.items[].quantity` debajo de "CONTENIDO DEL PEDIDO" (incluir variant + modificadores si los hay)
- **Acceptance:** abrir DETALLE → ver "calle el chorrito sn" como texto + "1x ARRACHERA HOUSE HAMBURGUESA" en lugar de "1x".

### BUG-32: Copy "configuración del navegador" expone WebView
- **Repro:** app delivery → tap "Iniciar seguimiento GPS" sin permisos
- **Síntoma:** mensaje "Sin permiso de ubicación — actívalo en la configuración del navegador". El repartidor no entiende "navegador" porque cree que usa app nativa.
- **Fix:** cambiar copy a "Sin permiso de ubicación. Actívalo en Ajustes de Android → Apps → MRTPV Delivery → Permisos → Ubicación". Idealmente añadir botón "Abrir Ajustes" que use Capacitor `App.openSettings()` o `Geolocation.requestPermissions()`.
- **Acceptance:** copy entendible por usuario non-tech + botón directo a settings.

---

## P1 — UX TPV (operación cajero)

### BUG-25: COBRAR enabled en EN MESA sin mesa asignada
- **Repro:** tab EN MESA → añadir producto → ticket muestra "SIN MESA ASIGNADA" → COBRAR TICKET está enabled (ámbar).
- **Esperado:** disabled hasta seleccionar mesa, simétrico al fix de Domicilio (que requiere dirección+teléfono).
- **Fix:** en `SidebarTicket`, condición de disabled debe incluir `type === 'EN_MESA' && !mesaId`.

### BUG-22: Producto truncado en Resumen del Pedido
- **Repro:** PaymentModal con un producto largo → resumen lateral derecho muestra "ARRACHERA HOUSE HAMBURG..."
- **Fix:** ampliar ancho de columna o `Tooltip` con full name al hover/tap.

### BUG-23: Iconos sidebar pantalla orden no son navegación
- **Repro:** dentro de pantalla de orden → tap en iconos del sidebar izquierdo (utensils, cart, $, grid, chart, bell, avatar) → no responden.
- **Fix:** o conectarlos a sus rutas reales (Comer Aquí / Caja / Mesas / Stats / Notif / Perfil) o eliminarlos. Dejar solo el avatar abajo + un botón "← Panel" claro para volver al Panel de Operación.

### BUG-26: Badge REQ no se quita al llenar campo
- **Repro:** tab DOMICILIO → llenar dirección → el badge REQ ámbar sigue al lado del campo lleno.
- **Causa probable:** validación basada en `value && value.length > 0` con default que no actualiza, o se usa `defaultValue` en lugar de `value`. O check sin `trim()`.
- **Fix:** en `DeliveryFieldsInput`, ocultar badge cuando `value.trim().length > 0` (controlled input).

### BUG-28: Modal Procesar Pago se cierra al click outside (pierde progreso)
- **Repro:** click COBRAR TICKET → modal abre → seleccionar Kebra + propina → tap accidental fuera del modal → modal se cierra → reabrir → todo perdido.
- **Fix:** o disable `closeOnOutsideClick`, o si hay `dirty state` mostrar confirmación "¿Descartar cambios del cobro?".

### BUG-29: Cliente delivery no se limpia tras cobro
- **Repro:** cobrar pedido domicilio → ticket vacío para nuevo pedido → campos cliente (Nombre, Dirección, Teléfono) **siguen llenos** del pedido anterior.
- **Decisión de producto:** ¿es intencional para clientes recurrentes? Si sí, añadir indicador visual "Reusando datos del cliente anterior — [Limpiar]" o auto-limpiar tras 30s. Si no, limpiar al iniciar nuevo ticket.

---

## P2 — UX Apariencia / cosmética (FASE 2 incompleta)

### BUG-15: Sin recovery del ticket tras crash del cobro (status pendiente verificar)
- El fix con `ticketStore` `persist` está en commit, pero falta validar tras crash real. Si el WebView crashea (recordar que ya no debería tras BUG-14), ¿el ticket se restaura al reabrir?

### BUG-17: Panel Central no navega tras volver de sub-pantalla
- Status: marcado completed pero conviene re-test después de los cambios de fase 3.

### BUG-20: Toggle "AMPLIO" en Ancho Panel Ticket no responde
- En Apariencia → "ANCHO DEL PANEL TICKET" → tap en AMPLIO no cambia selección. Verificar handler del segmented control.

### BUG-21: Toggle "PIN para abrir cajón" no responde
- En Seguridad → toggle 4 (abrir cajón) no cambia state. Verificar handler.

### BUG-18: Color de selección hardcoded ámbar (no respeta paleta)
- Cambiar paleta a CIAN/LIMA → bordes de selección siguen ámbar. Parametrizar `--color-accent` y leer del theme.

### BUG-19: Modo claro deja sidebar oscuro (deuda confesada)
- Deuda conocida del equipo. Cuando sea sprint de polish: auditar `bg-zinc-900`/`bg-black` hardcoded en sidebar de Configuración y reemplazar por tokens `bg-surface` que respondan al modo.

---

## Restricciones (CLAUDE.md)
- Sin placeholders. Código completo y listo para producción.
- camelCase variables, PascalCase componentes.
- Multi-tenancy: filtrar por `restaurant_id`.
- Resiliencia 429/500 → 503 controlada.
- Push directo a master.

## Cómo trabajar
1. **Empieza por BUG-31** (lifecycle DeliveryOrder). Es el de mayor impacto operativo. Pídeme `Grep` el modelo `DeliveryOrder` o `Order` con campo `deliveryStatus` para entender el state machine actual antes de tocar nada.
2. Después BUG-30 + BUG-32 (paquete app delivery, mismo deploy).
3. Después BUG-25 + BUG-26 (validación TPV, mismo componente probablemente).
4. BUG-28 + BUG-29 (PaymentModal cleanup).
5. BUG-22 + BUG-23 (cosmética TPV).
6. BUG-20 + BUG-21 (toggles fase 2).
7. BUG-18 + BUG-19 (theme/cosmética, sprint polish).

Tras cada fix dame `git diff` y commit message en español.

## Verificación post-fix
1. Crear orden DELIVERY en TPV con cliente lalo, calle X, tel Y, repartidor Kebra, pago EFECTIVO $135
2. **NO tocar app delivery por 1 min** → verificar:
   - RUTA ACTIVA muestra orden con "EN CAMINO" ✓
   - MI DESEMPEÑO no la muestra como entregada ✓
   - MI CAJA muestra $0 ✓
3. Tap ENTREGAR en app delivery → verificar:
   - RUTA ACTIVA pierde la orden ✓
   - MI DESEMPEÑO suma "ENTREGAS HOY: 1" ✓
   - MI CAJA muestra $135 ✓
4. DETALLE muestra "calle X" como texto + "1x ARRACHERA HOUSE HAMBURGUESA" ✓
5. Iniciar GPS sin permisos → mensaje "Ajustes de Android → ..." sin "navegador" ✓

Si los 5 pasan, fase 3 completa.
