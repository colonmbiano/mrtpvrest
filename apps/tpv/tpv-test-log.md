# 📝 Log de Pruebas APK TPV - MRTPVREST

**Fecha:** 5 de mayo de 2026  
**Versión:** 0.1.0 (Debug)  
**Entorno de Prueba:** Android Studio Emulator / Physical Device  
**Tester:** Gemini CLI / User  

---

## 🔐 1. Autenticación y Onboarding
| ID | Caso de Prueba | Pasos | Resultado Esperado | Estado | Notas |
|:---|:---|:---|:---|:---:|:---|
| A1 | Login Inicial | Ingresar email/pass de restaurante | Redirige correctamente a la selección de sucursal | 🔲 | |
| A2 | Persistencia | Cerrar y abrir la app | Mantiene la sesión o pide PIN (no login completo) | 🔲 | |
| A3 | Acceso por PIN | Ingresar PIN de empleado (4-6 dígitos) | Acceso según rol (ADMIN/WAITER) | 🔲 | |
| A4 | Bloqueo | Clic en icono de candado | Pantalla de bloqueo activa, requiere PIN | 🔲 | |

## 🛒 2. Punto de Venta (POS)
| ID | Caso de Prueba | Pasos | Resultado Esperado | Estado | Notas |
|:---|:---|:---|:---|:---:|:---|
| P1 | Carga de Menú | Navegar a /pos/menu | Muestra categorías y productos con imágenes | 🔲 | |
| P2 | Creación de Orden | Agregar 3 productos + Modificadores | Carrito calcula totales correctamente | 🔲 | |
| P3 | Tipos de Orden | Seleccionar Comedor / Para Llevar | Aplica lógica de mesa o nombre cliente | 🔲 | |
| P4 | Descuentos | Aplicar descuento manual/promo | Total se actualiza y muestra precio tachado | 🔲 | |
| P5 | Pago (Efectivo) | Finalizar orden con efectivo | Registra venta, limpia carrito, lanza impresión | 🔲 | |

## 👨‍🍳 3. Módulos Operativos (KDS/Meseros)
| ID | Caso de Prueba | Pasos | Resultado Esperado | Estado | Notas |
|:---|:---|:---|:---|:---:|:---|
| O1 | Flujo KDS | Crear orden en POS -> Ver en KDS | La orden aparece en tiempo real vía Socket.io | 🔲 | |
| O2 | Despacho KDS | Marcar orden como "Lista" | Cambia estado en POS/Hub de meseros | 🔲 | |
| O3 | Toma de Pedido | App Meseros -> Enviar orden | Se sincroniza con caja central | 🔲 | |

## 🖨️ 4. Hardware e Integración
| ID | Caso de Prueba | Pasos | Resultado Esperado | Estado | Notas |
|:---|:---|:---|:---|:---:|:---|
| H1 | Config Impresora | Ajustes -> Buscar IP (9100) | Detecta impresora térmica en red local | 🔲 | |
| H2 | Test de Ticket | Imprimir ticket de prueba | Formato correcto (80mm), sin caracteres extraños | 🔲 | |
| H3 | Modo Offline | Desconectar WiFi -> Crear orden | Debería manejar caché o alertar falta de red | 🔲 | |

---

## 🐛 Errores Encontrados (Bugs)
*   *Reportar aquí cualquier glitch visual o crash detectado en Android Studio.*

---

## 📈 Conclusión de Sesión
**Resultado Global:** (Pendiente)  
**Próximos Pasos:** [ ] Corregir bugs | [ ] Generar APK Release
