// Layout raíz del admin (dueño) en /admin. Define los tokens verdes MODA+ en un
// scope `.moda-admin` (la app de caja usa otra paleta) y NO mete guard — el guard
// y el shell viven en el layout del grupo (panel) para que /admin/login quede
// fuera de la protección.

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="moda-admin min-h-screen">
      <style>{`
        .moda-admin {
          --iris-400:#5fe0a6; --iris-500:#34c988; --iris-600:#1f9d63;
          --iris-soft:rgba(52,201,136,.14); --iris-glow:rgba(52,201,136,.32);
          --brand-primary:var(--iris-500); --brand-secondary:var(--iris-400);
          --bg:#07120d; --surf-1:#0d1a14; --surf-2:#12241b; --surf-3:#193024;
          --bd-1:rgba(220,255,238,.09); --border:var(--bd-1);
          --surf:var(--surf-1); --surf2:var(--surf-2);
          --tx-hi:#f3fbf6; --tx:var(--tx-hi); --tx-mut:#8fae9d; --tx-dim:#5f7e6e;
          --text:var(--tx-hi); --muted:var(--tx-mut);
          --ok:#34c988; --ok-soft:rgba(52,201,136,.14);
          --warn:#f5b54a; --warn-soft:rgba(245,181,74,.14);
          --err:#f0664d; --err-soft:rgba(240,102,77,.14);
          background:var(--bg); color:var(--tx-hi);
          font-family: var(--font-dm-sans), "DM Sans", system-ui, sans-serif;
        }
        .moda-admin .tnum { font-variant-numeric: tabular-nums; }
      `}</style>
      {children}
    </div>
  );
}
