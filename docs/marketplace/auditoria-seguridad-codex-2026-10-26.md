# Auditoría de seguridad del marketplace — G8

Fecha de corte: 26/oct/2026. Rama: `feature/marketplace-hibrido`. Revisión del árbol local, incluidos los cambios G1–G7 aún en integración. Este informe no modifica dependencias, lockfile, secretos ni configuraciones de despliegue.

## Alcance y resultado

Se revisaron el lockfile, los avisos oficiales de Next.js y axios, los resolutores de identidad y los caminos de verificación de PIN. Hay versiones afectadas por avisos de seguridad y dos límites de aislamiento pendientes: fallback de JWT a la clave de la tienda y contador de PIN propio en memoria. El cambio G3 corrige el contador de la red, con persistencia en G1; no corrige automáticamente los otros caminos.

La pertenencia a un rango afectado está confirmada por el lockfile. La explotación en un despliegue concreto depende de sus funciones y configuración; no se realizaron ataques, pruebas contra producción ni lectura de valores `.env`. No se ejecutó una auditoría completa de todas las dependencias transitivas.

## 1. Dependencias: actualización prioritaria pendiente

Inventario reproducible de `pnpm-lock.yaml`: `next@16.2.9`, `eslint-config-next@16.2.9`, `sharp@0.34.5` y `axios@1.18.0`. El lockfile compartido afecta a varias aplicaciones del monorepo; no acredita qué versión está desplegada.

| Aviso oficial | Aplicabilidad observada | Corrección publicada |
| --- | --- | --- |
| [Next GHSA-2464-fhr4-w9xw, 14/oct](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw): ejecución de código en optimización de imágenes SVG | Next y sharp fijados están en el rango afectado. El aviso requiere Linux con glibc y procesamiento de imágenes correspondiente. `apps/client/next.config.mjs` y `apps/admin/next.config.js` permiten cualquier host HTTPS para imágenes; no se comprobó el runtime desplegado ni una entrada SVG explotable | Next 16.4.1; sharp utilizado por Next >=0.35.5 |
| [Next GHSA-673q-mjm6-r5xr, 14/oct](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr): ejecución de código con `use cache` | Versión afectada. Requiere App Router, Cache Components y una función `use cache` que devuelva varios typed arrays. La búsqueda estática en `apps` no encontró `use cache` ni `cacheComponents`; no se confirmó ese camino | Next 16.4.1 |
| [Next GHSA-p3m5-59mp-jv5r, 14/oct](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r): denegación de servicio en Server Actions | Versión afectada. Requiere App Router con al menos una Server Action. No se encontró `use server` en el código de `apps` revisado; no se certificó el artefacto generado | Next 16.4.1 |
| [Next GHSA-vcvr-r3jv-pc5j, 22/sep](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j): ejecución de código en `next/og` | Next 16.2.9 entra en el rango. `apps/landing` usa `ImageResponse`, pero las dos implementaciones encontradas generan contenido fijo, sin entrada del usuario. El aviso requiere valores controlables en SVG en la implementación Node | Next 16.3.6; la versión 16.4.1 indicada arriba también supera este umbral |
| [axios GHSA-mghh-pgcx-3jjj, 16/sep](https://github.com/axios/axios/security/advisories/GHSA-mghh-pgcx-3jjj): consumo excesivo de CPU al normalizar hosts de redirecciones | axios 1.18.0 afectado. Requiere adaptador HTTP Node, proxy de entorno, `NO_PROXY` no vacío y redirecciones permitidas. Hay usos de axios en backend, pero no se leyeron valores de proxy ni se confirmó una redirección controlable | axios >=1.20.0 |
| [axios GHSA-c29m-xwm3-cm6r, 16/sep](https://github.com/axios/axios/security/advisories/GHSA-c29m-xwm3-cm6r): consumo excesivo de CPU al analizar URL `data:` | axios 1.18.0 afectado. Requiere pasar una URL `data:` no confiable al adaptador Node. No se identificó una entrada pública equivalente en los usos revisados; el timeout de red no protege la fase de análisis | axios >=1.20.0 |
| [axios GHSA-j8rh-479h-cp32, 16/sep](https://github.com/axios/axios/security/advisories/GHSA-j8rh-479h-cp32): cabeceras heredadas tras un interceptor | Versión afectada. Requiere contaminación previa del prototipo en el mismo proceso y un interceptor que sustituya la configuración omitiendo `headers`. No demuestra por sí solo una contaminación de prototipo en esta aplicación | axios >=1.20.0 |

Fuentes adicionales de inventario: [avisos del mantenedor de Next.js](https://github.com/vercel/next.js/security/advisories) y [avisos del mantenedor de axios](https://github.com/axios/axios/security/advisories?state=published), consultados el 26/oct/2026. La tabla prioriza los avisos relevantes encontrados, no pretende enumerar todos los históricos.

Acción propuesta, **no ejecutada**: aprobar un cambio separado que actualice Next y sus paquetes relacionados, verifique sharp efectivo, actualice axios y regenere el lockfile de forma controlada. Repetir tipos, lint, pruebas y aceptación de imágenes/autenticación por aplicación antes de publicar. Las versiones de la tabla son mínimos que corrigen esos avisos, no una afirmación sobre la última versión disponible. Conviene restringir `remotePatterns` a los hosts de imágenes utilizados; ello no sustituye el parche.

## 2. Identidad: separación JWT opcional, no obligatoria

Evidencia de código:

- `apps/backend/src/lib/marketplace-buyer-identity.js`: `MARKETPLACE_BUYER_JWT_SECRET || JWT_SECRET`; permite HS256, comprueba expiración, activación y roles CUSTOMER/BUYER. Su comentario declara compatibilidad con JWT de la tienda.
- `apps/backend/src/lib/marketplace-staff-identity.js`: `MARKETPLACE_STAFF_JWT_SECRET || JWT_SECRET`; restringe roles, rechaza dispositivos y normaliza permisos y alcance. La llamada a `verify` tampoco impone `issuer` ni `audience`.
- `apps/backend/src/routes/auth.routes.js` y `middleware/auth.middleware.js` emiten/verifican los tokens de la tienda con `JWT_SECRET`.
- La identidad global por cookie usa sesiones opacas guardadas por hash y comprobación de origen. Es un mecanismo distinto del puente JWT; no elimina el fallback cuando se usa Bearer.

Riesgo: si no se configuran claves específicas, los contextos comparten confianza criptográfica. Un token válido del otro contexto con los roles y campos admitidos puede ser aceptado por diseño. Esto **no** implica que un comprador pueda inventar un rol de personal: siguen existiendo firma, rol, permisos y alcance. Tampoco se comprobó si las claves desplegadas son iguales o distintas.

Prioridad alta antes de ampliar la red: definir claves independientes para comprador y personal, introducir emisor/destinatario explícitos, retirar el fallback mediante una transición compatible y añadir pruebas de rechazo cruzado de tokens. Las credenciales y revocaciones deben verificarse en el entorno objetivo sin exponer valores. En G8 solo se documenta; no se modifica el contrato de identidad de Claude.

## 3. PIN: caminos revisados y límites reales

| Camino | Protección actual | Pendiente / límite |
| --- | --- | --- |
| Red simple: `marketplace-dispatch.js`, `confirmPickup` / `confirmDelivery` | G3 añade 10 fallos por etapa en ventana de 15 minutos, 429 mientras está bloqueado, comparación de hash y contadores separados. Entradas vacías o mal formadas también consumen intentos. G1 guarda el contador antes de devolver el rechazo | La durabilidad requiere el adaptador PostgreSQL de G1 y su migración; el motor aislado sigue siendo una función sobre un agregado |
| Red multitienda: `marketplace-multistop.js`, `pickup` / `deliver` | Recogida usa el contador de cada tarea; entrega usa un contador del viaje y su PIN grupal. Mismo límite y ventana. G1 persiste ambos agregados | El PIN de entrega multitienda es por viaje, no uno por cada parada. Conserva las restricciones de staging de esta función |
| Reparto propio MANUAL y tienda normal: `store-delivery-pin.js`, consumido por `delivery.routes.js` | Diez fallos por restaurante/pedido en 15 minutos. Marketplace MANUAL exige PIN incluso cuando la tienda normal tiene modo `off`. Personal de tienda conserva su override | `failures` es un `Map` por proceso: reiniciar o repartir tráfico entre procesos reinicia/divide el límite. Requiere contador compartido duradero antes de certificar protección distribuida. Archivo de Claude, no modificado |
| Adaptador legado `marketplace-orders.js`, `transition` | Comprueba identidad del repartidor y el PIN | Verifica `verifyPin` antes de invocar las transiciones protegidas; un PIN erróneo aborta sin sumar contador. Además, cualquier mutación que lance error dentro de su transacción se revierte. Solo se encontraron llamadas de pruebas y exportaciones, sin ruta HTTP montada que lo invoque. Corregir o retirar antes de reutilizar; no se presenta como vía pública explotable |
| Caja / personal de tienda | Override permitido por la regla vigente del proyecto | No es un bypass accidental del nuevo contador de red. Exigir PIN también en caja es una decisión funcional del usuario |

Las respuestas públicas del despacho usan proyecciones y las del reparto propio quitan el pipeline; las pruebas revisadas comprueban ausencia de hashes. Estos hashes usan SHA-256 de un PIN corto: su confidencialidad importa, pues un acceso a la BD permitiría enumeración fuera de línea. El freno HTTP no protege frente a esa lectura; no se encontró una filtración pública en las superficies probadas.

## 4. Verificación de este informe

- **Inspección local:** lockfile, resolutores JWT, rutas de reparto, motores de red y persistencia; sin leer `.env`.
- **Pruebas con mocks/funciones locales:** `node --test` de `marketplace-network-pin.test.cjs`, `marketplace-network-prisma.test.cjs` y `store-delivery-pin.test.cjs`: **35/35**. Cubren bloqueo, separación, desbloqueo, reconstrucción del adaptador, rechazo tras commit y no exposición de hashes.
- **Pruebas de identidad con fixtures:** `marketplace-identity.test.cjs` y `marketplace-staff-identity.test.cjs`: **58/58**. Acreditan los controles existentes, no la eliminación del fallback JWT.
- **Base desechable:** no se ejecutó desde G8. La evidencia de integración PostgreSQL de G1/G7 pertenece a su entrega y no se suma a estas pruebas.
- **Navegador y despliegue:** no se realizaron en G8. Este informe no certifica producción.
- **Revisión React:** aplicada la guía `vercel:react-best-practices` a los cambios de `LocationsSection.tsx`, la página SaaS de marketplace y `HomeScreen.tsx`. Sin defecto bloqueante encontrado en esos cambios: coordenadas controladas con etiquetas y rangos; overview validado con limpieza del efecto y claves estables; pestaña derivada de bandera sin efecto adicional. Mejora opcional: cargar `MarketplaceOffers` de forma diferida, pues ocultar la pestaña evita montarla pero su importación estática permanece en el bundle. No se alteraron esos archivos en G8.

## 5. Orden de cierre propuesto

1. Actualizar Next/sharp/axios mediante cambio autorizado y validar los artefactos que se publicarán.
2. Separar obligatoriamente JWT entre contextos y añadir `issuer`/`audience` con migración de sesiones compatible.
3. Llevar el límite del PIN propio a almacenamiento compartido; probar dos procesos y reinicio. Corregir o retirar el adaptador legado antes de exponerlo. **Actualización 27/oct (Claude):** el límite del PIN propio ya vive en PostgreSQL (`delivery_pin_attempts`, migración `20261027120000`); probado con dos clientes, un proceso nuevo, 30 fallos simultáneos y una transacción deshecha en base desechable. El adaptador legado sigue pendiente.
4. Confirmar en el entorno de aceptación que los rechazos no revelan hashes, los permisos no cruzan comercios y las banderas están en el estado previsto. Mantener separadas la evidencia de mocks, PostgreSQL, navegador y producción.

G8 queda entregado como informe. Las correcciones de dependencias y los cambios de identidad/reparto propio aquí propuestos permanecen pendientes; no se incluyeron silenciosamente en G1–G7.
