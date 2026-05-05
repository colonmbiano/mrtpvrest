# 📝 Log de Pruebas TPV - MRTPVREST
# 🧋 Tienda de Prueba: BubbleLab

**Fecha:** 5 de mayo de 2026  
**Versión:** 0.1.0 (Debug)  
**Entorno:** localhost:3005 (Next.js dev) + localhost:3001 (Backend)  
**Tester:** Gemini CLI / Automatizado  

---

## 🏪 Credenciales de Prueba — BubbleLab

| Acceso | Usuario | Clave |
|---|---|---|
| Panel Admin | owner@bubblelab.mx | BubbleLab2024! |
| TPV — Admin | Sofía Ramírez | PIN: **1111** |
| TPV — Cajero | Diego Torres | PIN: **2222** |
| TPV — Delivery | Carlos Medina | PIN: **3333** |

---

## 🔐 1. Autenticación y Onboarding

| ID | Caso de Prueba | Pasos | Resultado Esperado | Estado | Notas |
|:---|:---|:---|:---|:---:|:---|
| A1 | Login Inicial (Setup) | Email + contraseña → seleccionar sucursal → vincular | Redirige a /locked | 🔲 | |
| A2 | Persistencia de sesión | Recargar página desde /locked | Mantiene locationId en localStorage | 🔲 | |
| A3 | Acceso por PIN (Admin) | PIN 1111 → OK | Accede como Sofía / ADMIN | 🔲 | |
| A4 | Acceso por PIN (Cajero) | PIN 2222 → OK | Accede como Diego / CASHIER | 🔲 | |
| A5 | Bloqueo de pantalla | Clic en candado desde hub | Vuelve a /locked | 🔲 | |
| A6 | PIN incorrecto | PIN 0000 → OK | Mensaje de error, sin acceso | 🔲 | |

---

## 🛒 2. Punto de Venta (POS)

| ID | Caso de Prueba | Pasos | Resultado Esperado | Estado | Notas |
|:---|:---|:---|:---|:---:|:---|
| P1 | Carga de Menú | Navegar a POS | 3 categorías + 10 productos BubbleLab | 🔲 | |
| P2 | Creación de Orden | Agregar Classic Milk Tea + Brown Sugar Boba + Matcha | Carrito: 3 items, total ~$210 | 🔲 | |
| P3 | Producto en Promo | Brown Sugar Boba | Precio tachado $80 → $70 visible | 🔲 | |
| P4 | Tipos de Orden | Seleccionar Comedor / Para llevar | Aplica lógica de mesa o nombre cliente | 🔲 | |
| P5 | Pago en Efectivo | Finalizar → Efectivo → $250 | Orden creada, carrito limpio | 🔲 | |
| P6 | Descuento manual | Aplicar descuento % en item | Total se actualiza | 🔲 | |

---

## 👨‍🍳 3. KDS — Kitchen Display System

| ID | Caso de Prueba | Pasos | Resultado Esperado | Estado | Notas |
|:---|:---|:---|:---|:---:|:---|
| K1 | Acceso KDS | Navegar a /kds en el TPV | Pantalla de cocina carga | 🔲 | |
| K2 | Orden en tiempo real | Crear orden en POS → Ver en KDS | La orden aparece vía Socket.io sin recargar | 🔲 | |
| K3 | Marcar como Lista | Tocar "Lista" en la tarjeta de orden | Estado cambia a READY en POS/Hub | 🔲 | |
| K4 | Orden urgente | Crear orden y esperar 31min (simular) | Tarjeta se marca en rojo/urgente | 🔲 | |
| K5 | Filtrado por categoría | Filtrar solo "Tés de Leche" | Solo muestra esos ítems | 🔲 | |

---

## 🛵 4. Delivery — App de Repartidor

| ID | Caso de Prueba | Pasos | Resultado Esperado | Estado | Notas |
|:---|:---|:---|:---|:---:|:---|
| D1 | Acceso Delivery | PIN 3333 → rol DELIVERY | Redirige a /repartidor o vista delivery | 🔲 | |
| D2 | Ver pedidos asignados | Lista de pedidos ON_THE_WAY | Muestra pedidos con dirección y cliente | 🔲 | |
| D3 | Confirmar entrega | Tocar "Entregado" en orden | Estado cambia a DELIVERED | 🔲 | |
| D4 | Efectivo sin cerrar | Confirmar entrega sin cerrar caja | cashCollected = false, visible en admin | 🔲 | |
| D5 | Rastreo GPS | Activar ubicación del repartidor | Posición visible en panel admin → Rastreo | 🔲 | |

---

## 🖨️ 5. Hardware e Integración

| ID | Caso de Prueba | Pasos | Resultado Esperado | Estado | Notas |
|:---|:---|:---|:---|:---:|:---|
| H1 | Config Impresora | Ajustes → IP:9100 | Detecta impresora térmica | 🔲 | |
| H2 | Test de Ticket | Imprimir ticket de prueba | Formato 80mm correcto | 🔲 | |
| H3 | Modo Offline | Desconectar WiFi → crear orden | Maneja caché o alerta | 🔲 | |

---

## 🐛 Errores Encontrados (Bugs)

| ID | Descripción | Severidad | Estado |
|:---|:---|:---:|:---|
| B1 | PIN de BubbleLab rechazado: terminal vinculada a otro restaurante (localStorage stale) | 🔴 Alta | Fix aplicado: limpiar localStorage antes del test |

---

## 📈 Conclusión de Sesión

**Resultado Global:** En progreso  
**Próximos Pasos:** [x] Limpiar localStorage → [ ] Re-test completo → [ ] Generar APK Release
