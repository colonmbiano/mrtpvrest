#!/usr/bin/env python3
"""Deriva el icono cuadrado de la app a partir del logo horizontal de marca.

Por que existe: `.gitignore` bloquea `*.png`, asi que el master de 1024px NO se
versiona. Lo unico que llega al repo es `icons/icon.ico` (y el `.icns`). Este
script reconstruye el master desde `public/mrtpv-logo.png` — que si esta
versionado — para que el set de iconos sea regenerable.

El logo de marca es horizontal (~2.1:1) e incluye lineas de velocidad a la
izquierda del monograma. A 16px de la barra de tareas esas lineas se funden en
una mancha naranja y matan la legibilidad, asi que el icono usa solo el lockup
"VR". Las lineas son componentes conexas separadas del monograma, de modo que se
recortan por etiquetado y no por un corte en x fijo (un corte fijo dejaba
munones de trazo visibles a 48px).

Uso:
    python scripts/build-icon.py            # escribe icons/icon-source.png
    pnpm tauri icon icons/icon-source.png   # genera .ico / .icns / PNGs
"""

from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public" / "mrtpv-logo.png"
OUT = ROOT / "src-tauri" / "icons" / "icon-source.png"

SIZE = 1024
PADDING = 0.10  # margen alrededor del monograma, como fraccion del lienzo
TOLERANCE = 90  # distancia de color (suma de canales) para separar figura de fondo
SPEED_LINES_CUTOFF = 0.125  # fraccion del ancho: todo lo que nace antes es linea de velocidad
WORDMARK_GAP = 15  # columnas vacias seguidas que marcan el fin del monograma
NOISE_FLOOR = 30  # distancia de color por debajo de la cual se aplana a fondo exacto


def load_mark():
    """Devuelve (imagen sin lineas de velocidad, bbox del monograma)."""
    im = Image.open(SRC).convert("RGBA")
    w, h = im.size
    px = im.load()
    bg = px[2, 2][:3]

    def is_figure(p):
        return sum(abs(a - b) for a, b in zip(p[:3], bg)) > TOLERANCE

    mask = [[is_figure(px[x, y]) for y in range(h)] for x in range(w)]
    seen = [[False] * h for _ in range(w)]

    # El logo es "monograma + wordmark". Solo queremos el monograma, asi que
    # cortamos en el primer hueco vertical ancho: es el aire que separa la marca
    # del texto "MRTPV Retail". Buscarlo evita fijar un x magico que se romperia
    # si el logo cambia de proporciones.
    occupied = [any(mask[x][y] for y in range(h)) for x in range(w)]
    mark_end, gap, started = w, 0, False
    for x in range(w):
        if occupied[x]:
            started, gap = True, 0
        elif started:
            gap += 1
            if gap >= WORDMARK_GAP:
                mark_end = x - gap + 1
                break
    if mark_end >= w:
        raise SystemExit("No se encontro el hueco entre monograma y wordmark")

    clean = im.copy()
    cpx = clean.load()
    keep = []  # bboxes de los componentes que forman el monograma

    for sx in range(mark_end):
        for sy in range(h):
            if not mask[sx][sy] or seen[sx][sy]:
                continue
            queue = deque([(sx, sy)])
            seen[sx][sy] = True
            pts = []
            while queue:
                x, y = queue.popleft()
                pts.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and mask[nx][ny] and not seen[nx][ny]:
                        seen[nx][ny] = True
                        queue.append((nx, ny))

            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            # Las lineas de velocidad son las componentes que nacen pegadas al
            # borde izquierdo; el monograma arranca en la "V". La regla es
            # posicional a proposito: separarlas por altura de trazo NO funciona
            # (la V mide 93px y las lineas 89px, y la pieza blanca baja de la R
            # mide 47px, asi que un umbral de altura mutila el monograma).
            if min(xs) < w * SPEED_LINES_CUTOFF:
                for x, y in pts:
                    cpx[x, y] = (bg[0], bg[1], bg[2], 255)
            else:
                keep.append((min(xs), min(ys), max(xs) + 1, max(ys) + 1))

    if not keep:
        raise SystemExit("No se encontro el monograma en el logo de origen")

    box = (
        min(b[0] for b in keep),
        min(b[1] for b in keep),
        max(b[2] for b in keep),
        max(b[3] for b in keep),
    )
    return clean, box, bg


def main():
    clean, box, bg = load_mark()
    mark = clean.crop(box)

    canvas = Image.new("RGBA", (SIZE, SIZE), (bg[0], bg[1], bg[2], 255))
    avail = int(SIZE * (1 - 2 * PADDING))
    ratio = min(avail / mark.width, avail / mark.height)
    scaled = mark.resize(
        (max(1, int(mark.width * ratio)), max(1, int(mark.height * ratio))),
        Image.LANCZOS,
    )
    canvas.paste(scaled, ((SIZE - scaled.width) // 2, (SIZE - scaled.height) // 2), scaled)

    # El logo de origen trae artefactos de compresion: ~12% del lienzo quedaba
    # como negro "casi" puro, lo que se ve moteado en el icono de 256px e infla
    # el .ico. El umbral es bajo a proposito para no tocar el antialias del
    # borde del monograma, que cae muy por encima de el.
    cpx = canvas.load()
    for y in range(SIZE):
        for x in range(SIZE):
            r, g, b, a = cpx[x, y]
            if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) <= NOISE_FLOOR:
                cpx[x, y] = (bg[0], bg[1], bg[2], a)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUT)
    print(f"{OUT.relative_to(ROOT)}  {canvas.size[0]}x{canvas.size[1]}  (monograma {box})")


if __name__ == "__main__":
    main()
