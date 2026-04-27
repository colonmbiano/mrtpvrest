/* Frame: Lock screen */

function FrameLock({ tweaks }) {
  const { mode, theme } = tweaks;
  const [pin, setPin] = React.useState('••••');
  return (
    <div className="tpv-frame" data-mode={mode} data-theme={theme} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, width: '100%', maxWidth: 880, position: 'relative', zIndex: 1 }}>
        {/* Left brand panel */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '8px 0' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-fg)', fontWeight: 700, fontSize: 14 }}>M</div>
              <span className="mono" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>MRTPVREST</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>Sucursal Centro · Caja 02</div>
            <h1 style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.1, color: 'var(--text-primary)', margin: 0 }}>Buenas tardes.</h1>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginTop: 12, lineHeight: 1.5 }}>Ingresa tu PIN para iniciar sesión y abrir el turno.</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--text-muted)' }}>
              <Icon name="clock" size={14} /> <span className="mono">14:42 · Lun 27 abr</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--text-muted)' }}>
              <Icon name="pin" size={14} /> Av. Reforma 142, CDMX
            </div>
          </div>
        </div>

        {/* Right PIN panel */}
        <div className="card" style={{ padding: 28, boxShadow: 'var(--shadow-lg)' }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Acceso</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>PIN del empleado</div>
          {/* PIN display */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 24 }}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{
                width: 56, height: 64, borderRadius: 14,
                background: 'var(--surface-2)',
                border: `1.5px solid ${i < pin.length ? 'var(--brand)' : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {i < pin.length && <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--brand)' }} />}
              </div>
            ))}
          </div>
          {/* Keypad */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {[1,2,3,4,5,6,7,8,9].map(n => (
              <button key={n} style={{
                height: 60, borderRadius: 14, background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                fontSize: 22, fontWeight: 600, fontFamily: 'var(--font-mono)',
                color: 'var(--text-primary)',
              }}>{n}</button>
            ))}
            <button style={{ height: 60, borderRadius: 14, background: 'transparent', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>Limpiar</button>
            <button style={{ height: 60, borderRadius: 14, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 22, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>0</button>
            <button style={{ height: 60, borderRadius: 14, background: 'transparent', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Icon name="x" size={14} /> Borrar
            </button>
          </div>
          <button style={{ width: '100%', marginTop: 16, height: 50, borderRadius: 14, background: 'var(--brand)', color: 'var(--brand-fg)', fontWeight: 700, fontSize: 14, letterSpacing: '0.04em' }}>
            Acceder
          </button>
          <button style={{ width: '100%', marginTop: 8, height: 38, borderRadius: 12, background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 500, border: '1px solid var(--border)' }}>
            Cambiar sucursal
          </button>
        </div>
      </div>
    </div>
  );
}

window.FrameLock = FrameLock;
