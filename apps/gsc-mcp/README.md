# Google Search Console MCP

Servidor MCP local para consultar Google Search Console desde Claude Code.

## Requisitos

1. Habilitar la API "Google Search Console API" en Google Cloud.
2. Crear una cuenta de servicio y guardar su clave JSON fuera del repo, por ejemplo:
   `C:/Users/colon/keys/gsc-mcp.json`.
3. Agregar el `client_email` de esa cuenta como usuario de la propiedad en Search Console.
   Para enviar sitemaps, usa permiso de propietario.

## Configuracion

El proyecto ya incluye `.mcp.json` apuntando a este servidor:

```json
{
  "mcpServers": {
    "gsc": {
      "command": "node",
      "args": ["C:/Users/colon/Downloads/mrtpvrest/apps/gsc-mcp/src/server.js"],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "C:/Users/colon/keys/gsc-mcp.json",
        "GSC_SITE_URL": "sc-domain:mrtpvrest.com"
      }
    }
  }
}
```

Si tu propiedad de Search Console es de prefijo de URL, cambia `GSC_SITE_URL` a
`https://mrtpvrest.com/`.

## Tools

- `gsc_sites`: lista propiedades visibles.
- `gsc_performance`: consulta clics, impresiones, CTR y posicion.
- `gsc_inspect_url`: inspecciona indexacion de una URL.
- `gsc_submit_sitemap`: envia un sitemap.
- `gsc_list_sitemaps`: lista sitemaps registrados.

## Prueba rapida

```powershell
pnpm --filter @mrtpvrest/gsc-mcp start
```

En Claude Code, reinicia el host MCP y prueba: "Lista mis propiedades de Search Console".
