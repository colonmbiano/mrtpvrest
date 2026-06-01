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

## 11. Estado de Implementación (snapshot 2026-06)

> Esta sección mantiene honesto el ARD: separa lo **implementado** de lo
> **aspiracional**. Las secciones anteriores describen el diseño objetivo;
> aquí está dónde estamos realmente. Actualizar cuando cambie.

| Área (sección) | Diseño objetivo | Estado real | Notas |
|----------------|-----------------|-------------|-------|
| Aislamiento multi-tenant (§7) | Prisma Client Extension global que fuerza `where: { restaurantId }`. | ✅ **Implementado** | `packages/database/tenant-guard.js`. Default `TENANT_GUARD_MODE=warn` (observa sin alterar); pasar a `enforce` tras validar logs. Ver `docs/TENANCY.md`. |
| RLS en Postgres (§7) | RLS activado en Supabase como 2ª línea. | ⚠️ **Pendiente** | No verificado en migraciones. El guard de Prisma es hoy la defensa principal. |
| Colas en background (§6) | **BullMQ** + Redis (DLQ, 5 reintentos). | ⚠️ **Parcial** | El backend usa `bull` v4 (no BullMQ) + `node-cron`. Jobs reales: `trialExpiry`, `autoPromos`. DLQ no implementada. |
| pgvector / búsqueda semántica (§5) | Embeddings de catálogo en Supabase. | ❌ **No implementado** | IA actual: escaneo de menú (Gemini) + asistentes texto (Groq/OpenAI). |
| `AuditLog` inmutable (§9) | Tabla legal de auditoría con delta antes/después. | ⚠️ **Parcial** | Existe `AccessLog` + `SystemLog` (errores). No hay tabla de auditoría de negocio con deltas. |
| Tracing `X-Correlation-ID` (§9) | UUID por request en logger + BullMQ. | ⚠️ **Pendiente** | Logger estructurado presente; correlation-id no propagado de forma sistemática. |
| Observabilidad externa (§9) | BetterStack / Axiom. | ⚠️ **Parcial** | Sentry integrado (`lib/sentry`). Stream a BetterStack/Axiom no configurado. |
| Tests Unit/Service ≥60% (§10) | 60% global, 90% flujos de dinero. | ⚠️ **Parcial** | Lógica de dinero pura (`lib/money.js`) y tenant-guard cubiertas ~100%. Cobertura global real ~6%: rutas/servicios sin tests. Gate de CI backend activo (`ci-backend.yml`). |
| Tests Integration con Postgres real (§10) | `pnpm test:integration` sin mocks. | ❌ **No implementado** | Los tests actuales mockean Prisma. Falta el job con contenedor Postgres. |
| E2E bloqueante (§10) | Playwright bloquea merge a master. | ⚠️ **Provisional** | Suite Playwright existe; pipeline en `e2e.yml` (manual) — requiere secrets + seed de PINs deterministas para promoverse a required check. |
| Versionado de API `/v1`,`/v2` (§6) | Versionado explícito en URL. | ❌ **No implementado** | Rutas sin prefijo de versión. |

### Notas de estructura
- El monorepo tiene `packages/{config,database,types}`. **No existe `packages/shared`**
  (mencionado en docs antiguas y en el filtro de `tpv-ota-release.yml`); ese path
  está muerto y puede eliminarse del workflow.

*Decision Log (Sección 20) comenzará a poblarse en futuras iteraciones mediante `ard-update`.*