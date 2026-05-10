# OTA — Mejoras pendientes

## 1. Reemplazar JWT por shared secret en el workflow de release

**Problema actual:** el workflow `tpv-ota-release.yml` usa un JWT de SUPER_ADMIN
(`OTA_ADMIN_TOKEN` en GitHub Secrets) para autenticarse contra `/api/ota/publish`.
Los JWT del SaaS expiran (7-30 días) → el workflow va a fallar silenciosamente
cuando caduque y nadie se entere hasta el próximo release roto.

**Solución:** aceptar un shared secret estático en `/publish` además del JWT.

### Cambios

1. **Backend** (`apps/backend/src/routes/ota.routes.js`):
   - En `POST /publish`, antes del middleware `authenticate`, chequear si el
     header `X-OTA-Build-Token` viene y coincide con `process.env.OTA_BUILD_SECRET`.
     Si sí, marcar req.user con un actor sintético (`{ role: 'BUILD_BOT' }`)
     y saltar `authenticate`.
   - Mantener `authenticate + requireSuperAdmin` para humanos.

2. **Workflow** (`.github/workflows/tpv-ota-release.yml`):
   - Cambiar `Authorization: Bearer $OTA_ADMIN_TOKEN` por
     `X-OTA-Build-Token: $OTA_BUILD_SECRET`.

3. **Vars de entorno**:
   - Railway backend: `OTA_BUILD_SECRET=<random>`. Generar con `openssl rand -hex 32`.
   - GitHub Secrets: `OTA_BUILD_SECRET=<mismo valor>`.
   - Borrar `OTA_ADMIN_TOKEN` de GitHub Secrets.

### Notas

- El JWT del SaaS sigue siendo necesario para `/bundles` y `/trigger-build`
  porque la UI del dashboard sí necesita identidad de usuario para audit.
- Solo `/publish` es un endpoint de máquina-a-máquina y por eso aplica el
  shared secret.
- Rotar el secret solo si se sospecha compromiso. Sin expiración programada.
