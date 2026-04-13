"use client";
import { useState, useEffect } from "react";

type Lang = "es" | "en";

export default function LandingPage() {
  const [lang, setLang] = useState<Lang>("es");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const t = (es: string, en: string) => (lang === "es" ? es : en);

  function toggleFaq(idx: number) {
    setOpenFaq((prev) => (prev === idx ? null : idx));
  }

  useEffect(() => {
    const cells = document.querySelectorAll(".bento-cell");
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting)
            (e.target as HTMLElement).style.animationPlayState = "running";
        }),
      { threshold: 0.1 }
    );
    cells.forEach((cell) => observer.observe(cell));
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* NAV */}
      <nav>
        <div className="nav-inner">
          <a href="/" className="logo">
            <div className="logo-mark">MR</div>
            <div className="logo-name brand">
              MRTPV<span>REST</span>
            </div>
          </a>
          <div className="nav-links">
            <a href="#features">{t("Funciones", "Features")}</a>
            <a href="#pricing">{t("Precios", "Pricing")}</a>
            <a href="#faq">FAQ</a>
          </div>
          <div className="nav-right">
            <div className="lang-toggle">
              <button
                className={`lang-btn${lang === "es" ? " active" : ""}`}
                onClick={() => setLang("es")}
              >
                ES
              </button>
              <button
                className={`lang-btn${lang === "en" ? " active" : ""}`}
                onClick={() => setLang("en")}
              >
                EN
              </button>
            </div>
            <a
              href="https://admin.mrtpvrest.com/register"
              className="nav-cta"
            >
              {t("Prueba gratis", "Start free")}
            </a>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="hero-glow" />
        <div className="hero-badge">
          <div className="hero-badge-dot" />
          <span>{t("El POS más completo de LATAM", "The most complete POS in LATAM")}</span>
        </div>
        <h1>
          {lang === "es" ? (
            <>
              El sistema que transforma{" "}
              <span className="accent">tu restaurante</span> en datos
            </>
          ) : (
            <>
              The system that transforms{" "}
              <span className="accent">your restaurant</span> into data
            </>
          )}
        </h1>
        <p className="hero-sub">
          {t(
            "TPV, cocina, delivery y tienda online. Todo sincronizado en tiempo real, desde $29/mes.",
            "POS, kitchen display, delivery and online store. All synchronized in real time, from $29/month."
          )}
        </p>
        <div className="hero-actions">
          <a href="https://admin.mrtpvrest.com/register" className="btn-primary">
            {t("Empieza gratis — 15 días sin tarjeta", "Start free — 15 days, no card")}
          </a>
          <a href="#features" className="btn-ghost">
            {t("Ver cómo funciona", "See how it works")}
          </a>
        </div>
        <div className="hero-stats">
          <div className="stat-item">
            <div className="stat-n">+500</div>
            <div className="stat-l">{t("Restaurantes activos", "Active restaurants")}</div>
          </div>
          <div className="stat-item">
            <div className="stat-n">$0</div>
            <div className="stat-l">{t("Costo de instalación", "Setup cost")}</div>
          </div>
          <div className="stat-item">
            <div className="stat-n">5 min</div>
            <div className="stat-l">{t("Para empezar", "To get started")}</div>
          </div>
          <div className="stat-item">
            <div className="stat-n">15 días</div>
            <div className="stat-l">{t("Prueba sin tarjeta", "Trial, no card")}</div>
          </div>
        </div>
      </section>

      {/* DASHBOARD MOCKUP */}
      <section className="mockup-section">
        <div className="mockup-wrap">
          <div className="mockup-bar">
            <div className="dot dot-r" />
            <div className="dot dot-y" />
            <div className="dot dot-g" />
            <div className="mockup-url">
              admin.mrtpvrest.com/admin/restaurant-dashboard
            </div>
          </div>
          <div className="mockup-body">
            <div className="mock-sidebar">
              <div className="mock-logo">
                <div className="mock-logo-icon" />
                <div className="mock-logo-text">MRTPVREST</div>
              </div>
              <div className="mock-nav-item active">
                <div className="mock-nav-dot" /> Dashboard
              </div>
              <div className="mock-nav-item">
                <div className="mock-nav-dot" /> Pedidos
              </div>
              <div className="mock-nav-item">
                <div className="mock-nav-dot" /> Menú
              </div>
              <div className="mock-nav-item">
                <div className="mock-nav-dot" /> Empleados
              </div>
              <div className="mock-nav-item">
                <div className="mock-nav-dot" /> Reportes
              </div>
              <div className="mock-nav-item">
                <div className="mock-nav-dot" /> Delivery
              </div>
            </div>
            <div className="mock-main">
              <div className="mock-header">
                <div className="mock-title">Dashboard</div>
                <div className="mock-live">
                  <div className="mock-live-dot" /> En vivo
                </div>
              </div>
              <div className="mock-kpis">
                <div className="mock-kpi">
                  <div className="mock-kpi-label">Ventas hoy</div>
                  <div className="mock-kpi-val" style={{ color: "#a78bfa" }}>$4,280</div>
                  <div className="mock-kpi-delta up">↑ +18%</div>
                </div>
                <div className="mock-kpi">
                  <div className="mock-kpi-label">Pedidos</div>
                  <div className="mock-kpi-val" style={{ color: "#60a5fa" }}>34</div>
                  <div className="mock-kpi-delta up">↑ +5</div>
                </div>
                <div className="mock-kpi">
                  <div className="mock-kpi-label">Ticket prom.</div>
                  <div className="mock-kpi-val" style={{ color: "#34d399" }}>$126</div>
                  <div className="mock-kpi-delta up">↑ +3%</div>
                </div>
                <div className="mock-kpi">
                  <div className="mock-kpi-label">T. espera</div>
                  <div className="mock-kpi-val" style={{ color: "#fbbf24" }}>12m</div>
                  <div className="mock-kpi-delta down">↓ -2m</div>
                </div>
              </div>
              <div className="mock-grid">
                <div className="mock-card">
                  <div className="mock-card-title">Ventas por hora</div>
                  <div className="mock-bars">
                    <div className="mock-bar" style={{ height: "30%" }} />
                    <div className="mock-bar" style={{ height: "50%" }} />
                    <div className="mock-bar" style={{ height: "70%" }} />
                    <div className="mock-bar" style={{ height: "55%" }} />
                    <div className="mock-bar" style={{ height: "90%" }} />
                    <div className="mock-bar today" style={{ height: "75%" }} />
                    <div className="mock-bar" style={{ height: "40%" }} />
                    <div className="mock-bar" style={{ height: "60%" }} />
                  </div>
                </div>
                <div className="mock-card">
                  <div className="mock-card-title">Pedidos activos</div>
                  <div className="mock-orders">
                    <div className="mock-order">
                      <div className="mock-order-num">#1042</div>
                      <div className="mock-order-status st-new">Nuevo</div>
                      <div className="mock-order-total">$185</div>
                    </div>
                    <div className="mock-order">
                      <div className="mock-order-num">#1041</div>
                      <div className="mock-order-status st-prep">Prep.</div>
                      <div className="mock-order-total">$92</div>
                    </div>
                    <div className="mock-order">
                      <div className="mock-order-num">#1040</div>
                      <div className="mock-order-status st-ready">Listo</div>
                      <div className="mock-order-total">$240</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BENTO FEATURES */}
      <section className="bento" id="features">
        <div className="bento-inner">
          <div className="section-tag">{t("Funcionalidades", "Features")}</div>
          <h2 className="section-title">
            {t("Todo lo que necesitas en un solo lugar", "Everything you need in one place")}
          </h2>
          <div className="bento-grid">
            <div className="bento-cell wide">
              <div className="cell-icon icon-purple">🖥️</div>
              <div className="cell-title">
                {t("Punto de Venta táctil", "Touch Point of Sale")}
              </div>
              <div className="cell-desc">
                {t(
                  "Interface optimizada para velocidad. Múltiples tickets, variantes, modificadores y cobro en segundos. Funciona en cualquier tablet o celular.",
                  "Speed-optimized interface. Multiple tickets, variants, modifiers and checkout in seconds. Works on any tablet or phone."
                )}
              </div>
              <div className="cell-visual">
                <div className="promo-items">
                  <div className="promo-row">
                    <div className="promo-name">Burger Angus 250gr</div>
                    <div className="promo-badge-off">-20% PROMO</div>
                    <div className="promo-prices">
                      <div className="promo-old">$135</div>
                      <div className="promo-new">$108</div>
                    </div>
                  </div>
                  <div className="promo-row">
                    <div className="promo-name">Alitas BBQ (12 pzs)</div>
                    <div className="promo-badge-off">-15% PROMO</div>
                    <div className="promo-prices">
                      <div className="promo-old">$165</div>
                      <div className="promo-new">$140</div>
                    </div>
                  </div>
                  <div className="promo-row">
                    <div className="promo-name">Dedos de queso</div>
                    <div style={{ flex: 1 }} />
                    <div className="promo-prices">
                      <div className="promo-new">$65</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bento-cell">
              <div className="cell-icon icon-green">🍳</div>
              <div className="cell-title">Kitchen Display (KDS)</div>
              <div className="cell-desc">
                {t(
                  "Pantalla para cocina con alertas de urgencia, filtros por estación y notificaciones sonoras.",
                  "Kitchen screen with urgency alerts, station filters and sound notifications."
                )}
              </div>
              <div className="cell-visual">
                <div className="mini-kds">
                  <div className="kds-ticket">
                    <div className="kds-num">#1042 · Mesa 4</div>
                    <div className="kds-items">
                      <div className="kds-item">2× Burger Angus</div>
                      <div className="kds-item">1× Papas XL</div>
                    </div>
                    <div className="kds-time kds-urgent">⚠ 18 min</div>
                  </div>
                  <div className="kds-ticket">
                    <div className="kds-num">#1041 · Llevar</div>
                    <div className="kds-items">
                      <div className="kds-item">3× Alitas BBQ</div>
                      <div className="kds-item">1× Refresco</div>
                    </div>
                    <div className="kds-time kds-ok">✓ 6 min</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bento-cell">
              <div className="cell-icon icon-blue">🛵</div>
              <div className="cell-title">
                {t("Delivery en tiempo real", "Real-time delivery")}
              </div>
              <div className="cell-desc">
                {t(
                  "App para repartidores con GPS. Rastreo desde el admin y gestión de efectivo automática.",
                  "Delivery app with GPS. Track from admin and automatic cash management."
                )}
              </div>
              <div className="cell-visual">
                <div className="mini-map">
                  <div className="map-bg" />
                  <div className="pulse-ring" />
                  <div className="map-pin" style={{ top: "40%", left: "28%" }}>🛵</div>
                  <div className="map-pin" style={{ top: "55%", left: "60%" }}>🏠</div>
                  <div className="map-pin" style={{ top: "25%", left: "45%" }}>📍</div>
                </div>
              </div>
            </div>

            <div className="bento-cell">
              <div className="cell-icon icon-amber">🤖</div>
              <div className="cell-title">
                {t("Promociones con IA", "AI-powered automatic promotions")}
              </div>
              <div className="cell-desc">
                {t(
                  "Detecta platillos poco vendidos y aplica descuentos automáticamente. Sin intervención manual.",
                  "Detects slow-selling items and automatically applies discounts. No manual work needed."
                )}
              </div>
            </div>

            <div className="bento-cell">
              <div className="cell-icon icon-purple">🛒</div>
              <div className="cell-title">
                {t("Tienda online propia", "Your own online store")}
              </div>
              <div className="cell-desc">
                {t(
                  "Tu restaurante en tu dominio. Catálogo, carrito y rastreo de pedido.",
                  "Your restaurant at your own domain. Catalog, cart and order tracking."
                )}
              </div>
            </div>

            <div className="bento-cell">
              <div className="cell-icon icon-green">📊</div>
              <div className="cell-title">
                {t("Reportes inteligentes", "Smart reports")}
              </div>
              <div className="cell-desc">
                {t(
                  "Ventas por hora, productos más vendidos y canales. En tiempo real.",
                  "Hourly sales, top products, channels and shifts. All in real time."
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <section className="social-proof">
        <div className="sp-inner">
          <div className="logos-row">
            <div className="logo-placeholder">Master Burger&apos;s</div>
            <div className="logo-placeholder">Tacos El Rey</div>
            <div className="logo-placeholder">Pollos Aguilar</div>
            <div className="logo-placeholder">Burger House</div>
            <div className="logo-placeholder">La Parrilla MX</div>
          </div>
          <div className="testimonials-grid">
            <div className="tcard">
              <div className="tcard-stars">★★★★★</div>
              <q>
                {t(
                  "En 5 minutos ya estábamos vendiendo. El KDS cambió completamente nuestros tiempos de entrega.",
                  "In 5 minutes we were already selling. The KDS completely changed our delivery times."
                )}
              </q>
              <div className="tcard-author">
                <div className="tcard-av">JR</div>
                <div>
                  <div className="tcard-name">Jorge Ramírez</div>
                  <div className="tcard-biz">Tacos El Rey · CDMX</div>
                </div>
              </div>
            </div>
            <div className="tcard">
              <div className="tcard-stars">★★★★★</div>
              <q>
                {t(
                  "Teníamos Loyverse antes. MRTPVREST tiene todo eso y además delivery propio y mejores reportes.",
                  "We had Loyverse before. MRTPVREST has all that plus built-in delivery and better reports."
                )}
              </q>
              <div className="tcard-author">
                <div className="tcard-av">ML</div>
                <div>
                  <div className="tcard-name">María López</div>
                  <div className="tcard-biz">Burger House · Guadalajara</div>
                </div>
              </div>
            </div>
            <div className="tcard">
              <div className="tcard-stars">★★★★★</div>
              <q>
                {t(
                  "La tienda online me trajo 30% más pedidos en el primer mes. Mis clientes adoran rastrear su pedido.",
                  "The online store brought me 30% more orders in the first month. My customers love tracking their order."
                )}
              </q>
              <div className="tcard-author">
                <div className="tcard-av">CA</div>
                <div>
                  <div className="tcard-name">Carlos Aguilar</div>
                  <div className="tcard-biz">Pollos Aguilar · Monterrey</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="pricing" id="pricing">
        <div className="pricing-inner">
          <div className="section-tag">{t("Precios", "Pricing")}</div>
          <h2>{t("Planes que crecen contigo", "Plans that grow with you")}</h2>
          <p>
            {t(
              "Sin costos de instalación. Sin contratos. Cancela cuando quieras.",
              "No setup fees. No contracts. Cancel anytime."
            )}
          </p>
          <div className="plans">
            {/* Basic */}
            <div className="plan">
              <div className="plan-name">Basic</div>
              <div className="plan-price">$29<span>/mes</span></div>
              <div className="plan-desc">
                {t("Para restaurantes pequeños que quieren empezar.", "For small restaurants getting started.")}
              </div>
              <div className="plan-features">
                <div className="plan-feat"><span className="feat-check">✓</span><span>{t("TPV ilimitado", "Unlimited POS")}</span></div>
                <div className="plan-feat"><span className="feat-check">✓</span><span>{t("Hasta 3 empleados", "Up to 3 employees")}</span></div>
                <div className="plan-feat"><span className="feat-check">✓</span><span>{t("Tienda online básica", "Basic online store")}</span></div>
                <div className="plan-feat"><span className="feat-check">✓</span><span>{t("Reportes esenciales", "Essential reports")}</span></div>
              </div>
              <a href="https://admin.mrtpvrest.com/register" className="plan-btn">
                {t("Empezar gratis", "Start free")}
              </a>
            </div>

            {/* Pro */}
            <div className="plan popular">
              <div className="popular-tag">{t("⭐ Más popular", "⭐ Most popular")}</div>
              <div className="plan-name">Pro</div>
              <div className="plan-price">$59<span>/mes</span></div>
              <div className="plan-desc">
                {t("Para restaurantes en crecimiento con delivery propio.", "For growing restaurants with their own delivery.")}
              </div>
              <div className="plan-features">
                <div className="plan-feat"><span className="feat-check">✓</span><span>{t("Todo en Basic", "Everything in Basic")}</span></div>
                <div className="plan-feat"><span className="feat-check">✓</span><span>{t("Hasta 10 empleados", "Up to 10 employees")}</span></div>
                <div className="plan-feat"><span className="feat-check">✓</span><span>KDS de cocina</span></div>
                <div className="plan-feat"><span className="feat-check">✓</span><span>{t("App delivery + GPS", "Delivery app + GPS")}</span></div>
                <div className="plan-feat"><span className="feat-check">✓</span><span>{t("Promociones IA", "AI promotions")}</span></div>
                <div className="plan-feat"><span className="feat-check">✓</span><span>{t("Inventario y recetas", "Inventory and recipes")}</span></div>
              </div>
              <a href="https://admin.mrtpvrest.com/register" className="plan-btn">
                {t("Empezar gratis", "Start free")}
              </a>
            </div>

            {/* Unlimited */}
            <div className="plan">
              <div className="plan-name">Unlimited</div>
              <div className="plan-price">$99<span>/mes</span></div>
              <div className="plan-desc">
                {t("Para cadenas y franquicias que necesitan escala.", "For chains and franchises that need scale.")}
              </div>
              <div className="plan-features">
                <div className="plan-feat"><span className="feat-check">✓</span><span>{t("Todo en Pro", "Everything in Pro")}</span></div>
                <div className="plan-feat"><span className="feat-check">✓</span><span>{t("Empleados ilimitados", "Unlimited employees")}</span></div>
                <div className="plan-feat"><span className="feat-check">✓</span><span>{t("Multi-sucursal", "Multi-location")}</span></div>
                <div className="plan-feat"><span className="feat-check">✓</span><span>{t("API personalizada", "Custom API")}</span></div>
                <div className="plan-feat"><span className="feat-check">✓</span><span>{t("Onboarding dedicado", "Dedicated onboarding")}</span></div>
              </div>
              <a href="https://admin.mrtpvrest.com/register" className="plan-btn">
                {t("Contactar ventas", "Contact sales")}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="faq" id="faq">
        <div className="faq-inner">
          <div className="section-tag">FAQ</div>
          <h2>{t("Preguntas frecuentes", "Frequently asked questions")}</h2>

          <div className="faq-cat">{t("📱 Operación en el local", "📱 In-store operation")}</div>
          {[
            {
              q: t("¿Necesito comprar equipo caro o computadoras especiales?", "Do I need to buy expensive hardware?"),
              a: t(
                "No. MRTPVREST corre en cualquier tablet económica, iPad o celular Android/iOS. Sin cajas registradoras caras, sin hardware propietario.",
                "No. MRTPVREST runs on any affordable tablet, iPad or Android/iOS phone. No expensive cash registers, no proprietary hardware."
              ),
            },
            {
              q: t("¿Qué pasa si mis cajeros me quieren robar o cambian precios?", "What if employees try to steal or change prices?"),
              a: t(
                "El sistema exige PIN individual por empleado. Nadie puede cambiar precios, hacer descuentos o acceder al admin sin autorización. Cada movimiento queda registrado.",
                "The system requires individual PIN per employee. Nobody can change prices or access admin without authorization. Every action is logged."
              ),
            },
            {
              q: t("¿Si se va el internet, se borra todo?", "If the internet goes down, does everything get erased?"),
              a: t(
                "Los pedidos en proceso no se pierden. Al recuperar conexión el sistema sincroniza automáticamente.",
                "Orders in progress are not lost. When connection is restored, the system syncs automatically."
              ),
            },
          ].map((item, idx) => (
            <div key={idx} className={`faq-item${openFaq === idx ? " open" : ""}`}>
              <div className="faq-q" onClick={() => toggleFaq(idx)}>
                <span>{item.q}</span>
                <span className="faq-icon">+</span>
              </div>
              <div className="faq-a">{item.a}</div>
            </div>
          ))}

          <div className="faq-cat">{t("🍔 Tienda online y clientes", "🍔 Online store and customers")}</div>
          {[
            {
              q: t("¿Cómo se entera mi cocina de los pedidos online?", "How does my kitchen know about online orders?"),
              a: t(
                "Automáticamente. El pedido llega, suena una alerta y aparece en el KDS en tiempo real. Sin llamadas ni papeles.",
                "Automatically. The order arrives, an alert sounds at the POS and it appears on the kitchen KDS in real time. No calls, no paper, no errors."
              ),
            },
            {
              q: t("¿Mis clientes tienen que descargar una app para pedir?", "Do customers need to download an app to order?"),
              a: t(
                "Cero fricción. Solo escanean un QR o abren tu link y piden desde el navegador. Sin descargas.",
                "Zero friction. Just scan a QR or open your link and order from the browser. No downloads, no required registration."
              ),
            },
            {
              q: t("¿A dónde cae el dinero de los pagos con tarjeta?", "Where does card payment money go?"),
              a: t(
                "Directo a tu cuenta bancaria vía MercadoPago o Stripe. No retenemos tu dinero.",
                "Directly to your bank account via MercadoPago or Stripe. We never hold your money for a single day."
              ),
            },
          ].map((item, idx) => (
            <div key={idx + 3} className={`faq-item${openFaq === idx + 3 ? " open" : ""}`}>
              <div className="faq-q" onClick={() => toggleFaq(idx + 3)}>
                <span>{item.q}</span>
                <span className="faq-icon">+</span>
              </div>
              <div className="faq-a">{item.a}</div>
            </div>
          ))}

          <div className="faq-cat">{t("⚙️ Configuración y crecimiento", "⚙️ Setup and growth")}</div>
          {[
            {
              q: t("¿El sistema aguanta menús con combos, extras y promociones complejas?", "Can the system handle menus with combos, extras and complex promotions?"),
              a: t(
                "Sí. Variantes, modificadores, complementos y promociones automáticas. Sin límite de complejidad.",
                "Yes. You have variants, modifiers, complement groups and automatic promotions by day or volume. No complexity limit."
              ),
            },
            {
              q: t("Tengo 3 sucursales. ¿Necesito 3 cuentas?", "I have 3 locations. Do I need 3 accounts?"),
              a: t(
                "No. Con un correo controlas todas tus sucursales. Cambias de ubicación con un clic.",
                "No. With one email you control all your locations. Switch between them with one click and see each one's sales separately."
              ),
            },
            {
              q: t("No le sé mucho a las computadoras. ¿Es difícil?", "I'm not tech-savvy. Is it difficult?"),
              a: t(
                "Para nada. Nuestro asistente con IA te guía en menos de 10 minutos. Soporte completo en español.",
                "Not at all. Our AI assistant guides you in less than 10 minutes. If you have questions, our Spanish-speaking team helps via chat or video call."
              ),
            },
          ].map((item, idx) => (
            <div key={idx + 6} className={`faq-item${openFaq === idx + 6 ? " open" : ""}`}>
              <div className="faq-q" onClick={() => toggleFaq(idx + 6)}>
                <span>{item.q}</span>
                <span className="faq-icon">+</span>
              </div>
              <div className="faq-a">{item.a}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="cta-section">
        <div className="cta-glow" />
        <h2>
          {t("¿Listo para transformar tu restaurante?", "Ready to transform your restaurant?")}
        </h2>
        <p>{t("15 días gratis, sin tarjeta. Configuración en 5 minutos.", "15 days free, no card. Setup in 5 minutes.")}</p>
        <div className="cta-actions">
          <a href="https://admin.mrtpvrest.com/register" className="btn-primary">
            {t("Empezar ahora — es gratis", "Start now — it's free")}
          </a>
          <a href="#faq" className="btn-ghost">
            {t("Ver preguntas frecuentes", "See FAQ")}
          </a>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="footer-inner">
          <div className="footer-top">
            <div className="footer-brand">
              <a href="/" className="logo">
                <div className="logo-mark">MR</div>
                <div className="logo-name brand">MRTPV<span>REST</span></div>
              </a>
              <p>
                {t(
                  "El sistema POS más completo para restaurantes y negocios de alimentos en LATAM.",
                  "The most complete POS system for restaurants and food businesses in LATAM."
                )}
              </p>
            </div>
            <div className="footer-col">
              <h4>{t("Producto", "Product")}</h4>
              <a href="#features">{t("Funciones", "Features")}</a>
              <a href="#pricing">{t("Precios", "Pricing")}</a>
              <a href="https://admin.mrtpvrest.com/register">{t("Registro", "Sign up")}</a>
            </div>
            <div className="footer-col">
              <h4>{t("Recursos", "Resources")}</h4>
              <a href="#faq">FAQ</a>
              <a href="#">{t("Soporte", "Support")}</a>
              <a href="#">{t("Blog", "Blog")}</a>
            </div>
            <div className="footer-col">
              <h4>{t("Empresa", "Company")}</h4>
              <a href="#">{t("Nosotros", "About")}</a>
              <a href="#">{t("Contacto", "Contact")}</a>
              <a href="#">{t("Privacidad", "Privacy")}</a>
            </div>
          </div>
          <div className="footer-bottom">
            <p>{t("© 2026 MRTPVREST. Hecho en México para LATAM.", "© 2026 MRTPVREST. Made in Mexico for LATAM.")}</p>
            <p>mrtpvrest.com</p>
          </div>
        </div>
      </footer>
    </>
  );
}
