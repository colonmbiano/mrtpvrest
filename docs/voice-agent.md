# Voice Agent (FASE 5)

Guía operativa del agente IA por voz del TPV. Para la lógica y los tool
schemas, ver el docstring de `apps/backend/src/services/voice-agent.service.js`.

## Activación

1. **Env var obligatoria en el backend:**

   ```bash
   ANTHROPIC_API_KEY=sk-ant-...
   ```

   Sin ella, `POST /api/ai/agent` responde `402 AI_KEY_REQUIRED` y el toast
   del admin muestra el mensaje del error.

2. **Modelo (opcional):**

   ```bash
   ANTHROPIC_VOICE_AGENT_MODEL=claude-sonnet-4-6       # default
   # o, para reducir costo por dictado:
   ANTHROPIC_VOICE_AGENT_MODEL=claude-haiku-4-5-20251001
   ```

3. **Dependencia cruzada con FASE 4:** la tool `record_expense` persiste en
   la tabla `expenses` creada por la migración `20260423000000_add_logistics_module`.
   Si esa migración no está aplicada, el agente falla al crear el registro
   con un error de schema.

## Soporte de navegador

El dictado usa `webkitSpeechRecognition` (Web Speech API):

| Navegador | Estado |
|-----------|--------|
| Chrome/Edge desktop | ✅ |
| Safari macOS/iOS | ✅ (requiere interacción del usuario) |
| Firefox | ❌ no implementa la API |
| Android WebView | variable — depende del proveedor |

Si el navegador no lo soporta, el botón flotante muestra un toast "Tu
navegador no soporta dictado por voz". El endpoint backend sigue siendo
utilizable con texto enviado por cualquier otro medio.

## Ejemplos de dictado y tool dispatch

| Dictado | Tool | Efecto |
|---------|------|--------|
| "Gasté 500 pesos en gasolina" | `record_expense` | Crea Expense `{ amount: 500, category: GASOLINA }` |
| "Pagué una refacción de 1200" | `record_expense` | Crea Expense `{ amount: 1200, category: REFACCION }` |
| "Me llegaron 20 kilos de tomate" | `update_stock` | Delta `+20` sobre ingrediente "tomate" |
| "Se consumieron 5 cebollas" | `update_stock` | Delta `-5` sobre "cebolla" |
| "¿Cuánto vendí hoy?" | _(ninguna)_ | Modelo responde en texto pidiendo reformular |

Una sola tool por dictado; si el modelo devuelve varias, sólo se ejecuta la
primera (intencional para evitar acciones encadenadas inesperadas).

## Seguridad

- **`tenantId` siempre del JWT.** Si el body incluye `tenantId` y no coincide
  con el del token, el endpoint responde `403`. No hay path para mutar
  recursos de otro tenant.
- **Autenticación:** middleware estándar `authenticate` + `requireTenantAccess`.
  No requiere `requireAdmin` — cualquier empleado/usuario con tenant válido
  puede dictar; si tu operación necesita restringirlo por rol, envuélvelo.

## Troubleshooting

| Síntoma | Causa probable |
|---------|----------------|
| Toast "Agente de voz no configurado" | Falta `ANTHROPIC_API_KEY` en backend |
| Toast "Permiso de micrófono denegado" | El navegador bloqueó el mic; revisar Settings → Site permissions |
| Toast "No encontré el ingrediente X" | El nombre dictado no matchea ningún `Ingredient.name` (case-insensitive) del tenant |
| Toast "Límite de uso alcanzado" | Rate limit de Anthropic; esperar 1 min o subir plan |
| `Expense` no aparece en la UI | Migración FASE 4 no aplicada, o admin UI no conectada al módulo de gastos |

## Tests

```bash
pnpm --filter @mrtpvrest/backend test __tests__/voice-agent.test.js
```

Cubre: IDOR protection, dispatch de ambas tools, categoría inválida, fallback
sin tool_use y key ausente. Mocks de `axios` + Prisma; no requiere red ni BD.
