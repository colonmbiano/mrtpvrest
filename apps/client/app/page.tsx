'use client'

import { useState } from 'react'

const ADMIN_URL = 'https://admin.masterburguers.com'
const REGISTER_URL = 'https://admin.masterburguers.com/register'

export default function LandingPage() {
  const [activeTab, setActiveTab] = useState<'owner' | 'kitchen' | 'customer'>('owner')
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">

      {/* NAVBAR */}
      <nav className="fixed top-0 w-full z-50 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <a href="/" className="text-xl font-bold text-orange-500 tracking-tight">
            MRT<span className="text-gray-900">PVREST</span>
          </a>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-600">
            <a href="#caracteristicas" className="hover:text-orange-500 transition-colors">Características</a>
            <a href="#precios" className="hover:text-orange-500 transition-colors">Precios</a>
            <a href="#faq" className="hover:text-orange-500 transition-colors">FAQ</a>
          </div>
          <div className="flex items-center gap-3">
            <a
              href={ADMIN_URL}
              className="hidden md:inline text-sm text-gray-700 hover:text-orange-500 transition-colors"
            >
              Iniciar sesión
            </a>
            <a
              href={REGISTER_URL}
              className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Prueba gratis
            </a>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="pt-32 pb-24 px-4 bg-gradient-to-b from-orange-50 to-white">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-orange-100 text-orange-600 text-sm font-medium px-4 py-1.5 rounded-full mb-6">
            <span>✦</span>
            <span>Plataforma SaaS para restaurantes</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 leading-tight mb-6">
            El sistema que lleva tu restaurante al{' '}
            <span className="text-orange-500">siguiente nivel</span>
          </h1>
          <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-10">
            TPV, cocina, delivery y tienda online en una sola plataforma.
            Sin instalaciones. Desde <strong className="text-gray-700">$2/mes</strong>.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href={REGISTER_URL}
              className="bg-orange-500 hover:bg-orange-600 text-white font-semibold px-8 py-4 rounded-xl text-lg transition-colors shadow-lg shadow-orange-200"
            >
              Empieza 15 días gratis
            </a>
            <a
              href="#demo"
              className="border border-gray-200 hover:border-orange-300 text-gray-700 font-semibold px-8 py-4 rounded-xl text-lg transition-colors"
            >
              Ver demo →
            </a>
          </div>
          {/* Dashboard mockup */}
          <div className="mt-16 bg-gray-900 rounded-2xl shadow-2xl overflow-hidden max-w-4xl mx-auto border border-gray-800">
            <div className="flex items-center gap-2 px-4 py-3 bg-gray-800 border-b border-gray-700">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="ml-3 text-xs text-gray-400">admin.mrtpvrest.com</span>
            </div>
            <div className="p-6 grid grid-cols-3 gap-4">
              <div className="bg-gray-800 rounded-xl p-4 col-span-2">
                <p className="text-xs text-gray-400 mb-2">Ventas hoy</p>
                <p className="text-3xl font-bold text-white">$4,280</p>
                <p className="text-xs text-green-400 mt-1">+18% vs ayer</p>
                <div className="mt-4 flex gap-1">
                  {[40, 65, 45, 80, 55, 90, 70, 85, 60, 95, 75, 100].map((h, i) => (
                    <div key={i} className="flex-1 bg-orange-500/20 rounded-sm" style={{ height: `${h * 0.6}px` }} />
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-4">
                <div className="bg-gray-800 rounded-xl p-4">
                  <p className="text-xs text-gray-400 mb-1">Pedidos</p>
                  <p className="text-2xl font-bold text-white">47</p>
                  <p className="text-xs text-orange-400">activos: 3</p>
                </div>
                <div className="bg-gray-800 rounded-xl p-4">
                  <p className="text-xs text-gray-400 mb-1">Mesa</p>
                  <p className="text-2xl font-bold text-white">12/16</p>
                  <p className="text-xs text-yellow-400">ocupadas</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <section className="py-12 border-y border-gray-100 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-sm text-gray-400 uppercase tracking-widest mb-6">Integrado con</p>
          <div className="flex flex-wrap justify-center items-center gap-8 text-gray-400 font-semibold text-sm">
            {['MercadoPago', 'Stripe', 'Rappi', 'Uber Eats', 'WhatsApp'].map((brand) => (
              <span key={brand} className="text-gray-500 hover:text-orange-500 transition-colors">
                {brand}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="caracteristicas" className="py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Todo lo que necesita tu restaurante
            </h2>
            <p className="text-gray-500 text-lg max-w-xl mx-auto">
              Herramientas profesionales que antes solo tenían las grandes cadenas.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: '🖥️', title: 'TPV Táctil', desc: 'Toma pedidos en segundos desde cualquier tablet o PC. Sin hardware especial.' },
              { icon: '👨‍🍳', title: 'Cocina Digital (KDS)', desc: 'La orden llega automáticamente a la pantalla de cocina. Cero papel.' },
              { icon: '🛵', title: 'App Delivery', desc: 'Tus repartidores con GPS en tiempo real. Asigna, monitorea y notifica.' },
              { icon: '📱', title: 'Tienda Online', desc: 'Tus clientes piden desde su celular con un QR en la mesa o en casa.' },
              { icon: '💬', title: 'WhatsApp', desc: 'Notificaciones automáticas al cliente cuando su pedido está listo.' },
              { icon: '📊', title: 'Reportes', desc: 'Ventas, productos más vendidos y turnos de caja en tiempo real.' },
            ].map((f) => (
              <div
                key={f.title}
                className="bg-white border border-gray-100 rounded-2xl p-6 hover:border-orange-200 hover:shadow-lg transition-all"
              >
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DEMO */}
      <section id="demo" className="py-24 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Todo en un solo lugar
            </h2>
            <p className="text-gray-500 text-lg">
              Una plataforma, tres experiencias distintas.
            </p>
          </div>
          <div className="flex gap-2 justify-center mb-8">
            {([
              { key: 'owner', label: 'Para el dueño' },
              { key: 'kitchen', label: 'Para cocina' },
              { key: 'customer', label: 'Para el cliente' },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-orange-500 text-white shadow'
                    : 'bg-white text-gray-600 hover:bg-orange-50 border border-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
            {activeTab === 'owner' && (
              <div className="space-y-4">
                <h3 className="text-xl font-semibold text-gray-900">Panel de administración</h3>
                <p className="text-gray-500">Controla todo desde cualquier dispositivo. Ve las ventas del día, administra el menú, gestiona empleados y sucursales, y consulta reportes históricos sin necesidad de estar en el restaurante.</p>
                <ul className="space-y-2 text-sm text-gray-600">
                  {['Dashboard con métricas en tiempo real', 'Gestión de menú con fotos y categorías', 'Reportes de ventas por día, semana y mes', 'Control de turnos de caja', 'Gestión de múltiples sucursales'].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <span className="text-orange-500">✓</span> {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {activeTab === 'kitchen' && (
              <div className="space-y-4">
                <h3 className="text-xl font-semibold text-gray-900">Pantalla de cocina (KDS)</h3>
                <p className="text-gray-500">Los pedidos llegan instantáneamente a la pantalla de cocina ordenados por tiempo. El cocinero confirma cada platillo y el sistema notifica automáticamente al mesero cuando está listo.</p>
                <ul className="space-y-2 text-sm text-gray-600">
                  {['Pedidos en tiempo real sin papel', 'Temporizador por orden', 'Confirmación por platillo', 'Vista por estación (cocina, barra, frituras)', 'Historial de tiempos de preparación'].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <span className="text-orange-500">✓</span> {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {activeTab === 'customer' && (
              <div className="space-y-4">
                <h3 className="text-xl font-semibold text-gray-900">Experiencia del cliente</h3>
                <p className="text-gray-500">El cliente escanea el QR de su mesa, ve el menú con fotos, hace su pedido y paga desde su celular. También recibe notificaciones de WhatsApp con el estado de su pedido.</p>
                <ul className="space-y-2 text-sm text-gray-600">
                  {['Menú digital con QR en mesa', 'Pedido desde el celular sin app', 'Seguimiento del pedido en vivo', 'Notificación WhatsApp cuando está listo', 'Tienda online para delivery a domicilio'].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <span className="text-orange-500">✓</span> {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* PRECIOS */}
      <section id="precios" className="py-24 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-6">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Precios simples y honestos</h2>
            <p className="text-gray-500 text-lg mb-2">Sin sorpresas ni costos ocultos.</p>
            <span className="inline-block bg-green-100 text-green-700 text-sm font-medium px-4 py-1.5 rounded-full">
              15 días gratis en todos los planes
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-10">
            {[
              {
                name: 'Basic',
                price: '$2',
                period: '/mes',
                desc: 'Para arrancar',
                features: ['1 sucursal', 'TPV táctil', 'Menú digital QR', 'Hasta 3 usuarios', 'Soporte por email'],
                cta: 'Empezar gratis',
                featured: false,
              },
              {
                name: 'Pro',
                price: '$5',
                period: '/mes',
                desc: 'El más popular',
                features: ['3 sucursales', 'Todo lo de Basic', 'Cocina digital (KDS)', 'App delivery + GPS', 'WhatsApp automático', 'Reportes avanzados', 'Soporte prioritario'],
                cta: 'Empezar gratis',
                featured: true,
              },
              {
                name: 'Unlimited',
                price: '$20',
                period: '/mes',
                desc: 'Para cadenas',
                features: ['Sucursales ilimitadas', 'Todo lo de Pro', 'Integraciones Rappi/Uber', 'API acceso completo', 'Manager de cuenta', 'SLA garantizado'],
                cta: 'Empezar gratis',
                featured: false,
              },
            ].map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl p-8 border flex flex-col ${
                  plan.featured
                    ? 'bg-orange-500 text-white border-orange-500 shadow-xl shadow-orange-200 scale-105'
                    : 'bg-white border-gray-100 hover:border-orange-200'
                }`}
              >
                {plan.featured && (
                  <span className="bg-white text-orange-500 text-xs font-bold px-3 py-1 rounded-full self-start mb-4">
                    MAS POPULAR
                  </span>
                )}
                <h3 className={`text-lg font-semibold mb-1 ${plan.featured ? 'text-white' : 'text-gray-900'}`}>{plan.name}</h3>
                <p className={`text-sm mb-4 ${plan.featured ? 'text-orange-100' : 'text-gray-400'}`}>{plan.desc}</p>
                <div className="flex items-end gap-1 mb-6">
                  <span className={`text-4xl font-bold ${plan.featured ? 'text-white' : 'text-gray-900'}`}>{plan.price}</span>
                  <span className={`text-sm mb-1 ${plan.featured ? 'text-orange-100' : 'text-gray-400'}`}>{plan.period}</span>
                </div>
                <ul className="space-y-2.5 mb-8 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className={`flex items-center gap-2 text-sm ${plan.featured ? 'text-orange-50' : 'text-gray-600'}`}>
                      <span className={plan.featured ? 'text-white' : 'text-orange-500'}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <a
                  href={REGISTER_URL}
                  className={`text-center font-semibold py-3 rounded-xl transition-colors ${
                    plan.featured
                      ? 'bg-white text-orange-500 hover:bg-orange-50'
                      : 'bg-orange-500 text-white hover:bg-orange-600'
                  }`}
                >
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24 px-4 bg-gray-50">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">Preguntas frecuentes</h2>
          <div className="space-y-3">
            {[
              { q: '¿Necesito instalar algo?', a: 'No. MRTPVREST funciona 100% en la nube. Solo necesitas un navegador web y conexión a internet. Sin hardware especial.' },
              { q: '¿Puedo cancelar cuando quiera?', a: 'Sí. No hay contratos de permanencia. Puedes cancelar tu suscripción en cualquier momento desde tu panel, sin penalizaciones.' },
              { q: '¿Funciona en México?', a: 'Sí, con MercadoPago integrado de manera nativa. También soportamos Stripe para pagos internacionales.' },
              { q: '¿Cuánto tarda la configuración?', a: 'Menos de 10 minutos. Crea tu cuenta, sube tu menú y ya puedes recibir pedidos. Nuestro equipo te ayuda en el proceso.' },
            ].map((item, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex justify-between items-center px-6 py-4 text-left"
                >
                  <span className="font-medium text-gray-900">{item.q}</span>
                  <span className="text-orange-500 text-xl">{openFaq === i ? '−' : '+'}</span>
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-4 text-sm text-gray-500 leading-relaxed border-t border-gray-50">
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="py-24 px-4 bg-gradient-to-b from-orange-500 to-orange-600">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            ¿Listo para modernizar tu restaurante?
          </h2>
          <p className="text-orange-100 text-lg mb-8">
            Únete a los restaurantes que ya usan MRTPVREST. 15 días gratis, sin tarjeta.
          </p>
          <a
            href={REGISTER_URL}
            className="inline-block bg-white text-orange-500 font-bold px-10 py-4 rounded-xl text-lg hover:bg-orange-50 transition-colors shadow-xl"
          >
            Crear cuenta gratis
          </a>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-10 px-4 border-t border-gray-100">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <span className="text-lg font-bold text-orange-500">MRT<span className="text-gray-900">PVREST</span></span>
            <p className="text-xs text-gray-400 mt-1">El POS que tu restaurante necesita.</p>
          </div>
          <div className="flex gap-6 text-sm text-gray-500">
            <a href="#" className="hover:text-orange-500 transition-colors">Términos</a>
            <a href="#" className="hover:text-orange-500 transition-colors">Privacidad</a>
            <a href="mailto:contacto@mrtpvrest.com" className="hover:text-orange-500 transition-colors">Contacto</a>
          </div>
          <p className="text-xs text-gray-400">© 2026 MRTPVREST</p>
        </div>
      </footer>
    </div>
  )
}
