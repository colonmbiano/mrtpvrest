# Fase 4: Finanzas, Conciliación y Split de Pagos (MKT-30)

**Fecha:** 22 de octubre de 2026  
**Componente:** Ledger Contable y Split de Pagos MRTPVREST Marketplace  
**Rama:** `feature/marketplace-hibrido`  
**Estado:** Especificación y Contrato Contable  

---

## 1. Visión Financiera

El Marketplace de MRTPVREST unifica giros gastronómicos y retail comercial (ferreterías, refaccionarias, abarrotes, etc.). Los modelos de liquidación financiera deben soportar:
1. **Planes SaaS con o sin comisión fija:** Comercios de retail pueden tener plan de $0 tarifa fija + comisión porcentual pura por venta, mientras que restaurantes en planes Pro/Unlimited operan con split preferencial.
2. **Liquidación a 3 bandas:**
   - **Comercio (`MERCHANT_PAYABLE`):** Subtotal de productos menos la comisión de plataforma.
   - **Repartidor (`COURIER_PAYABLE`):** Tarifa base de delivery + costo por km adicional + 100% de propinas del cliente.
   - **Plataforma (`PLATFORM_FEES`):** Comisión de intermediación retenida.

---

## 2. Invariante Contable: Ledger de Doble Entrada

Toda transacción se registra mediante asientos contables inmutables (`MarketplaceLedgerEntry`).
En cada asiento, **la suma total de los débitos debe ser exactamente igual a la suma total de los créditos**:

$$\sum \text{Debits} = \sum \text{Credits}$$

### Cuentas Contables del Sistema:
- `GATEWAY_ESCROW`: Fondos capturados y retenidos por el procesador de pago (Mercado Pago / Pasarela).
- `CUSTOMER_RECEIVABLE`: Cuenta receptora del cargo al cliente (total de orden).
- `MERCHANT_PAYABLE`: Pasivo exigible por el comercio vendedor.
- `COURIER_PAYABLE`: Pasivo exigible por el repartidor asignado a la entrega.
- `PLATFORM_FEES`: Ingreso devengado por la plataforma (comisión por servicio).
- `PLATFORM_PROMO_SUBSIDY`: Contrapartida en caso de promociones subsidiadas por el marketplace.

---

## 3. Ciclo de Vida Transaccional

### A. Captura del Pago (`ORDER_CAPTURED`)
Cuando el cliente paga con tarjeta o wallet digital en el checkout del marketplace:
- **Débito:** `CUSTOMER_RECEIVABLE` (Total pagado por cliente)
- **Crédito:** `GATEWAY_ESCROW` (Total en custodia de la pasarela)

### B. Liquidación de la Entrega (`ORDER_SETTLED`)
Ocurre automáticamente cuando el repartidor verifica la entrega con PIN (`DELIVERED`):
- **Débito:** `GATEWAY_ESCROW` (Total retenido)
- **Créditos:**
  - `MERCHANT_PAYABLE`: Monto productos − Comisión plataforma
  - `COURIER_PAYABLE`: Tarifa de envío + 100% propina
  - `PLATFORM_FEES`: Comisión retenida por el marketplace

### C. Reembolso Total (`ORDER_REFUNDED`)
Si la orden se cancela antes de la preparación o falla de forma justificada:
- **Débito:** `GATEWAY_ESCROW`
- **Crédito:** `CUSTOMER_RECEIVABLE` (Devolución íntegra al comprador)

---

## 4. Integración con Mercado Pago Split 1:1

1. **OAuth Onboarding:** Cada comercio conecta su cuenta de Mercado Pago mediante OAuth. El `collector_id` del comercio queda asociado a su Tenant.
2. **Creación de Preferencia con `marketplace_fee`:**
   - Al crear el pago o la preferencia en Mercado Pago, se envía `marketplace_fee = comisionPlataforma`.
   - Mercado Pago transfiere automáticamente el neto al comercio y el `marketplace_fee` a la cuenta maestra de MRTPVREST, eliminando la fricción fiscal de dispersión manual.
3. **Webhook Idempotente:**
   - El endpoint `/api/marketplace/payments/webhook` recibe notificaciones de pago.
   - Valida la firma del webhook (`x-signature`).
   - Verifica la clave de idempotencia (`provider_payment_id`). Si el evento ya fue procesado, responde `200 OK` de forma inmediata sin duplicar transacciones en el ledger.
