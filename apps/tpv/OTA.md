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
   OTA_BUCKET=tpv-ota                 # opcional, default 'tpv-ota'
   GITHUB_TOKEN=<PAT con scope workflow>
   GITHUB_REPO=colonmbiano/mrtpvrest   # owner/repo
   ```
   La `service_role_key` se saca de Supabase → Project Settings → API → `service_role` (NO la `anon`).
   El PAT se genera en https://github.com/settings/tokens — solo necesita scope `workflow`.
3. **GitHub Secrets** (Settings → Secrets → Actions del repo):
   - `OTA_ADMIN_TOKEN` — JWT de un usuario SUPER_ADMIN del backend (login en admin → DevTools → localStorage `token`).
4. **Aplicar migración Prisma** — automático en el próximo deploy del backend (el `Dockerfile` corre `prisma migrate deploy`).
5. **Reinstalar el APK del TPV** una vez para que el plugin Capgo nativo quede activo. Después de eso, todos los updates van por OTA.

## Publicar nueva versión

### Opción A — Automático (recomendado)

Cualquier `git push` a `master` que toque `apps/tpv/**` dispara el workflow
`.github/workflows/tpv-ota-release.yml` que builda + zipea + publica solo.
**Cero intervención.**

Versionado: `MAJOR.MINOR` viene de `apps/tpv/package.json`, `PATCH` =
cantidad de commits que han tocado `apps/tpv/`. Resultado: monotónico
(ej. `0.1.42`) sin commit-back loops.

### Opción B — Desde el SaaS

1. https://saas.mrtpvrest.com → **TPV Updates** (sidebar).
2. Selecciona canal (production / beta / dev).
3. Click **"Publicar versión ahora"** → escribe notas opcionales.
4. El backend dispara el mismo workflow vía `workflow_dispatch`.
5. Tarda 3-5 min. Refresca la tabla para ver el bundle nuevo activo.

### Opción C — Local (CLI, fallback)

```powershell
$env:OTA_ADMIN_TOKEN="<jwt>"
pnpm --filter @mrtpvrest/tpv ota:release --notes "Fix botón delivery"
```

Los TPVs recogen el update en el próximo `/check` (al abrir la app o reiniciarla).

## Channels

- `production` — default. Todos los TPVs.
- `beta`, `dev`, etc. — si más adelante se quiere targetear sucursales específicas, configurar `defaultChannel` distinto en `capacitor.config.ts` antes de armar el APK. Cada APK queda atado a su channel.

## Rollback

Desde el SaaS → **TPV Updates** → click **Rollback** en cualquier versión activa.
Se desactiva al instante; los TPVs vuelven a la anterior activa en el siguiente check.

Alternativa CLI:

```bash
curl -X DELETE -H "Authorization: Bearer $TOKEN" https://api.mrtpvrest.com/api/ota/bundles/<id>
```

## Limitaciones

OTA solo actualiza el bundle web (`out/`). Cambios que requieren código nativo (nuevos plugins de Capacitor, permisos Android, splash, ícono, versionCode/versionName del APK) **siguen necesitando rebuild + reinstall del APK**.
