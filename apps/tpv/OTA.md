# OTA Updates — TPV

Live updates del bundle web del TPV vía `@capgo/capacitor-updater`, self-hosted en `api.mrtpvrest.com`. Permite cambios en pantallas, lógica web y CSS sin reinstalar el APK.

## Arquitectura

```
TPV (Tab 8)                 Backend Railway              Supabase Storage
    │                              │                            │
    │ POST /api/ota/check ────────►│                            │
    │ {app_id, version_name, ch}   │                            │
    │◄─ {} (sin update)            │                            │
    │   o {version, url, checksum} │                            │
    │                              │                            │
    │ GET signedUrl ────────────────────────────────────────────►│
    │◄─ bundle.zip ──────────────────────────────────────────── │
    │                              │                            │
    │ [aplica en próximo arranque] │                            │
```

## Estrategia

`autoUpdate: true` + `directUpdate: false` → el plugin descarga en background sin interrumpir al cajero. Aplica el bundle al siguiente arranque del APK. Si el bundle nuevo no llama `notifyAppReady()` en 10s (porque crashea), revierte automáticamente al anterior.

## Setup inicial (una sola vez)

1. **Crear bucket en Supabase Storage**:
   - Dashboard → Storage → New bucket → nombre `tpv-ota` → Privado.
2. **Vars de entorno en Railway** (servicio backend):
   ```
   SUPABASE_URL=https://<proyecto>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
   OTA_BUCKET=tpv-ota   # opcional, default 'tpv-ota'
   ```
   La `service_role_key` se saca de Supabase → Project Settings → API → `service_role` (NO la `anon`).
3. **Aplicar migración Prisma** — automático en el próximo deploy del backend (el `Dockerfile` corre `prisma migrate deploy`).
4. **Reinstalar el APK del TPV** una vez para que el plugin Capgo nativo quede activo. Después de eso, todos los updates van por OTA.

## Publicar nueva versión

```powershell
# 1. Bumpear version en apps/tpv/package.json (ej. 0.1.0 → 0.1.1)
# 2. Login en https://admin.mrtpvrest.com como SUPER_ADMIN, copiar token
$env:OTA_ADMIN_TOKEN="<jwt>"
pnpm --filter @mrtpvrest/tpv ota:release --notes "Fix botón delivery"
```

El script:
- Corre `next build` (con `CAPACITOR_BUILD=true`)
- Empaqueta `out/` en zip
- Sube a Supabase Storage y registra en BD vía `POST /api/ota/publish`

Los TPVs lo recogen en el próximo `/check` (al abrir la app o reiniciarla).

## Channels

- `production` — default. Todos los TPVs.
- `beta`, `dev`, etc. — si más adelante se quiere targetear sucursales específicas, configurar `defaultChannel` distinto en `capacitor.config.ts` antes de armar el APK. Cada APK queda atado a su channel.

## Rollback

```bash
# Listar bundles
curl -H "Authorization: Bearer $TOKEN" https://api.mrtpvrest.com/api/ota/bundles

# Desactivar uno (los TPVs vuelven al anterior activo en el siguiente check)
curl -X DELETE -H "Authorization: Bearer $TOKEN" https://api.mrtpvrest.com/api/ota/bundles/<id>
```

## Limitaciones

OTA solo actualiza el bundle web (`out/`). Cambios que requieren código nativo (nuevos plugins de Capacitor, permisos Android, splash, ícono, versionCode/versionName del APK) **siguen necesitando rebuild + reinstall del APK**.
