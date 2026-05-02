# Halo Design System - Configuración y Estilo

Este documento almacena la configuración de diseño visual del sistema "Halo" aplicado al TPV de Master Burger's (mrtpvrest). Úsalo como referencia al crear nuevas pantallas o componentes para mantener la consistencia visual en el archivo `.pen`.

## 1. Fondo Global y Tema

Todas las pantallas deben usar el tema oscuro para asegurar un alto contraste y un aspecto premium.

- **Fondo Base (Fill):** `#0C0C0E`
- **Theme (Tema):** `{"Mode": "Dark", "c:Mode": "Dark"}`

## 2. Destellos / Glows (Mesh Gradients)

Para lograr la profundidad característica del sistema Halo, se deben incluir sutiles destellos radiales en formato absoluto (`layoutPosition: "absolute"`). Generalmente se colocan en el fondo (index 0 y 1).

### Glow Naranja (Superior Izquierdo)
- **Type:** `ellipse`
- **Size:** `800x800` (ajustar en base al tamaño de pantalla)
- **Position (x, y):** `-200, -200`
- **Gradient Fill:**
  - `gradientType: "radial"`
  - `size: { width: 1, height: 1 }`
  - `colors: [{ color: "#FF840030", position: 0 }, { color: "#FF840000", position: 1 }]`

### Glow Verde Esmeralda (Inferior Derecho)
- **Type:** `ellipse`
- **Size:** `900x900` (ajustar en base al tamaño de pantalla)
- **Position (x, y):** `1320, 600` (ajustar según el ancho, e.g., ancho de pantalla - 400)
- **Gradient Fill:**
  - `gradientType: "radial"`
  - `size: { width: 1, height: 1 }`
  - `colors: [{ color: "#88D66C20", position: 0 }, { color: "#88D66C00", position: 1 }]`

## 3. Tarjetas, Paneles y Numpads

- **Fondo de Tarjeta (Fill):** `$--card` o `#1A1A1A` / `#1A182E`.
- **Bordes Redondeados (Corner Radius):** 
  - Tarjetas grandes: `24px`
  - Botones redondos (Numpad): `50%` del ancho/alto (ej. para 120x120, `cornerRadius: 60`).
  - Inputs / Dropdowns: `12px`
- **Padding:** Amplio, e.g., `[16, 20]` para inputs, `32px` a `48px` para modales y contenedores principales.

## 4. Tipografía y Texto

- **Títulos y Textos Prominentes:** `JetBrains Mono` (`$--font-primary`). Pesos semibold (`600`) o bold.
- **Textos Secundarios:** `Geist` o `Inter` (`$--font-secondary`).
- **Color Texto Principal:** `$--foreground` (Blanco / Claro).
- **Color Texto Secundario/Instruccional:** `$--muted-foreground` (Gris).

## 5. Acentos de Color y Estados

- **Acento Principal (Primary):** Naranja (`#FF8400`) o Azul (dependiendo del contexto del botón). Usa `$--primary`.
- **Éxito (Success):** `$--color-success` (fondo sutil verde) y `$--color-success-foreground` (texto/icono verde vibrante). Se usa en indicadores de estado como "Terminal Vinculada".
- **Botones Accionables Prominentes:** `fill: "#2563EB"` (Azul clásico) con texto blanco para CTAs (Call to Action) principales como "Vincular Dispositivo".

## Instrucciones para Pen (Pencil MCP)

Al aplicar esto a un nodo existente mediante operaciones (`batch_design`), el flujo es el siguiente:

```javascript
// 1. Configurar contenedor padre
U("ID_DEL_CONTENEDOR", { fill: "#0C0C0E", theme: { "Mode": "Dark", "c:Mode": "Dark" } })

// 2. Insertar destellos absolutos
bg1 = I("ID_DEL_CONTENEDOR", { type: "ellipse", name: "bgGlow1", layoutPosition: "absolute", x: -200, y: -200, width: 800, height: 800, fill: { type: "gradient", gradientType: "radial", size: { width: 1, height: 1 }, colors: [{ color: "#FF840030", position: 0 }, { color: "#FF840000", position: 1 }] } })
bg2 = I("ID_DEL_CONTENEDOR", { type: "ellipse", name: "bgGlow2", layoutPosition: "absolute", x: 1320, y: 600, width: 900, height: 900, fill: { type: "gradient", gradientType: "radial", size: { width: 1, height: 1 }, colors: [{ color: "#88D66C20", position: 0 }, { color: "#88D66C00", position: 1 }] } })

// 3. Mover al fondo (z-index 0 y 1)
M(bg1, "ID_DEL_CONTENEDOR", 0)
M(bg2, "ID_DEL_CONTENEDOR", 1)
```
