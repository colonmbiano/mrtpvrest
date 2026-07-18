// Layout raíz del admin (dueño) en /admin. Define los tokens verdes de MRTPV Retail en un
// scope `.moda-admin` (la app de caja usa otra paleta) y NO mete guard — el guard
// y el shell viven en el layout del grupo (panel) para que /admin/login quede
// fuera de la protección.

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="moda-admin min-h-screen">
      <style>{`
        .moda-admin {
          /* Tema CLARO premium "retail" (Shopify/Stripe/Linear) — acento verde de MRTPV Retail. */
          --bg:#f6f8fa; --surf-1:#ffffff; --surf-2:#f1f5f9; --surf-3:#e9eef3;
          --bd-1:#e2e8f0; --bd-2:#cbd5e1; --border:var(--bd-1);
          --surf:var(--surf-1); --surf2:var(--surf-2);
          --tx-hi:#0f172a; --tx:#0f172a; --tx-mid:#334155; --tx-mut:#64748b; --tx-dim:#94a3b8;
          --text:var(--tx-hi); --muted:var(--tx-mut);
          /* Acento de marca NARANJA (logo MRTPV Retail). iris-* es el acento
             decorativo (chips activos, glows); brand-* el acento primario. */
          --iris-400:#fb923c; --iris-500:#f97316; --iris-600:#ea580c;
          --iris-soft:#ffedd5; --iris-glow:rgba(249,115,22,.22);
          --brand-primary:#f97316; --brand-secondary:#fb923c; --brand-dark:#ea580c;
          /* --ok es ÉXITO/stock disponible: se queda VERDE a propósito, no es marca. */
          --ok:#16a34a; --ok-soft:#dcfce7;
          --warn:#b45309; --warn-soft:#fef3c7;
          --err:#dc2626; --err-soft:#fee2e2;
          --info:#2563eb; --info-soft:#dbeafe;
          --purple:#7c3aed; --purple-soft:#ede9fe;
          /* Sidebar oscuro elegante (constante, independiente del cuerpo claro). */
          --sidebar:#0f172a; --sidebar-soft:#111827; --sidebar-bd:rgba(255,255,255,.08);
          --shadow-card:0 12px 36px rgba(15,23,42,.06);
          --shadow-soft:0 8px 24px rgba(15,23,42,.045);
          background:var(--bg); color:var(--tx-hi);
          font-family: var(--font-dm-sans), "DM Sans", system-ui, sans-serif;
        }
        .moda-admin .tnum { font-variant-numeric: tabular-nums; }
      `}</style>
      {children}
    </div>
  );
}
