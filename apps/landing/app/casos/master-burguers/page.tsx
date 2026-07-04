import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { siteUrl, registerUrl } from '../../_data/site'
import { buildMetadata } from '../../../lib/seo'
import { SiteNav, SiteFooter } from '../../_components/SiteChrome'

// Caso de estudio con NÚMEROS REALES de producción (ventana de 30 días,
// corte 2026-07-03, órdenes no canceladas del tenant Master Burguer's).
// Si actualizas las cifras, actualiza también la fecha del corte en el copy.
const metrics = [
  { num: '1,050', label: 'pedidos procesados en los últimos 30 días' },
  { num: '+$340 mil', label: 'MXN en ventas registradas en el mismo periodo' },
  { num: '46%', label: 'de los pedidos son delivery con reparto propio, sin comisiones' },
  { num: '3', label: 'canales de venta activos: mostrador, WhatsApp y tienda en línea' },
]

const beforeAfter: [string, string, string][] = [
  [
    'Cortes de caja',
    'Antes: ventas y cortes anotados a mano, con diferencias al cierre.',
    'Ahora: corte ciego en el TPV y cierres cuadrados todos los días.',
  ],
  [
    'Cocina',
    'Antes: comandas en papel que se traspapelaban en horas pico.',
    'Ahora: KDS en cocina con cada orden clara y en tiempo real.',
  ],
  [
    'Reparto',
    'Antes: pedidos a domicilio apuntados en cuaderno y efectivo sin conciliar.',
    'Ahora: app de repartidores conectada a la caja, con corte por repartidor.',
  ],
  [
    'Canales digitales',
    'Antes: solo pedidos por teléfono, dependiendo de quién contestara.',
    'Ahora: pedidos por WhatsApp y tienda en línea que entran directo a cocina.',
  ],
]

const ladder = [
  {
    title: '1 · Caja y ventas',
    text: 'Arrancaron con el TPV: mesas, cuentas, cobros y cortes de caja. Ese solo paso ordenó el dinero del negocio.',
  },
  {
    title: '2 · Cocina y reparto',
    text: 'Después encendieron el KDS de cocina y el reparto propio con repartidores conectados a la misma operación.',
  },
  {
    title: '3 · Canales digitales',
    text: 'Con la operación cuadrada, activaron pedidos por WhatsApp y la tienda en línea — los canales nuevos entran a la misma caja y la misma cocina.',
  },
]

export const metadata: Metadata = buildMetadata({
  title: "Caso real: Master Burguer's — 1,000+ pedidos al mes | MRTPVREST",
  description:
    "Cómo una hamburguesería del Estado de México pasó de ventas a mano a procesar 1,050 pedidos y +$340 mil MXN en 30 días con TPV, KDS, reparto propio, WhatsApp y tienda en línea.",
  path: '/casos/master-burguers',
})

export default function CasoMasterBurguersPage() {
  const url = `${siteUrl}/casos/master-burguers`
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: siteUrl },
          { '@type': 'ListItem', position: 2, name: "Caso Master Burguer's", item: url },
        ],
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
            <div className="eyebrow"><span /> Caso de estudio · Hamburguesería · Estado de México</div>
            <h1>Master Burguer&apos;s: de ventas a mano a más de 1,000 pedidos al mes</h1>
            <p>
              Master Burguer&apos;s llevaba ventas y cortes a mano. Hoy caja, cocina, reparto propio,
              WhatsApp y tienda en línea corren en una sola plataforma — y el día cierra cuadrado.
              Estos son sus números reales de un mes de operación.
            </p>
            <div className="hero-actions">
              <a className="btn btn-primary" href={registerUrl}>Quiero esto en mi restaurante</a>
              <Link className="btn btn-soft" href="/#precios">Ver precios</Link>
            </div>
            <div className="trust-row" aria-label="Beneficios de confianza">
              <span>Cliente real</span>
              <span>Datos de producción</span>
              <span>Corte al 3 de julio de 2026</span>
            </div>
          </div>
          <div className="hero-visual">
            <div className="logo-plate">
              <Image
                src="/showcase-warm/tpv.png"
                alt="TPV de MRTPVREST operando en Master Burguer's"
                width={1536}
                height={672}
                priority
                sizes="(max-width: 900px) 100vw, 48vw"
              />
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <span className="section-kicker">Números reales</span>
            <h2>Un mes de operación, medido</h2>
            <p>
              Cifras tomadas directamente de la plataforma: últimos 30 días de pedidos no cancelados.
              La mezcla del mes: 46% delivery, 29% para llevar y 26% en mesa.
            </p>
          </div>
          <div className="steps">
            {metrics.map((m) => (
              <article className="step" key={m.label}>
                <h3>{m.num}</h3>
                <p>{m.label}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <span className="section-kicker">Antes y después</span>
            <h2>Lo que cambió en la operación</h2>
          </div>
          <div className="pain-grid">
            {beforeAfter.map(([title, bad, good]) => (
              <article className="pain-card" key={title}>
                <span className="pain-title">{title}</span>
                <p className="pain-bad">{bad}</p>
                <p className="pain-good">{good}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <span className="section-kicker">Por etapas</span>
            <h2>No activaron todo el mismo día</h2>
            <p>
              La plataforma es modular: Master Burguer&apos;s encendió cada módulo cuando su operación
              lo pidió, sin apagar el negocio para migrar.
            </p>
          </div>
          <div className="steps">
            {ladder.map((step) => (
              <article className="step" key={step.title}>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="final-cta">
          <span className="section-kicker">MRTPVREST</span>
          <h2>Tu restaurante puede ser el siguiente caso</h2>
          <p>Empieza solo con el TPV y activa cocina, reparto y canales digitales cuando tu operación los pida.</p>
          <div className="hero-actions">
            <a className="btn btn-primary" href={registerUrl}>Registrar mi restaurante</a>
            <Link className="btn btn-line" href="/funciones">Ver todas las funciones</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
