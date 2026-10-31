"""Regenera el manual público. Requiere Python 3 y reportlab.
Uso desde la raíz: python3 docs/manuales/generar_manual.py
Los ejemplos son ficticios; nunca exportar datos de restaurantes a este archivo.
"""
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.pagesizes import A4

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'apps/admin/public/manuales/manual-costeo-recetas.pdf'
OUT.parent.mkdir(parents=True, exist_ok=True)
NAVY = colors.HexColor('#0f172a')
GREEN = colors.HexColor('#15803d')
MUTED = colors.HexColor('#475569')
STYLES = {
 'title': ParagraphStyle('title', fontName='Helvetica-Bold',fontSize=29,leading=33,textColor=NAVY,spaceAfter=18),
 'h2': ParagraphStyle('h2',fontName='Helvetica-Bold',fontSize=14,leading=18,textColor=GREEN,spaceBefore=14,spaceAfter=7),
 'body': ParagraphStyle('body',fontName='Helvetica',fontSize=10.5,leading=15.4,textColor=NAVY,spaceAfter=9),
 'small': ParagraphStyle('small',fontName='Helvetica',fontSize=9,leading=12.5,textColor=MUTED,spaceAfter=6),
 'cell': ParagraphStyle('cell',fontName='Helvetica',fontSize=9.3,leading=13,textColor=NAVY),
 'head': ParagraphStyle('head',fontName='Helvetica-Bold',fontSize=9.3,leading=13,textColor=colors.white),
}
story=[]
source=['# MRTPVREST | Manual de costeo de recetas', '', 'Versión 1.0 · 5 de octubre de 2026', '', 'Ejemplos ficticios. Importes expresados en pesos; adapte la moneda y las condiciones de su negocio.', '']
def p(text,style='body'):
 story.append(Paragraph(escape(text),STYLES[style])); source.extend([text,''])
def h(text): p(text,'h2')
def table(headers, rows, widths):
 cells=[[Paragraph(escape(str(c)),STYLES['head']) for c in headers]]
 cells += [[Paragraph(escape(str(c)),STYLES['cell']) for c in row] for row in rows]
 t=Table(cells,colWidths=widths,repeatRows=1,hAlign='LEFT')
 t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),NAVY),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.HexColor('#f1f5f9'),colors.white]),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),('LINEBELOW',(0,-1),(-1,-1),.5,colors.HexColor('#cbd5e1'))]))
 story.extend([t,Spacer(1,10)])
 source.extend(['| '+' | '.join(headers)+' |','| '+' | '.join(['---']*len(headers))+' |'])
 source.extend('| '+' | '.join(map(str,row))+' |' for row in rows); source.append('')
def page(n,title,subtitle):
 if story: story.append(PageBreak())
 p(f'GUÍA OPERATIVA / {n:02d}', 'small'); p(title,'title'); p(subtitle,'small')
 source.append('')

page(1,'Recetas que se pueden medir y costear','MRTPVREST · Manual para propietarios, cocina y administración · Versión 1.0 / 05.10.2026')
p('Un costo útil nace de una receta reproducible: qué se compra, cuánto se utiliza, cuánto rinde y cómo se entrega. Este manual convierte esas decisiones en un método que cada negocio puede mantener.')
h('Empiece por sus productos más vendidos')
p('Reúna compras recientes, recetas, ventas del mismo periodo y gastos operativos. Elija una semana de medición y pese porciones reales. Primero cierre los productos de mayor venta; después complete variantes, promociones y complementos.')
table(['Paso','Resultado esperado'],[
('1. Insumos','Precio por gramo, mililitro o pieza; presentación y fecha de compra.'),
('2. Preparaciones','Subrecetas con ingredientes, proceso y rendimiento medido.'),
('3. Platillos','Una ficha por presentación; cantidades y complementos explícitos.'),
('4. Entrega','Empaques por pieza, por grupo y por pedido sin duplicarlos.'),
('5. Operación','Aceite, grasa e indirectos asignados con una base documentada.'),
('6. Decisiones','Costo variable, contribución y precio revisados por canal.'),
('7. Control','Comparación semanal de consumo teórico contra consumo real.')],[115,384])
h('Qué contiene esta edición')
p('2 Compras · 3 Rendimientos · 4 Recetas y subrecetas · 5 Empaques · 6 Aceite y gastos · 7 Precios · 8 Menú · 9 Uso del sistema · 10 Hoja de control.', 'small')
p('Todos los ejemplos son ficticios. Este documento no publica recetas, nómina, ventas ni costos privados de restaurantes registrados. Las reglas se adaptan al negocio; no se copian porciones entre clientes.', 'small')

page(2,'Una unidad clara para cada insumo','Compras / presentaciones / costo aprovechable')
p('Registre nombre, proveedor, fecha, presentación, precio total y cantidad aprovechable. Mantenga una unidad base: gramos para peso, mililitros para volumen o piezas para unidades contables.')
table(['Compra de ejemplo','Conversión','Costo base'],[
('Caja de 24 panes por $144','144 / 24 piezas','$6.00 / pieza'),
('Bolsa de queso de 2 kg por $220','220 / 2,000 g','$0.1100 / g'),
('Salsa de 750 ml por $90','90 / 750 ml','$0.1200 / ml'),
('Frasco por $96; 1,600 g drenados','96 / 1,600 g','$0.0600 / g'),
('Paquete de 500 hojas por $30','30 / 500 piezas','$0.0600 / hoja')],[210,160,129])
h('El líquido descartado también se paga')
p('Si solo usa el contenido drenado, distribuya el precio completo de compra entre la masa drenada. No abarate el frasco descontando el valor del líquido que no utiliza. No vuelva a aplicar esa misma merma en la receta.')
h('No mezcle peso, volumen y piezas')
p('Una botella de 1 litro equivale a 1,000 ml; no necesariamente pesa 1,000 g. Pese un volumen conocido para convertir por densidad. Si compra bolsas por kilo, cuente cuántas piezas obtiene antes de costearlas por unidad.')
h('Conserve el origen del precio')
p('Guarde fecha, factura o ticket y proveedor. Elija una política: última compra para reposición o promedio ponderado para consumo. No promedie precios unitarios sin ponderar cantidades compradas. Documente fletes y cargos incluidos para no sumarlos dos veces.')
p('Precio cero significa dato pendiente, salvo gratuidad documentada. Una receta con insumos sin precio muestra un subtotal, no un costo completo.', 'small')

page(3,'Merma y rendimiento sin duplicaciones','Defina si cada cantidad corresponde a producto crudo o listo para servir')
p('Rendimiento = cantidad útil / cantidad inicial. Merma = 1 - rendimiento. El costo por unidad útil es el costo del lote dividido entre lo que realmente queda disponible.')
table(['Proceso ficticio','Cálculo','Resultado'],[
('1,000 g de proteína cuestan $80; salen 400 g cocidos','80 / 400','$0.20 / g cocido'),
('Porción de 120 g cocidos','120 × 0.20','$24.00'),
('Porción equivalente a 120 g crudos','120 × 0.08; rinde 48 g','$9.60')],[240,150,109])
h('Pesar antes y después responde preguntas distintas')
p('Una porción de 120 g crudos no es una porción de 120 g cocidos. Si la carta define peso crudo, costee esa cantidad de materia prima. Si define peso servido, use la preparación terminada y su rendimiento. Mantenga la misma base al registrar ventas y consumos.')
h('Cómo capturarlo sin aplicar dos veces la pérdida')
p('Opción sencilla: una subreceta contiene 1,000 g crudos y declara 400 g de rendimiento medido; la pérdida adicional de esa subreceta queda en cero. Otra opción matemática sería rendimiento nominal de 1,000 g y pérdida de 60%. Nunca use a la vez 400 g y 60% para la misma pérdida.')
h('Atención al campo de merma de cada ingrediente')
p('El ajuste porcentual de un renglón de receta funciona como cantidad × (1 + porcentaje/100). No es igual a dividir entre el rendimiento. Una pérdida de 60% exige 2.5 veces la cantidad útil; añadir 60% solo multiplica por 1.6. Para pérdidas de proceso, prefiera una subreceta con rendimiento pesado.')
p('Mida varios lotes representativos. Registre la fecha y vuelva a medir cuando cambien proveedor, cocción, tamaño o equipo. Un rendimiento estimado debe quedar identificado como provisional.', 'small')

page(4,'La ficha de receta y sus preparaciones','Una preparación compartida se costea una sola vez y se utiliza por porción')
p('Cree subrecetas para mezclas de queso, aderezos, salsas, cebolla cocinada, frijoles y proteínas preparadas. Cada una necesita cantidades de entrada, unidad de salida, rendimiento final y procedimiento breve.')
h('Ejemplo: mezcla de quesos')
p('2,000 g de queso A a $0.10/g más 1,000 g de queso B a $0.16/g cuestan $360. Con rendimiento de 3,000 g, el costo es $0.12/g. Una porción de 80 g cuesta $9.60. Si hay una pérdida adicional real, pésela y ajuste el rendimiento.')
table(['Campo de la ficha','Qué registrar'],[
('Producto y variante','Tamaño, proteína, canal y si incluye guarnición.'),
('Ingredientes','Cantidad, unidad y estado: crudo, drenado o cocido.'),
('Subrecetas','Nombre de la preparación y cantidad realmente servida.'),
('Complementos','Salsas, dip, vegetales, limón y condimentos medidos.'),
('Empaque base','Lo que siempre acompaña cada pieza.'),
('Control','Fecha, responsable, fuente del precio y pendientes.')],[135,364])
h('Evite repetir componentes')
p('Si el aderezo ya contiene mayonesa, no vuelva a sumar esa mayonesa al platillo. Si una preparación lleva grasa, descuente ese consumo del fondo común de grasa antes de repartirlo. Si un dip se define con vaso y tapa incluidos, no agregue otro juego al platillo.')
h('Promociones y extras son presentaciones distintas')
p('Defina cuántas piezas entrega una promoción y si incluye papas. Las papas opcionales tienen su propia porción y costo. No se deduce su inclusión por el nombre del producto. Registre salsa por gramos o mililitros medidos; si usa una cucharada, determine su volumen real.')

page(5,'Empaques según lo que se entrega','Separe pieza, grupo compartido y pedido')
table(['Nivel','Ejemplo','Regla'],[
('Por pieza','Papel que envuelve cada burrito','Se multiplica por piezas vendidas.'),
('Por grupo','Dos productos en una charola','Se usa la charola real y se sustituyen las cajas individuales.'),
('Por pedido','Bolsa de transporte','Se cuenta el número real de bolsas; no una por producto.'),
('Por complemento','Vaso y tapa del dip','Se multiplica por dips, salvo que ya estén en la subreceta.')],[90,184,225])
h('Ejemplo: dos piezas comparten charola')
p('Cada pieza usa papel de $0.06 y caja de $0.90. Dos piezas suman $1.92. Si se entregan juntas en una charola de $1.80, quite las dos cajas y conserve los dos papeles: $1.92 - $1.80 + $1.80 = $1.92. Si el pedido utiliza una bolsa de $0.40, su empaque total es $2.32.')
h('Con papas: sustituya el recipiente cuando corresponda')
p('Si el producto sin papas usa caja pequeña y con papas usa charola grande, se carga un solo recipiente según la presentación. La guarnición agrega su alimento y su consumo de fritura. Los papeles permanecen si realmente se utilizan.')
h('Aluminio por longitud y ancho constante')
p('Un rollo de 200 m por $600 cuesta $3/m. Un corte de 25 cm cuesta $0.75. Si envuelve cinco tacos, equivale a $0.15 por taco como promedio. Para pedidos de distinto tamaño, cuente los pliegos reales. Cambiar el ancho del rollo puede cambiar el rendimiento.')
h('Aplicación operativa')
p('Documente estas reglas y cuente recipientes en el despacho. La simulación de empaques calcula el ajuste por pedido; la selección automática y su descuento en inventario requieren la integración de ventas indicada en la página 9. Una nota en la receta no activa esa automatización.', 'small')

page(6,'Aceite, grasa y gastos del periodo','Cada gasto se reparte una vez, con una base que se pueda explicar')
h('Aceite de fritura: consumo, no solo compras')
p('Consumo del periodo = inventario inicial + entradas - inventario final, ajustado por transferencias y devoluciones. Incluya el aceite en uso en la freidora dentro del inventario medido. Comprar una cubeta no demuestra que se haya consumido completa.')
p('Sin inventarios confiables, use compras semanales como aproximación marcada como provisional. Reparta el costo entre kilos realmente fritos o una base acordada de órdenes equivalentes. El peso es una aproximación: productos y tiempos distintos pueden requerir ponderaciones medidas.')
p('Ejemplo: $1,200 de aceite consumido entre 120 kg fritos = $10/kg. Una porción de 150 g recibe $1.50. Cuente papas incluidas, extras, alitas y otros productos fritos una sola vez. Esta asignación distribuye el uso y descarte del aceite; no es un estándar de absorción.')
h('Grasa de plancha')
p('Use un fondo separado para los productos que pasan por plancha. Excluya los que no la usan. Antes de distribuirlo, reste la grasa ya costada dentro de preparaciones. Elija piezas, kilos o tiempo de plancha y mantenga la base hasta la revisión.')
h('Nómina, gas, luz y renta')
table(['Dato','Tratamiento para comparar el mes'],[
('Nómina','Use el gasto del mismo periodo; separe una parte variable solo si puede medirla.'),
('Gas pagado después','Asigne el consumo a la semana utilizada, no automáticamente al día de pago.'),
('Recibo de luz de varios meses','Prorratee por días cubiertos si no hay lectura más precisa.'),
('Renta mensual','Asigne al mes correspondiente y evite repetirla por sucursal.')],[145,354])
p('Ejemplo: $30,000 de gastos entre $200,000 de ventas comparables = 15%. Asignar 15% a cada venta es una convención administrativa, no consumo físico ni garantía de rentabilidad. Revise el resultado cuando cambie el volumen.', 'small')

page(7,'Precio, contribución y resultado','Compare importes con el mismo tratamiento de impuestos y descuentos')
p('Costo variable: alimentos, preparaciones, empaques y otros cargos que cambian con la venta. Contribución: ingreso comparable menos costo variable y comisión del canal. Resultado operativo del periodo: suma de contribuciones menos gastos fijos y demás gastos no incluidos.')
h('Un precio objetivo es un escenario, no una promesa')
p('Con costo variable C y margen de contribución objetivo m: precio = C / (1 - m). Si C = $40 y m = 60%, el precio es $100. Agregar 60% al costo daría $64 y un margen de solo 37.5%. Margen y aumento sobre costo no son lo mismo.')
p('Si la comisión efectiva del canal es k sobre el mismo precio: precio = C / (1 - m - k). Con C = $40, m = 50% y k = 10%, resulta $100. Incorpore cargos fijos por orden y descuentos según su contrato real; no suponga que todos los canales cobran igual.')
table(['Escenario ficticio','Local','Canal con comisión'],[
('Ingreso comparable','$100.00','$100.00'),
('Costo variable','$40.00','$40.00'),
('Comisión efectiva','$0.00','$10.00'),
('Contribución','$60.00','$50.00'),
('Indirecto asignado de ejemplo','$15.00','$15.00'),
('Resultado después de esa asignación','$45.00','$35.00')],[265,117,117])
h('Valide promociones completas')
p('Una promoción de dos piezas por $120 ingresa $60 por pieza, pero el empaque compartido se calcula a nivel pedido. Compare el ingreso total con las dos recetas, extras y cargos reales. Una promoción con contribución positiva todavía puede ser insuficiente para cubrir gastos fijos.')
p('No fije precios definitivos con recetas incompletas. Redondee el precio comercial y recalcule su contribución. Los ejemplos no establecen un margen recomendado para todos los negocios.', 'small')

page(8,'Un menú que ayuda a decidir','Evalúe popularidad y contribución dentro de categorías comparables')
p('Use un periodo definido, unidades vendidas e ingreso neto de descuentos. Compare hamburguesas con hamburguesas o tacos con tacos. Separe tamaños, promociones y canales cuando cambien costos o precios.')
h('Un criterio interno sencillo y reproducible')
p('Como punto de partida, marque popularidad alta cuando las unidades del producto superen el promedio de unidades por producto de su categoría. Marque contribución alta cuando su contribución por unidad supere la contribución media ponderada por ventas de esa categoría. Declare cómo tratar empates y productos nuevos. Este es un criterio interno configurable, no un estándar obligatorio.')
table(['Clasificación','Lectura','Acción a probar'],[
('Alta venta + alta contribución','Producto fuerte','Dé visibilidad y cuide consistencia y disponibilidad.'),
('Alta venta + baja contribución','Popular con margen limitado','Revise porción, desperdicio, proveedor y precio.'),
('Baja venta + alta contribución','Buen aporte, poca demanda','Pruebe nombre, descripción, ubicación y recomendación.'),
('Baja venta + baja contribución','Producto a revisar','Investigue demanda y papel comercial antes de retirarlo.')],[180,129,190])
h('No clasifique datos que aún faltan')
p('Sin receta completa no se conoce la contribución. Sin suficientes ventas no se conoce bien la popularidad. Marque el producto como pendiente y conserve la evidencia; no lo clasifique como rentable porque el sistema muestre un costo parcial bajo.')
h('Cómo armar la carta')
p('Agrupe por tipo de producto. Destaque pocas opciones con aporte y demanda comprobados. Describa peso en crudo o cocido, acompañamientos incluidos y extras con precio visible. Mantenga promociones en un bloque claramente identificado y mida el efecto de cada cambio.')
p('Revise mensual: unidades, precio medio efectivo, costo variable, contribución por unidad y contribución total. No retire un producto solo por su posición: puede atender una preferencia importante o completar un pedido.', 'small')

page(9,'Cómo trabajar en MRTPVREST','Captura, importación y alcance de esta entrega')
table(['Orden','Acción en el sistema o en la operación'],[
('1','En Inventario, revise insumos, unidades y precios antes de cargar recetas.'),
('2','En Inventario > Recetas, descargue Plantilla. Contiene PLATOS y SUBRECETAS del restaurante.'),
('3','Conserve encabezados y complete cantidades y unidades. No mezcle datos de otros negocios.'),
('4','Use Subir para importar y revise los resultados y errores antes de dar por cerrado el lote.'),
('5','Abra cada producto y contraste su ficha con una preparación pesada por cocina.'),
('6','Documente variantes y empaques compartidos; pruebe pedidos representativos antes de activar automatizaciones.'),
('7','Descargue este manual desde Recetas para capacitar a cocina y administración.')],[48,451])
h('Qué incluye el cambio de software asociado')
p('El cálculo del backend incorpora subrecetas anidadas y devuelve advertencias cuando faltan componentes o precios. También incorpora una simulación administrativa de empaques por pedido que sustituye cantidades base por cantidades reales. La descarga del manual está disponible cuando esta versión se despliega.')
h('Qué sigue requiriendo integración')
p('La simulación no cobra pedidos ni descuenta inventario. Quedan pendientes el selector de empaques en caja, guardar la presentación del pedido, conectar su consumo real, mostrar las advertencias en la interfaz y verificar cancelaciones y ventas sin conexión. No interprete el manual como confirmación de que esas funciones ya están activas.')
h('Control histórico y separación de negocios')
p('Cada negocio mantiene sus propios insumos, recetas, costos y ventas. Para analizar historia, conserve el costo vigente al vender o un cierre fechado; recalcular con precios actuales no reproduce el costo histórico. Las reglas son reutilizables, los datos del negocio no se comparten.', 'small')

page(10,'Hoja de cierre y seguimiento','Copie esta hoja por receta o úsela en una revisión de cocina')
table(['Dato','Registro del negocio'],[
('Producto / presentación','________________________________________'),
('Fecha / responsable','________________________________________'),
('Porción y estado del peso','________________________________________'),
('Rendimiento pesado del lote','________________________________________'),
('Costo de ingredientes y subrecetas','________________________________________'),
('Empaque por pieza / por pedido','________________________________________'),
('Fritura / plancha asignadas','________________________________________'),
('Costo variable total','________________________________________'),
('Precio por canal / comisión','________________________________________'),
('Contribución / pendientes','________________________________________')],[230,269])
h('Antes de marcar la receta como completa')
p('Confirme precios con fecha; revise gramos, mililitros y piezas; pese rendimiento y porción; incluya salsas y guarniciones; compruebe empaques; elimine mermas y gastos duplicados. Registre cualquier aproximación pendiente de medición.')
h('Rutina que mantiene el costo útil')
p('Diario: registre compras, desperdicios y cambios de porción. Semanal: cuente existencias y compare consumo real con ventas × consumo estándar. Investigue diferencias por cortesías, devoluciones, merma o porciones. Mensual: cierre gastos y ventas del mismo periodo y revise precios y carta.')
p('Responsables: cocina valida cantidades y rendimiento; compras valida precio y presentación; despacho cuenta empaques; administración concilia gastos y ventas. El propietario aprueba cambios comerciales.', 'small')
p('Mantenimiento del manual: versión 1.0. Las mejoras deben partir de problemas medidos y ejemplos ficticios. Mantenga fuente editable, PDF y alcance funcional de la aplicación alineados.', 'small')

def footer(canvas,doc):
 canvas.setStrokeColor(colors.HexColor('#cbd5e1'));canvas.line(48,43,547,43)
 canvas.setFont('Helvetica',8);canvas.setFillColor(MUTED)
 canvas.drawString(48,29,'MRTPVREST | Costeo de recetas | v1.0')
 canvas.drawRightString(547,29,f'{doc.page}')
 canvas.setFillColor(GREEN);canvas.rect(48,805,30,4,fill=1,stroke=0)

SimpleDocTemplate(str(OUT),pagesize=A4,rightMargin=48,leftMargin=48,topMargin=53,bottomMargin=58,title='MRTPVREST - Manual de costeo de recetas',author='MRTPVREST').build(story,onFirstPage=footer,onLaterPages=footer)
(ROOT/'docs/manuales/manual-costeo-recetas.md').write_text('\n'.join(source),encoding='utf-8')
print(OUT)
