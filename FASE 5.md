# Arquitectura MRTPVREST - Fase 5: Agente IA TPV

**Rol:** AI Integration Specialist & Next.js Backend Developer.
**Objetivo:** Crear un endpoint de API que reciba texto natural (dictado por voz en el frontend) y lo convierta en operaciones estructuradas de base de datos.

## Paso 1: Endpoint del Agente (`apps/admin/api/agent/route.ts`)
1. Crea una Route Handler POST que reciba un objeto JSON con `{ prompt: string, tenantId: string }`.
2. Configura el SDK de OpenAI o Anthropic (usando variables de entorno).

## Paso 2: System Prompt y Functions (Tool Calling)
1. Escribe un System Prompt: "Eres el asistente del restaurante. Analiza el texto del dueño y decide qué acción ejecutar."
2. Define herramientas (Tool Calling) que el LLM pueda usar:
   - `record_expense(amount, category, description)`
   - `update_stock(ingredient, quantity)`
3. Parsea la respuesta del LLM y ejecuta la mutación correspondiente en Prisma usando el `tenantId`.

## Paso 3: Frontend del Asistente
1. En el dashboard de `apps/admin`, añade un botón flotante con un ícono de micrófono.
2. Al presionarlo (usando la Web Speech API para transcribir) envía el texto al endpoint `/api/agent`.
3. Muestra notificaciones tipo toast ("Gasto de $500 en Gasolina registrado exitosamente").