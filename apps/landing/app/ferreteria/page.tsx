import type { Metadata } from 'next'
import Link from 'next/link'
import { ferreteriaVerticals } from '../_data/ferreteria-verticals'
import { siteUrl, registerUrl } from '../_data/site'
import { SiteNav, SiteFooter } from '../_components/SiteChrome'

// Hub del giro amplio FERRETERIA. A diferencia de /moda (marca MODA+ con
// subdominio propio), esta sección va bajo la marca madre mrtpvrest: el nombre
// de la ruta ES la keyword principal ("punto de venta para ferretería"), y los
// giros finos (tlapalería, eléctrico, plomería…) cuelgan de aquí.
// Ver docs/plan-retail-multigiro.md → Fase 5.

const metaTitle = 'Punto de Venta para Ferretería | mrtpvrest'
const metaDescription =
  'Punto de venta para ferretería: cobra escaneando código de barras, vende por pieza o a granel (metro, kilo, litro), precio de mayoreo y corte de caja. Windows, Android y web.'

export const metadata: Metadata = {
  title: metaTitle,
  description: metaDescription,
  alternates: { canonical: '/ferreteria' },
  openGraph: { title: metaTitle, description: metaDescription, url: `${siteUrl}/ferreteria`, type: 'website' },
}

// El copy describe SOLO lo que el producto hace hoy. No promete conversión
// automática caja↔pieza: el campo se captura pero la conversión al vender no
// está implementada.
const highlights: { title: string; text: string }[] = [
  { title: 'Cobra escaneando', text: 'La pistola resuelve el artículo por su código de barras. Sin teclear claves ni confundir un 1/2" con un 3/4".' },
  { title: 'Por pieza o a granel', text: 'Cada artículo con su unidad: pieza, metro, kilo, litro o caja. La cantidad admite decimales, así que 2.5 m de cable se cobran como 2.5 m.' },
  { title: 'Precio de mayoreo', text: 'Define a partir de qué cantidad baja el precio. El sistema aplica el escalón al cobrar, igual para todos, sin calculadora.' },
  { title: 'Medidas con su nombre', text: 'El catálogo habla tu idioma: medida, rosca, material y presentación. No "talla" y "color".' },
  { title: 'Dónde está cada cosa', text: 'Guarda pasillo y anaquel por artículo y encuéntralo cuando el cliente pregunte.' },
  { title: 'Corte de caja que cuadra', text: 'Abre turno, registra entradas, salidas y gastos, y cierra con esperado contra contado.' },
]

const pains: [string, string, string][] = [
  ['Miles de claves', 'El mostrador teclea la clave a mano y se equivoca de medida.', 'Escaneas el código y sale el artículo exacto.'],
  ['Granel redondeado', 'El POS genérico solo cuenta piezas enteras y el metro se cobra a ojo.', 'Cantidad con decimales: 2.5 m se cobran 2.5 m, y el stock se descuenta igual.'],
  ['Mayoreo a criterio', 'El descuento por volumen depende de quién atienda.', 'Escalón de precio por cantidad, resuelto por el sistema.'],
  ['Caja descuadrada', 'Mucho efectivo y cero claridad al cierre.', 'Corte por turno con esperado, contado y diferencia.'],
]

const faqs: [string, string][] = [
  ['¿Puedo vender cable por metro o tornillos por kilo?', 'Sí. Cada artículo tiene su unidad de venta (pieza, metro, kilo, litro o caja) y la cantidad acepta decimales, así que puedes cobrar 2.5 m o 0.75 kg. El inventario se descuenta con esa misma cantidad.'],
  ['¿Maneja precio de mayoreo?', 'Sí. Defines a partir de qué cantidad aplica cada precio y el sistema resuelve el escalón al momento de cobrar, sin que el mostrador calcule nada.'],
  ['¿Puedo convertir automáticamente de caja a pieza?', 'Todavía no. Puedes registrar cuántas piezas trae la caja y vender con unidad "caja" o "pieza" como artículos distintos, pero la conversión automática al vender o recibir no está disponible.'],
  ['¿Funciona sin internet?', 'Sí. Se instala en Windows y Android y sigue cobrando aunque se caiga la conexión; sincroniza cuando vuelve.'],
  ['¿Sirve para tlapalería, material eléctrico o plomería?', 'Sí. Es el mismo sistema y cada giro nombra sus atributos como los usa en el mostrador. Abajo hay una página por giro.'],
]

export default function FerreteriaLandingPage() {
  const url = `${siteUrl}/ferreteria`
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: siteUrl },
          { '@type': 'ListItem', position: 2, name: 'Punto de venta para ferretería', item: url },
        ],
      },
      {
        '@type': 'SoftwareApplication',
        name: 'mrtpvrest · Punto de venta para ferretería',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Windows, Android, Web',
        description: metaDescription,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'MXN', description: 'Prueba gratis, sin tarjeta' },
      },
      {
        '@type': 'FAQPage',
        mainEntity: faqs.map(([question, answer]) => ({
          '@type': 'Question',
          name: question,
          acceptedAnswer: { '@type': 'Answer', text: answer },
        })),
      },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <SiteNav />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span /> Punto de venta para ferretería</div>
            <h1>El punto de venta para tu ferretería</h1>
            <p>
              Miles de claves, medidas que se parecen y clientes que llevan por metro o por kilo.
              Cobra escaneando, vende a granel con decimales, aplica precio de mayoreo automático y
              cuadra tu caja por turno. En tu computadora o celular, aunque se caiga el internet.
            </p>
            <div className="hero-actions">
              <a className="btn btn-primary" href={registerUrl}>Crear mi cuenta</a>
              <Link className="btn btn-soft" href="#giros">Ver mi giro</Link>
            </div>
            <div className="trust-row" aria-label="Beneficios de confianza">
              <span>Sin tarjeta</span>
              <span>Windows, Android y web</span>
              <span>Funciona sin internet</span>
            </div>
          </div>
        </section>

        <section className="section" id="funciona">
          <div className="section-head">
            <span className="section-kicker">Hecho para ferretería</span>
            <h2>Lo que tu mostrador necesita</h2>
          </div>
          <div className="steps">
            {highlights.map((item) => (
              <article className="step" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <span className="section-kicker">Problema a solución</span>
            <h2>De la libreta al control real</h2>
          </div>
          <div className="pain-grid">
            {pains.map(([title, bad, good]) => (
              <article className="pain-card" key={title}>
                <span className="pain-title">{title}</span>
                <p className="pain-bad">{bad}</p>
                <p className="pain-good">{good}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section faq-section" id="faq">
          <div className="section-head">
            <span className="section-kicker">FAQ</span>
            <h2>Preguntas frecuentes</h2>
          </div>
          <div className="faq-list">
            {faqs.map(([question, answer], index) => (
              <details key={question} open={index === 0}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="section" id="giros">
          <div className="section-head">
            <span className="section-kicker">Tu giro</span>
            <h2>Hecho para cómo vendes tú</h2>
          </div>
          <div className="steps">
            {ferreteriaVerticals.map((v) => (
              <article className="step" key={v.slug}>
                <h3><Link href={`/ferreteria/${v.slug}`}>{v.nav}</Link></h3>
                <p>{v.metaDescription}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="final-cta">
          <span className="section-kicker">Punto de venta para ferretería</span>
          <h2>Empieza hoy en tu mostrador</h2>
          <p>Crea tu cuenta en minutos, carga tus artículos con su medida y su código de barras, y vende desde el primer día.</p>
          <div className="hero-actions">
            <a className="btn btn-primary" href={registerUrl}>Crear mi cuenta</a>
            <Link className="btn btn-line" href="/ferreteria#faq">Ver preguntas frecuentes</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
