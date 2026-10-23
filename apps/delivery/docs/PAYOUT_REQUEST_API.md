# Driver Payout Request API

## Overview
Endpoint para que repartidores soliciten retiros de sus ganancias a través de CLABE o débito.

## Endpoint

```
POST /api/marketplace/drivers/:id/payout-request
```

## Authentication
Requiere autenticación de repartidor (token JWT en header `Authorization: Bearer <token>`)

## Request Body

```json
{
  "amount": 500.00,
  "bankAccount": "012345678901234567",
  "accountType": "CLABE"
}
```

### Fields

- **amount** (number, required)
  - Monto en pesos mexicanos (MXN)
  - Rango: 100 - 50000
  - Debe ser menor o igual al saldo disponible del repartidor

- **bankAccount** (string, required)
  - Número de cuenta bancaria
  - Para CLABE: 18 dígitos numéricos
  - Para DEBIT: número de tarjeta (últimos 4-16 dígitos)

- **accountType** (string, required)
  - Valores: `"CLABE"` o `"DEBIT"`
  - CLABE: Cuenta de 18 dígitos (Sistema de Pagos Electrónicos Interbancarios)
  - DEBIT: Tarjeta de débito

## Response Success (201 Created)

```json
{
  "data": {
    "id": "payout_abc123xyz",
    "driverId": "driver_12345",
    "amount": 500.00,
    "bankAccount": "012345678901234567",
    "accountType": "CLABE",
    "status": "PENDING",
    "createdAt": "2026-10-22T14:30:00Z",
    "updatedAt": "2026-10-22T14:30:00Z"
  },
  "message": "Solicitud de retiro creada exitosamente"
}
```

## Response Errors

### 400 Bad Request
```json
{
  "error": "Monto inválido o fuera de rango",
  "errorCode": "INVALID_AMOUNT"
}
```

Posibles códigos:
- `INVALID_AMOUNT`: Monto < 100 o > 50000 o > saldo disponible
- `INVALID_CLABE`: CLABE no tiene 18 dígitos
- `INVALID_DEBIT`: Número de débito vacío o inválido
- `INVALID_ACCOUNT_TYPE`: accountType no es CLABE ni DEBIT
- `CASH_IN_HAND_PENDING`: Hay efectivo pendiente en caja que bloquea el retiro

### 401 Unauthorized
```json
{
  "error": "No autenticado",
  "errorCode": "UNAUTHORIZED"
}
```

### 404 Not Found
```json
{
  "error": "Repartidor no encontrado",
  "errorCode": "DRIVER_NOT_FOUND"
}
```

### 503 Service Unavailable
```json
{
  "error": "Solicitud de retiro temporalmente no disponible",
  "errorCode": "PAYOUT_UNAVAILABLE"
}
```

## Implementation Notes

### Database Schema
Se debe crear/actualizar la tabla `DriverPayoutRequest`:

```sql
CREATE TABLE driver_payout_requests (
  id VARCHAR(36) PRIMARY KEY,
  driver_id VARCHAR(36) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  bank_account VARCHAR(36) NOT NULL,
  account_type ENUM('CLABE', 'DEBIT') NOT NULL,
  status ENUM('PENDING', 'APPROVED', 'TRANSFERRED', 'REJECTED') DEFAULT 'PENDING',
  rejection_reason TEXT,
  transferred_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (driver_id) REFERENCES driver (id) ON DELETE CASCADE,
  INDEX idx_driver_id (driver_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
);
```

### Validation Rules
1. **CLABE**: Exactamente 18 dígitos numéricos
2. **Monto**: Entre $100 y $50,000 MXN
3. **Saldo disponible**: No puede incluir efectivo pendiente en caja
4. **Efectivo pendiente**: Bloquea solicitudes hasta que se liquide en caja
5. **Rate limit**: Máximo 1 solicitud por driver cada 5 minutos (anti-spam)

### Business Logic
- Estado inicial: `PENDING`
- Admin puede aprobar (`APPROVED`) o rechazar (`REJECTED`)
- Al transferir (`TRANSFERRED`): deducir del balance del driver
- Historial accesible en GET `/api/marketplace/drivers/:id/payouts`

### Integration Points
- **Balance**: Restar monto de `driver.availableBalance`
- **Notifications**: Notificar al driver cuando sea aprobado/rechazado/transferido
- **Accounting**: Crear `StockMovement` o `LedgerEntry` para auditoria
- **Webhooks**: Emitir socket event para actualizaciones en tiempo real

## Example cURL

```bash
curl -X POST http://localhost:3000/api/marketplace/drivers/driver_123/payout-request \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 500.00,
    "bankAccount": "012345678901234567",
    "accountType": "CLABE"
  }'
```

## Testing

Ver `apps/delivery/scripts/driver-payouts.test.mjs` para suite de validación offline.

Ejecutar:
```bash
node apps/delivery/scripts/driver-payouts.test.mjs
```

Resultado esperado: 22/22 tests pasados ✓
