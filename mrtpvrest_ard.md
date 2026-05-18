# ARD — mrtpvrest

> Sistema POS SaaS multi-tenant para restaurantes y negocios de alimentos en LATAM, con enfoque offline-first y módulos integrados de IA.

**Version:** 1.0.0
**Date:** 2026-05-16
**Status:** active

---

## 1. Architectural Style
*Modular Monolith with Layered Service-Oriented Architecture*
- **Decision:** Monolito Modular con Arquitectura por Capas y Middlewares de Infraestructura.
- **Why:** Maximiza la eficiencia operativa del monorepo compartiendo Prisma y tipos TypeScript sin la sobrecarga de red y orquestación de microservicios en Railway. Permite aislar lógicas de negocio puras (servicios) de los controladores HTTP.
- **Discarded alternatives:** 
  - *Microservicios puros:* Descartado por complejidad operativa prematura. 
  - *Arquitectura Hexagonal Pura:* Descartada por sobrecarga de abstracciones innecesarias, ya que Prisma 7 actúa como una capa de abstracción suficiente.

## 2. Design Patterns
| Pattern | Usage context | Why chosen | Discarded alternative |
|---------|--------------|------------|----------------------|
| **Service Pattern (Puro)** | Lógica de negocio1 core (ej. facturación, cortes). | Mantiene el código plano sin contenedores IoC pesados. Se usa Inyección Funcional opcional para pasar `tx` (PrismaClient) en transacciones ACID. | Contenedores IoC pesados (ej. NestJS). |
| **Strategy Pattern** | Motor de precios, descuentos dinámicos y promociones IA (gemini-2.5-flash). | Desacopla reglas complejas y ramificadas (BOGO, Happy Hour) del flujo de facturación central, permitiendo agregar reglas sin tocar el core. | Switches/Ifs anidados en la lógica de facturación. |
| **Direct Data Access (No Repo)** | Operaciones de persistencia y relaciones complejas. | Prisma 7 ya es un Data Mapper tipado. Un repositorio extra solo añadiría abstracción vacía ("forwarding" inútil). | Repository Pattern clásico. |

## 3. Principles
- **SOLID - Single Responsibility (S):** Un archivo por ruta/acción en Express (ej. `routes/orders/create-order.ts`). Evita controladores monolíticos inmanejables de miles de líneas y facilita el contexto para IAs.
- **DRY vs WET:** WET Controlado. Tipados y DB centralizados, pero flujos WET (duplicados) permitidos entre el checkout del TPV (offline-first, PIN de empleado) y el `client` (tienda online pública, Serverless). Preferimos flexibilidad operativa sobre abstracción unificada frágil.
- **KISS:** Integración nativa directa con SDK de Google Gen AI usando Zod schemas (`responseSchema`). Sin frameworks de orquestación de agentes (LangChain) para evitar latencia, cajas negras y fallos de build.

## 4. Quality Attributes
| Attribute | Target | Measurement method |
|-----------|--------|-------------------|
| **Latency (API)** | < 200ms (P95) | Creación/modificación de orden táctil en TPV. |
| **Latency (Hardware)**| < 500ms | Impresión de ticket LAN/ESC-POS desde toque. |
| **Scalability (Multi-tenant)**| > 50GB o >300 writes/min | Aislamiento físico de tenants "VIP" reescribiendo dinámicamente el string de conexión en el middleware. |
| **Reliability (Offline)**| Delta Merge (No Last-Write-Wins) | Sincronización offline envía deltas atómicos (`ADD_ITEM`, qty: 2, timestamp) para procesar acumulativamente y evitar pérdida de concurrencia. |
| **Isolation** | Pools separados TPV vs Admin | El TPV usa pool de alta prioridad. Consultas analíticas del admin forzadas a paginación y fuera de horas pico. |

## 5. Data Architecture
- **Evolución del Schema:** Migración a `prisma migrate deploy` (Expand & Contract) en producción. Se abandona `db push` por riesgo destructivo en entornos multi-tenant reales.
- **Datos IA / Vector Search:** Enfoque híbrido. Texto estructurado (Zod + Gemini) para escaneo rápido operativo. `pgvector` en Supabase para catálogo (embeddings de ingredientes/platillos) permitiendo búsqueda de similitud semántica.

## 6. Integration Patterns
| Pattern | When used | Why |
|---------|-----------|-----|
| **Background Queues** | Generación de PDFs, envío de emails, reportes pesados. | **BullMQ con Redis**. Evita bloquear el Event Loop de Express. Supera las limitaciones de los Cron Jobs estáticos para eventos disparados por usuarios. |
| **API Versioning** | Cambios que rompan la estructura de payloads (`/api/v1/` a `/api/v2/`). | Versionado en URL explícito. Garantiza retrocompatibilidad de 6 meses para hardware/tablets físicas con APKs antiguas no actualizadas al ritmo del backend. |
| **Real-time Transport** | Notificaciones KDS, alertas de mesa. | **Socket.io / SSE efímero**. Transporte reactivo ligero. La consistencia real pesada reside siempre en la base de datos (Postgres). |

## 7. Security Architecture
- **Blindaje Multi-tenant:** **Prisma Client Extensions + Middleware Global**. El middleware inyecta el `tenantId` en `req`. La extensión de Prisma intercepta *todos* los queries automáticamente para forzar el `where: { tenantId }`, previniendo IDOR.
- **Seguridad a nivel de Fila (RLS):** **Postgres RLS activado** en Supabase. Segunda línea de defensa física en la base de datos inyectando `request.jwt.claim.tenant_id`.
- **Sesiones en TPV:** JWT Inmutable de Dispositivo (`deviceToken` en Capacitor) + PIN efímero de empleado. Bloqueo automático por inactividad a los 3 minutos (Zustand clear -> `/locked`), sin desconectar la tablet.

## 8. Error Handling Strategy
| Strategy | When applied | Configuration |
|----------|-------------|---------------|
| **Graceful Degradation** | Falla de Gemini AI o Cloudinary. | Toast de alerta en UI, habilitación inmediata de carga manual (fallback). Sin bloqueos del sistema. |
| **Exponential Backoff** | Fallas de Webhooks de pasarelas de pago. | 3 reintentos automáticos configurados en `lib/api.ts`. |
| **Dead Letter Queues (DLQ)**| Tareas críticas asíncronas fallidas repetidamente (ej. facturación). | 5 intentos máximos en BullMQ. Si falla, va a DLQ para auditoría y reintento manual por el equipo de soporte. |

## 9. Observability
- **Centralización de Logs Híbrida:** 
  - *Errores Técnicos:* Logs estructurados de Express/Infra a **BetterStack** o Axiom (JSON Stream).
  - *Auditoría de Negocio:* Tabla inmutable `AuditLog` en Postgres para eventos críticos legales ("Borrado Orden", "Varianza Caja"), guardando delta anterior/posterior.
- **Tracing Plano:** UUID único (`X-Correlation-ID`) generado en middleware por petición. Se inyecta en el Logger y en los metadatos de BullMQ para trazar el flujo completo sin la sobrecarga de OpenTelemetry.

## 10. Testing Strategy
| Level | Mandatory | Coverage target | Tool |
|-------|-----------|-----------------|------|
| **Unit/Service** | Sí | ≥ 60% global (90%+ flujos de dinero) | Jest / Vitest |
| **Integration** | Sí | Camino Crítico Transaccional | Contenedor local Postgres real (`pnpm test:integration`) asegurando ACID, no mocks de Prisma. |
| **E2E (End-to-End)** | **Bloqueante** | Flujos Core (Turno -> Orden -> KDS -> Cobro -> Corte) | **Playwright**. Emula hardware táctil en Github Actions. Bloquea el merge a master si falla. |

---

*Decision Log (Sección 20) comenzará a poblarse en futuras iteraciones mediante `ard-update`.*