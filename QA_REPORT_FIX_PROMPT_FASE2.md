# Prompt para Claude Code — Fix de bugs FASE 2 (sub-pantallas + toggles)

Eres dev senior en MRTPVREST. El primer batch de bugs está en `QA_REPORT_FIX_PROMPT.md` (lee ese primero o asume que ya están abordados). Este archivo agrupa los bugs detectados en la **Fase 2 del QA**: navegación exhaustiva de sub-pantallas, toggles, inputs y dropdowns.

Reglas del CLAUDE.md aplican.

---

## BUG-17 (UI): Panel Central de Configuración no navega tras volver de sub-pantalla

- **Síntoma reproducido:** entrar a Configuración → Apariencia (funciona la primera vez) → volver al Panel Central con back arrow del header → click en cualquier card del Panel Central NO navega. Click en cualquier icono del sidebar tampoco. La card recibe focus visual (borde resaltado) pero el handler no se ejecuta. Solo se "desbloquea" haciendo back de Android al Panel de Operación y entrando de nuevo a Configuración.
- **Causa probable:** misma familia que BUG-4 (overlay residual). Al desmontar la sub-pantalla, queda algún portal/backdrop en el árbol que tapa los click handlers del Panel Central. O el `useEffect` de cleanup de la sub-pantalla restaura un state que bloquea pointer-events.
- **Fix esperado:** auditar componentes/Layouts de `apps/tpv/src/app/configuracion/*` que usen `<Dialog>`, `<Drawer>`, `<Portal>`, modales de Radix/Headless. Asegurar que el unmount es completo (`open` toggleable + cleanup del listener). También revisar si hay un wrapper con `pointer-events: none` que se quede mal.
- **Acceptance:** entrar a cualquier sub-pantalla, volver con back, navegar a otra sub-pantalla — todo el flujo sin recargar.

## BUG-18 (UI): Paleta de acento no se aplica al borde de selección

- **Síntoma reproducido:** en Apariencia, cambiar Paleta de Acento de MIEL a CIAN → el borde de selección de TODAS las cards (TAMAÑO DE LETRA, ANCHO DEL PANEL TICKET, MODO NOCTURNO toggle, sidebar selected, etc.) sigue siendo ámbar (#FFB84D).
- **Causa probable:** variable CSS o color hardcoded en componentes de toggle/card en lugar de leer del theme. Buscar `border-amber`, `#FFB84D`, `border-yellow`, `border-orange` en `apps/tpv/src/components/`.
- **Fix esperado:** parametrizar el accent color por CSS custom property (ej: `--color-accent`) y usarla consistentemente. El cambio de paleta debe actualizar la custom property y propagar a todos los borders/highlights/CTAs.
- **Acceptance:** cambiar paleta de MIEL a CIAN → todos los bordes de selección, badges activos, CTAs primarios cambian a azul cian instantáneamente.

## BUG-19 (UI/incompleto): Modo claro no aplica al sidebar de Configuración

- **Síntoma:** Activar "CAMBIAR A CLARO" en Apariencia → el contenido principal cambia a fondo blanco correctamente, **pero el sidebar de Configuración mantiene el fondo oscuro**. Los iconos quedan en oscuro contra fondo claro general.
- **Status:** la app reconoce el problema con un banner explícito "MODO CLARO EXPERIMENTAL — Algunos componentes... se quedan oscuros". Banner es buen UX, pero el bug sigue siendo bug.
- **Fix esperado:** auditar `apps/tpv/src/app/configuracion/layout.tsx` (o equivalente) y los componentes del sidebar. Sustituir clases `bg-zinc-900`/`bg-black` hardcoded por tokens del theme (ej: `bg-surface` que respondan al modo).
- **Acceptance:** modo claro activo → toda la pantalla (incluido sidebar de Config y nav del Panel de Operación) usa colores claros consistentes.

## BUG-20 (UI menor): Toggle "AMPLIO" en Ancho Panel Ticket no responde

- **Síntoma:** En Apariencia → ANCHO DEL PANEL TICKET, click en "AMPLIO 440px" no cambia la selección. MEDIO 380px sigue activo.
- **Repro:** 100% en este test, 1 click intentado. Posible: handler del segmento "AMPLIO" no está conectado, o coordenada cae fuera del hit area.
- **Fix esperado:** verificar el componente del segmented control de `ANCHO DEL PANEL TICKET`. Si los 3 segmentos comparten un map, asegurar que las 3 opciones tengan handler. Probar con click test en e2e.

## BUG-21 (UI): Toggle "PIN para abrir cajón" no responde en Seguridad

- **Síntoma:** Configuración → Seguridad → toggle "PIN para abrir cajón" (off por defecto). Dos clicks consecutivos, el checkbox sigue vacío.
- **Repro:** 100% en 2 intentos.
- **Causa probable:** handler del toggle 4 falta o el hit area está reducido. Los toggles 1, 2, 3 (anular, reembolsos, cancelar) estaban ON al entrar — no comprobé si responden a unclick, pero el #4 claramente no responde a click.
- **Fix esperado:** auditar el componente que renderiza los 4 toggles. Si vienen de un `.map(items, ...)`, asegurar que el handler se pasa correctamente al item "abrir cajón". Comprobar también si hay un `disabled` mal aplicado.

## Hallazgos OK (no bugs) detectados durante la auditoría exhaustiva

- **Apariencia → Tamaño Letra:** cambio de CHICO/MEDIANO/GRANDE aplica al instante a todo el layout, sin requerir Guardar. Excelente UX.
- **Apariencia → Modo Nocturno:** banner "MODO CLARO EXPERIMENTAL" con copy honesto y útil. El toggle se invierte ("Cambiar a Claro" ↔ "Cambiar a Nocturno") al cambiar estado.
- **Pagos → Vales de despensa:** toggle funciona correctamente, persiste visualmente.


