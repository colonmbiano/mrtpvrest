# Motor de promociones por sucursal: Regla del Dueno

Motor local en `apps/backend/src/lib/promo-engine.js`, con dos operaciones:
`analyzeLocationSales` calcula recomendaciones sin efectos y `applyAutoPromos`
coordina escrituras mediante un adaptador inyectado. Ninguna importa Prisma,
credenciales, clientes de IA, el servidor o el job existente. No se registra cron.

## Analisis de ventas

```js
const { analyzeLocationSales, applyAutoPromos } = require('./promo-engine');

const recommendations = analyzeLocationSales({
  locationId: 'sucursal-centro',
  salesHistory: [
    { locationId: 'sucursal-centro', menuItemId: 'taco', quantity: 2, price: 100 },
    { locationId: 'sucursal-centro', menuItemId: 'taco', quantity: 3, price: 100 },
    { locationId: 'otra-sucursal', menuItemId: 'taco', quantity: 50, price: 120 },
  ],
  thresholdUnits: 10,
  discountPercent: 15,
  activeDays: ['FRIDAY', 'SATURDAY'],
});
// Una recomendacion: taco, 5 unidades en sucursal-centro, promoPrice: 85.
```

`salesHistory` es un array plano de filas con sucursal explicita. El llamador
selecciona el periodo de analisis y las ventas elegibles; el motor no consulta
fechas actuales ni decide si una orden cancelada/reembolsada cuenta como venta.
Cada `quantity` representa unidades enteras no negativas; no se interpreta como
kilogramos ni se deducen unidades desde importes monetarios.

`price` es un snapshot del **precio regular actual** del articulo en esa sucursal,
no el precio historico efectivamente cobrado. Todas las filas del mismo par
`(locationId, menuItemId)` deben coincidir en ese precio; de lo contrario se
rechaza el analisis con `INCONSISTENT_PRICE`. El adaptador de lectura debe unir
las ventas con el precio regular vigente antes de construir estas filas.

Reglas:

- `locationId` y los IDs de articulo deben ser strings no vacios, sin espacios
  exteriores. Cada fila necesita `locationId`; se rechazan datos sin alcance.
- Solo se agrupan filas de la sucursal solicitada. Las demas no alteran ni las
  unidades ni el precio, descuento o umbral de esta sucursal. Sus campos de ventas
  no se validan como si fueran datos de la sucursal actual.
- `thresholdUnits` es entero seguro no negativo. Recomendar exige
  `unitsSold < thresholdUnits`; igualdad no califica. Umbral cero no recomienda.
- Para identificar articulos sin ventas, el llamador debe incluir una fila de
  catalogo con `quantity: 0`. Una lista vacia no permite inventar articulos.
- El descuento del dueno es finito, estrictamente mayor que 0 y menor que 100.
  No se usan defaults silenciosos para umbral o descuento. Estos limites conservan
  la regla existente de precios: `0 < promoPrice < price`.
- `activeDays` admite `MONDAY` a `SUNDAY` en mayusculas. Se deduplica y ordena
  por semana sin modificar el array original. Ausente o `[]` significa todos
  los dias, consistente con el criterio de promociones existente.
- Se calcula `price * (1 - discountPercent / 100)` interpretando ambos numeros
  como decimales y usando cocientes `BigInt`. El unico redondeo es **half up** a
  centavos al final: `1.50` con `33%` resulta en `1.01`, no `1.00`.
- Un resultado redondeado igual al precio regular o igual a cero no produce
  recomendacion. Se rechazan precios no positivos, no finitos y fuera del rango
  seguro de centavos, y sumas de unidades que excedan enteros seguros de JS.

Cada recomendacion incluye `locationId`, `menuItemId`, `unitsSold`,
`thresholdUnits`, `price`, `discountPercent`, `promoPrice` y `activeDays`.
El resultado se ordena por ID de articulo y se congela junto con sus registros
y dias. Los objetos del llamador no se modifican ni se congelan.

## Aplicacion y contrato del adaptador

```js
const result = await applyAutoPromos({ locationId, recommendations, adapter });
// { locationId, applied: [...], skipped: [...] }
```

El adaptador debe implementar exactamente dos operaciones:

### getLocationItems({ locationId, menuItemIds })

Lee en lote snapshots de los articulos solicitados **en esa ubicacion**:

```js
{
  locationId: 'sucursal-centro', menuItemId: 'taco', price: 100,
  isPromo: false, promoSource: null, promoPrice: null,
  activeDays: [], version: 0,
}
```

`version` es un entero seguro por par sucursal/articulo. `promoSource` distingue
`AUTO` de `MANUAL`; si existe una promocion activa sin procedencia reconocida,
el motor la protege conservadoramente como manual. Toda promocion manual marcada
`isPromo: true` se protege, incluso si su agenda no incluye hoy o todavia no comienza.
Una promocion manual desactivada con `isPromo: false` no bloquea una nueva automatica.

### compareAndSetLocationPromo({ where, data })

Realiza **una unica escritura atomica condicional** por sucursal/articulo:

```js
{
  where: {
    locationId, menuItemId, version: observedVersion,
    price: observedPrice, isPromo: observedIsPromo, promoSource: observedSource,
  },
  data: {
    isPromo: true, promoPrice, activeDays,
    promoSource: 'AUTO', version: observedVersion + 1,
  },
}
```

Devuelve `{ count: 1 }` al aplicar o `{ count: 0 }` ante conflicto. No se permite
un update sin filtro de ubicacion ni leer y luego escribir sin volver a comprobar
la condicion atomicamente. Todos los escritores deben avanzar la version y
registrar el origen de la promocion. El filtro tambien compara precio, flag y
origen para proteger una promocion manual creada entre la lectura y la escritura.
El adaptador debe interpretar la procedencia ausente de un registro como `null`.

El motor valida **todo** el lote de recomendaciones antes de leer: mezclar una
recomendacion ajena, duplicar un articulo, alterar el precio promocional calculado
o dejar de cumplir el umbral rechaza la operacion. Tambien valida todos los
snapshots antes de la primera escritura: no admite filas ajenas, no solicitadas,
duplicadas o sin version/estado validos. Solo envia los campos promocionales
permitidos; no sobrescribe descripciones ni modifica los snapshots leidos.

Si el precio regular cambio desde el analisis, se requiere un nuevo analisis.
No se recalcula silenciosamente una regla vieja. Una promocion automatica identica
se omite para evitar escrituras y cambios de version innecesarios. Las existentes
con origen `AUTO` pueden actualizarse con los nuevos dias/descuento del dueno.

Los resultados y sus arrays/registros son inmutables. `applied` contiene la
identidad local y los valores aplicados; `skipped` contiene un motivo:

| Motivo | Resultado |
| --- | --- |
| `MANUAL_PROMO` | Se conserva la promocion manual o de origen desconocido. |
| `NOT_FOUND` | No hay snapshot para ese articulo en esa sucursal. |
| `PRICE_CHANGED` | El precio ya no coincide con el del analisis. |
| `UNCHANGED` | La misma automatica ya estaba aplicada. |
| `CONFLICT` | La comparacion atomica no actualizo ninguna fila. |

No hay reintentos internos. Fallos del adaptador se propagan; un lote **no es una
transaccion global**. Si falla una escritura posterior, las previas confirmadas
pueden haber ocurrido. El llamador debe reconciliar o usar un adaptador ligado a
una transaccion si necesita atomicidad de lote. Un conteo mayor a uno se rechaza
como violacion del contrato; el motor no puede deshacer una escritura incorrecta
de un adaptador que no respete el alcance.

## Aislamiento e integracion futura

El esquema actual guarda `MenuItem.isPromo/promoPrice/activeDays` globalmente por
restaurante. `autoPromos.job.js` suma umbrales y ventas entre sucursales antes de
escribir esos campos. **Ese job no usa este motor y no se modifico ni activo.**

No se entrega un adaptador Prisma que simule aislamiento sobre `MenuItem`: antes
de conectar persistencia real se necesita un almacenamiento de overrides por
ubicacion y articulo, con version/origen y lectura efectiva en catalogo/cobro.
Ese adaptador debe verificar ademas que la sucursal pertenece al tenant autorizado
del dueno. El motor puro no autentica usuarios ni aprovisiona ese almacenamiento.

La aplicacion solo activa/actualiza las recomendaciones recibidas. No elimina
promociones manuales ni desactiva automaticamente articulos que dejaron de estar
bajo el umbral. Antiguedad del articulo, limites de cantidad de promos y seleccion
del periodo son politicas de entrada futuras; no se agregaron parametros ocultos.

No se crearon modelos, rutas, jobs, migraciones ni tareas programadas. Tampoco se
modificaron el job existente, el esquema, los entornos o las dependencias.

## Pruebas offline

```powershell
node apps/backend/scripts/promo-engine.test.cjs
```

Resultado: **29 pruebas, 29 PASS, 0 FAIL, 0 omitidas**. Se ejecuta el modulo real
con Node y un adaptador simulado que aplica el filtro CAS completo. No se importa
Prisma, el servidor ni el job, y no se llama a una BD o servicio.

Casos: calculo y redondeo decimal, umbral exacto, ventas cero, entradas invalidas,
inmutabilidad, precios contradictorios, sucursales independientes con el mismo ID,
promociones manuales vigentes/programadas, carreras entre lectura y escritura,
versiones, idempotencia, resultados ajenos del adaptador, errores y efectos
parciales de lote. El 100% corresponde a los casos ejecutados, no a una medicion
de cobertura de lineas ni a una integracion de BD real.
