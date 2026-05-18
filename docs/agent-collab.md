# Flujo de colaboracion entre agentes

Usa esto cuando Codex y Antigravity trabajen en el mismo repo.

## Paso 1: Revisar el repo

```bash
pnpm agent status
```

Esto muestra branch, archivos cambiados, areas detectadas, commits recientes y los checks mas probables.

## Paso 2: Empezar una tarea enfocada

```bash
pnpm agent start --agent Codex --task "Fix TPV dine-in payment flow"
```

Cambia `Codex` por `Antigravity` cuando ese agente tome la tarea. El comando escribe `scratch/agent-handoff.md`.

## Paso 3: Trabajar en una zona a la vez

Buenas divisiones:

- Codex: review, tests, backend routes, data flow, cleanup.
- Antigravity: UI implementation, browser validation, large component edits.
- Either agent: small full-stack bug fixes, as long as the handoff file is current.

Evita que ambos agentes editen los mismos archivos al mismo tiempo.

## Paso 4: Pasar contexto claramente

```bash
pnpm agent handoff --agent Codex --notes "Updated ticket totals. Next agent should run TPV tests and check split payment UI."
```

El siguiente agente debe leer `scratch/agent-handoff.md` antes de cambiar archivos.

## Paso 5: Verificar antes de publicar

```bash
pnpm agent verify
```

Cuando ya quieras correr los comandos sugeridos:

```bash
pnpm agent verify --run
```

Para cambios riesgosos, corre tambien el comando especifico de la app, por ejemplo:

```bash
pnpm --filter @mrtpvrest/tpv build
pnpm --filter @mrtpvrest/backend test
pnpm run test:e2e
```
