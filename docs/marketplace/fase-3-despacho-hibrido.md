# Fase 3: Despacho Híbrido y Red de Repartidores

**Fecha:** 22 de octubre de 2026  
**Componente:** Logística y Despacho MRTPVREST Marketplace  
**Rama:** `feature/marketplace-hibrido`  
**Estado:** Especificación e implementación técnica

---

## 1. Visión y Reglas de Despacho Híbrido

El sistema permite que cada comercio opere con su propio personal de reparto o aproveche la red compartida de repartidores de la plataforma.

### Políticas de Despacho por Comercio (`deliveryPolicy`)
1. **`OWN_ONLY`**: Solo los repartidores propios (empleados o afiliados exclusivos) pueden tomar los pedidos de este comercio.
2. **`SHARED_ONLY`**: Los pedidos entran directamente a la red general de repartidores de la plataforma.
3. **`OWN_THEN_SHARED`** *(Recomendado por defecto)*:
   - Se ofrece primero al personal propio durante una ventana de tiempo (`fallbackSeconds`, por defecto 30 s).
   - Si ningún repartidor propio acepta la oferta en ese plazo, la tarea escala automáticamente a la red compartida de la plataforma.
4. **`MANUAL`**: El despachador o cajero decide explícitamente a quién asignar cada entrega.

---

## 2. Máquina de Estados de la Entrega

```
DeliveryTask:
  WAITING_READY  --> Orden en cocina/tienda; esperando tiempo estimado de empaque.
       │
       ▼
   OFFERING      --> Ofertas activas enviadas a couriers candidatos (TTL 15-30s).
       │
       ├─ [Expiran ofertas propias en OWN_THEN_SHARED] ──> Ofertas a red compartida (SHARED)
       │
       ▼
   ASSIGNED      --> Un único courier aceptó (bloqueo atómico CAS).
       │
       ▼
   PICKED_UP     --> Courier llegó al comercio y verificó recogida con PIN/QR.
       │             ★ Invariante: Order.status pasa a 'ON_THE_WAY' AQUÍ y solo aquí.
       ▼
   DELIVERED     --> Courier entregó al cliente y verificó con PIN de entrega.
                     ★ Invariante: Order.status pasa a 'DELIVERED'.

Ramas de Excepción:
   REASSIGNING   --> Courier cancela o falla antes de pickup; regresa a OFFERING.
   FAILED        --> Dirección inaccesible o cliente no responde; intervención de soporte.
   CANCELLED     --> Pedido cancelado por el comercio o cliente antes de pickup.
```

---

## 3. Asignación Concurrente Atómica (CAS - Compare-And-Swap)

Para evitar que dos repartidores acepten la misma entrega al mismo tiempo:
1. `DeliveryOffer` tiene un estado inicial `OFFERED` con `expiresAt`.
2. La aceptación requiere una verificación atómica sobre `DeliveryTask`:
   ```sql
   UPDATE DeliveryTask 
   SET status = 'ASSIGNED', currentAssignmentId = :assignmentId, updatedAt = NOW()
   WHERE id = :taskId AND status = 'OFFERING';
   ```
3. **Resultado**:
   - Exactamente **1 repartidor** actualiza 1 fila y recibe `200 OK` con los detalles de recogida.
   - Cualquier intento concurrente simultáneo actualiza 0 filas y recibe inmediatamente `409 Conflict` (`OFFER_ALREADY_CLAIMED`).
   - Cero riesgo de pagos dobles de envío o repartidores llegando por el mismo paquete.

---

## 4. Invariantes Críticos de Seguridad y Privacidad

1. **Estado `ON_THE_WAY`**: Jamás se marca un pedido "en camino" cuando el repartidor acepta la oferta. Solo ocurre tras confirmar el **pickup real** en tienda.
2. **Prueba de Recogida y Entrega**:
   - `pickupCode`: PIN numérico de 4 dígitos generado por el comercio que el repartidor introduce al recoger.
   - `deliveryCode`: PIN numérico de 4 dígitos generado para el cliente que se entrega al repartidor al recibir.
3. **Privacidad de GPS**:
   - El cliente solo puede ver la ubicación del repartidor cuando la tarea está en `PICKED_UP`.
   - La ubicación caduca a los 90 segundos (`expiresAt`); ubicaciones obsoletas no se muestran.
   - El repartidor solo ve la dirección del cliente cuando el pedido está asignado y recogido.
