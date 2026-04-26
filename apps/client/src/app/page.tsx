"use client";

const ACCENT = "#ff5c35";

const features = [
  { icon: "🖥️", title: "TPV Inteligente", desc: "Punto de venta táctil para tomar pedidos en mesa, barra o mostrador. Rápido y sin errores." },
  { icon: "📱", title: "Pedidos Online", desc: "Tus clientes ordenan desde su teléfono escaneando un QR. Sin apps, sin comisiones." },
  { icon: "🛵", title: "App de Delivery", desc: "Asigna repartidores, rastrea entregas en tiempo real y mantén a tus clientes informados." },
  { icon: "👨‍🍳", title: "Cocina Digital (KDS)", desc: "Pantalla de cocina en tiempo real. Adiós a los papelitos, hola a los pedidos bien coordinados." },
  { icon: "📊", title: "Reportes en Tiempo Real", desc: "Ventas, productos más vendidos, turnos y caja. Todo en tu panel, actualizado al instante." },
  { icon: "🏪", title: "Multi-Sucursal", desc: "Gestiona todas tus ubicaciones desde un solo lugar. Menús, empleados y reportes por sucursal." },
];

const steps = [
  { n: "01", title: "Registra tu restaurante", desc: "Crea tu cuenta en minutos. Sin tarjeta de crédito para empezar." },
  { n: "02", title: "Configura tu menú", desc: "Sube categorías, platillos, precios y fotos desde el panel de admin." },
  { n: "03", title: "Empieza a vender", desc: "Abre el TPV en tu tablet, comparte el QR de tu menú y listo." },
];

export default function LandingPage() {
  return (
    <div style={{ background: "#0a0a0a", color: "#fff", fontFamily: "system-ui, -apple-system, sans-serif", minHeight: "100vh" }}>

      {/* NAV */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "1.25rem 2rem", borderBottom: "1px solid #1a1a1a",
        position: "sticky", top: 0, background: "#0a0a0aee", zIndex: 50,
        backdropFilter: "blur(12px)",
      }}>
        <span style={{ fontWeight: 900, fontSize: "1.4rem", letterSpacing: "-1px", color: ACCENT }}>MRTPVREST</span>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <a href="https://admin.mrtpvrest.com" style={{ color: "#888", textDecoration: "none", fontSize: "0.875rem" }}>Admin</a>
          <a href="https://tpv.mrtpvrest.com" style={{ color: "#888", textDecoration: "none", fontSize: "0.875rem" }}>TPV</a>
          <a href="https://admin.mrtpvrest.com/register" style={{
            background: ACCENT, color: "#000", padding: "0.5rem 1.25rem",
            borderRadius: "2rem", fontWeight: 800, fontSize: "0.875rem", textDecoration: "none",
          }}>
            Comenzar gratis
          </a>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ textAlign: "center", padding: "6rem 1.5rem 5rem", maxWidth: 800, margin: "0 auto" }}>
        <div style={{
          display: "inline-block", background: "#ff5c3515", color: ACCENT,
          padding: "0.35rem 1rem", borderRadius: "2rem", fontSize: "0.8rem",
          fontWeight: 700, marginBottom: "1.5rem", border: `1px solid ${ACCENT}40`,
        }}>
          Sistema POS para restaurantes 🍔
        </div>
        <h1 style={{
          fontSize: "clamp(2.5rem, 7vw, 5rem)", fontWeight: 900,
          lineHeight: 1.05, letterSpacing: "-2px", margin: "0 0 1.5rem",
        }}>
          El sistema <span style={{ color: ACCENT }}>todo en uno</span><br />para tu restaurante
        </h1>
        <p style={{
          color: "#888", fontSize: "clamp(1rem, 2.5vw, 1.2rem)",
          maxWidth: 560, margin: "0 auto 2.5rem", lineHeight: 1.7,
        }}>
          TPV, pedidos online, delivery, cocina digital y reportes. Todo conectado, desde una sola plataforma.
        </p>
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
          <a href="https://admin.mrtpvrest.com/register" style={{
            background: ACCENT, color: "#000", padding: "0.9rem 2.25rem",
            borderRadius: "3rem", fontWeight: 900, fontSize: "1.05rem", textDecoration: "none",
          }}>
            Comenzar gratis →
          </a>
          <a href="https://admin.mrtpvrest.com" style={{
            background: "#1a1a1a", color: "#fff", padding: "0.9rem 2.25rem",
            borderRadius: "3rem", fontWeight: 800, fontSize: "1.05rem",
            textDecoration: "none", border: "1px solid #2a2a2a",
          }}>
            Ver demo
          </a>
        </div>
        <p style={{ color: "#444", fontSize: "0.8rem", marginTop: "1.25rem" }}>
          Sin tarjeta de crédito · Configúralo en minutos
        </p>
      </section>

      {/* FEATURES */}
      <section style={{ padding: "4rem 1.5rem", maxWidth: 1100, margin: "0 auto" }}>
        <h2 style={{
          textAlign: "center", fontSize: "clamp(1.75rem, 4vw, 2.75rem)",
          fontWeight: 900, marginBottom: "0.75rem", letterSpacing: "-1px",
        }}>
          Todo lo que necesitas
        </h2>
        <p style={{ textAlign: "center", color: "#555", marginBottom: "3rem", fontSize: "1rem" }}>
          Una plataforma, todas las herramientas
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.25rem" }}>
          {features.map((f) => (
            <div key={f.title} style={{
              background: "#111", border: "1px solid #1e1e1e",
              borderRadius: "1.25rem", padding: "1.75rem",
            }}>
              <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>{f.icon}</div>
              <h3 style={{ fontWeight: 800, fontSize: "1.05rem", marginBottom: "0.5rem", margin: "0 0 0.5rem" }}>{f.title}</h3>
              <p style={{ color: "#555", fontSize: "0.9rem", lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ padding: "5rem 1.5rem", background: "#070707" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h2 style={{
            textAlign: "center", fontSize: "clamp(1.75rem, 4vw, 2.75rem)",
            fontWeight: 900, marginBottom: "0.75rem", letterSpacing: "-1px",
          }}>
            ¿Cómo funciona?
          </h2>
          <p style={{ textAlign: "center", color: "#555", marginBottom: "3.5rem" }}>
            En 3 pasos tienes tu restaurante digitalizado
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "2.5rem" }}>
            {steps.map((s) => (
              <div key={s.n} style={{ textAlign: "center" }}>
                <div style={{ fontSize: "3.5rem", fontWeight: 900, color: ACCENT, opacity: 0.25, lineHeight: 1, marginBottom: "1rem" }}>{s.n}</div>
                <h3 style={{ fontWeight: 800, fontSize: "1.05rem", marginBottom: "0.5rem", margin: "0 0 0.5rem" }}>{s.title}</h3>
                <p style={{ color: "#555", fontSize: "0.875rem", lineHeight: 1.6, margin: 0 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section style={{ textAlign: "center", padding: "6rem 1.5rem", maxWidth: 680, margin: "0 auto" }}>
        <h2 style={{
          fontSize: "clamp(2rem, 5vw, 3.5rem)", fontWeight: 900,
          letterSpacing: "-1.5px", marginBottom: "1rem",
        }}>
          ¿Listo para modernizar<br />tu restaurante?
        </h2>
        <p style={{ color: "#555", fontSize: "1rem", marginBottom: "2.5rem", lineHeight: 1.6 }}>
          Únete a los restaurantes que ya gestionan sus operaciones con MRTPVREST.
        </p>
        <a href="https://admin.mrtpvrest.com/register" style={{
          background: ACCENT, color: "#000", padding: "1rem 2.75rem",
          borderRadius: "3rem", fontWeight: 900, fontSize: "1.1rem", textDecoration: "none",
          display: "inline-block",
        }}>
          Crear cuenta gratis →
        </a>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: "1px solid #1a1a1a", padding: "2rem 1.5rem", textAlign: "center" }}>
        <div style={{ marginBottom: "1rem" }}>
          <span style={{ fontWeight: 900, fontSize: "1.1rem", color: ACCENT }}>MRTPVREST</span>
        </div>
        <div style={{ display: "flex", gap: "2rem", justifyContent: "center", marginBottom: "1.25rem", flexWrap: "wrap" }}>
          {[
            { label: "Admin", href: "https://admin.mrtpvrest.com" },
            { label: "TPV", href: "https://tpv.mrtpvrest.com" },
            { label: "API Status", href: "https://api.mrtpvrest.com/health" },
            { label: "Registro", href: "https://admin.mrtpvrest.com/register" },
          ].map(l => (
            <a key={l.label} href={l.href} style={{ color: "#444", textDecoration: "none", fontSize: "0.85rem" }}>{l.label}</a>
          ))}
        </div>
        <p style={{ color: "#2a2a2a", fontSize: "0.8rem", margin: 0 }}>
          © 2026 MRTPVREST · Todos los derechos reservados
        </p>
      </footer>
    </div>
  );
}
