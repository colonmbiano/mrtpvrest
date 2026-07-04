# Playbook de prospección — restaurantes locales

Objetivo: llenar el pipeline de MRTPVREST con restaurantes de tu zona usando
tres activos que ya existen: la lista de Google Maps, el **bot de WhatsApp en
vivo** (la mejor demo posible) y el **caso de estudio con números reales**
(mrtpvrest.com/casos/master-burguers).

Principio rector (la "escalera"): **no vendas todo de un jalón**. El cierre es
siempre el TPV solo (Básico, ~$580 MXN/mes). Cocina, reparto, WhatsApp y tienda
en línea se activan después, cuando la operación del cliente los pida. El bot y
la tienda se usan como *demo y visión*, no como paquete inicial.

---

## Paso 1 — Construir la lista

```bash
GOOGLE_MAPS_API_KEY=xxx node scripts/prospectar-restaurantes.js --ciudad="Toluca, Estado de México"
```

- Usa la **Google Places API (New)** oficial (no scraping: viola ToS de Google
  y las listas se rompen). Necesitas una API key con "Places API (New)"
  habilitada en Google Cloud Console; hay cuota gratuita mensual, una corrida
  default son ~21 requests.
- Sale un CSV ordenado por **score de prospección**: sin sitio web (+2),
  100+ reseñas (+1), con teléfono (+1).
- Giros default: hamburguesas, pizzería, taquería, alitas, mariscos, pollos,
  sushi — donde el caso de Master Burguer's resuena directo. Ajusta con
  `--giros="..."`.

## Paso 2 — Calificar (ICP)

Prospecto ideal: **1 sucursal, dueño-operador, con volumen real**. Señales en
el CSV y qué gancho abre cada una:

| Señal | Gancho de entrada |
|---|---|
| 100+ reseñas, sin sitio web | "Tus clientes ya te buscan en Google y no tienen dónde pedirte en línea" → tienda + WhatsApp |
| Hace delivery propio (moto afuera, lo dice en Maps) | Corte por repartidor + app de reparto sin comisiones |
| Cobra solo efectivo / libreta a la vista | TPV + corte ciego: "cerrar el día cuadrado" |
| Cadena local de 2-3 sucursales | Reportes multi-sucursal desde el celular |

Descarta: franquicias nacionales (deciden en corporativo), negocios con POS
corporativo amarrado, y locales con <20 reseñas sin señales de volumen (no hay
dolor que pagar por resolver).

## Paso 3 — Primer contacto (legal y efectivo)

**Regla dura: nada de WhatsApp en frío masivo.** Dos razones: (a) Meta banea
números por spam — y tu número de ventas es un activo; (b) la LFPDPPP exige
consentimiento para mensajes comerciales. El teléfono del CSV es para
**llamar**; WhatsApp entra solo cuando el prospecto dijo que sí.

El mejor canal es la **visita en horario valle** (10:30–12:30 o 16:00–18:00),
porque la demo cabe en el bolsillo:

> "¿Tú eres el dueño? Te quito 60 segundos. Trabajo con Master Burguer's aquí
> en el Estado de México — sácale tu teléfono y mándale un WhatsApp ahora
> mismo, pide unas papas. [El bot responde en segundos.] Eso que acabas de
> vivir entra directo a su cocina y a su caja. Ellos pasaron de llevar cortes a
> mano a más de 1,000 pedidos al mes en el sistema. Lo que te propongo empieza
> mucho más simple: solo la caja, ~$580 al mes, 14 días gratis sin tarjeta.
> ¿Te muestro 10 minutos ahora o vengo el jueves?"

Guion de llamada: mismo esqueleto, y el cierre es agendar visita ("te lo
enseño funcionando en tu mostrador, son 10 minutos"). En ambos casos, al
despedirte: "¿te mando por WhatsApp el caso con los números?" — ese sí es un
WhatsApp con permiso.

## Paso 4 — Demo de 15 minutos (en su mostrador, con tablet)

Orden pensado para el dueño-operador (dinero primero, juguetes al final):

1. **Cobrar una mesa** en el TPV (rápido, táctil, en español).
2. **Corte ciego** — "tu cajero ya no sabe cuánto 'debería' haber".
3. **KDS**: la comanda aparece sola en cocina, sin papelitos.
4. **Repartidor**: pedido asignado, efectivo conciliado por repartidor.
5. **El bot / tienda en línea** — "esto es lo que viviste hace rato; se
   enciende cuando tú quieras, no hoy".

Cierra con la escalera explícita: "hoy solo caja; cuando cuadres tus cortes,
prendemos cocina; cuando quieras crecer, prendemos WhatsApp y tienda". Trial de
14 días levantado ahí mismo (admin.mrtpvrest.com/register) con su menú básico
cargado — no dejes el registro "de tarea".

## Paso 5 — Cadencia de seguimiento

| Día | Acción |
|---|---|
| D0 | Visita/llamada. Si hubo interés: WhatsApp con link al caso (mrtpvrest.com/casos/master-burguers) |
| D2 | WhatsApp: "¿pudiste ver los números de Master Burguer's? ¿Cuándo te caigo con la tablet?" |
| D7 | Llamada corta. Si tiene trial activo: "¿cómo va tu primer corte?" |
| D14 | Última: "te dejo de molestar — si algún día quieres ordenar la caja, aquí está mi número" (queda opt-in vivo) |

En trial, el onboarding ES la venta: primer corte cuadrado en la semana 1 o el
trial muere. Upsell recién al mes 1–2 (KDS/reparto), nunca en el cierre.

## Métricas semanales

Embudo mínimo en una hoja: **contactados → demos → trials → activos de pago**.
Referencia para arrancar: 40 contactos/semana ≈ 8-10 demos ≈ 3-4 trials ≈ 1-2
clientes. Si demos/contactos < 20%, el problema es el guion o el horario de
visita; si activos/trials < 30%, el problema es el onboarding, no las ventas.

## Pendientes técnicos que apoyan este playbook

- ~~`WHATSAPP_SALES` placeholder~~ → resuelto: número real cableado en
  `apps/landing/lib/links.ts` y en el CTA "Hablar con ventas" del home.
- Confirmar con Master Burguer's el OK para citar la cifra de ventas
  (+$340 mil/mes) que hoy aparece en el caso de estudio.
- Cuando el bot por-tenant (Fase 2 del plan SaaS de WhatsApp) esté listo, la
  demo "pide algo ahora" podrá apuntar a un tenant demo propio en vez del bot
  de un cliente.
