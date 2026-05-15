/* MRTPVREST · Custom SVG charts
   Sparkline, MrrStackedBar, Funnel, CohortHeatmap, LatamMap, DonutGauge.
*/

const Sparkline = ({ data, color = 'currentColor', width = 100, height = 28, fill = true, dot = false }) => {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const pts = data.map((v, i) => [i * stepX, height - 4 - ((v - min) / range) * (height - 8)]);
  const path = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {fill && (
        <path d={`${path} L${width},${height} L0,${height} Z`} fill={color} opacity="0.12"/>
      )}
      <path d={path} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      {dot && <circle cx={last[0]} cy={last[1]} r="2.5" fill={color}/>}
    </svg>
  );
};

const MrrStackedBar = ({ data, height = 220 }) => {
  if (!data || !data.length) return null;
  const padX = 28, padY = 24;
  const w = 720, h = height;
  const innerW = w - padX * 2, innerH = h - padY * 2 - 14;
  const stepX = innerW / data.length;
  const maxTotal = Math.max(...data.map(d => d.basic + d.pro + d.unl)) * 1.12;
  const yFor = v => padY + innerH - (v / maxTotal) * innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => Math.round(maxTotal * t));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height }}>
      <defs>
        <linearGradient id="g-unl" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#f59e0b"/><stop offset="100%" stopColor="#f59e0b" stopOpacity="0.7"/>
        </linearGradient>
        <linearGradient id="g-pro" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#9472ff"/><stop offset="100%" stopColor="#7c3aed"/>
        </linearGradient>
        <linearGradient id="g-bas" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6"/><stop offset="100%" stopColor="#3b82f6" stopOpacity="0.6"/>
        </linearGradient>
      </defs>
      {/* gridlines */}
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={padX} x2={w - padX} y1={yFor(v)} y2={yFor(v)} stroke="var(--border-1)" strokeDasharray="2 3" opacity="0.5"/>
          <text x={padX - 6} y={yFor(v) + 4} fill="var(--text-dim)" fontSize="9" fontFamily="DM Mono, monospace" textAnchor="end">${(v/1000).toFixed(0)}k</text>
        </g>
      ))}
      {/* bars */}
      {data.map((d, i) => {
        const x = padX + i * stepX + stepX * 0.18;
        const bw = stepX * 0.64;
        const total = d.basic + d.pro + d.unl;
        const yBas = yFor(d.basic);
        const yPro = yFor(d.basic + d.pro);
        const yUnl = yFor(total);
        const hBas = (yFor(0) - yBas);
        const hPro = (yBas - yPro);
        const hUnl = (yPro - yUnl);
        return (
          <g key={i}>
            <rect x={x} y={yBas - hBas} width={bw} height={hBas} fill="url(#g-bas)"/>
            <rect x={x} y={yBas - hBas - hPro} width={bw} height={hPro} fill="url(#g-pro)"/>
            <rect x={x} y={yBas - hBas - hPro - hUnl} width={bw} height={hUnl} fill="url(#g-unl)" rx="3"/>
            <text x={x + bw/2} y={h - 10} fill="var(--text-dim)" fontSize="10" fontFamily="DM Mono, monospace" textAnchor="middle">{d.month}</text>
          </g>
        );
      })}
    </svg>
  );
};

const Funnel = ({ steps }) => {
  const maxW = 100;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 0' }}>
      {steps.map((s, i) => {
        const w = (s.pct / 100) * maxW;
        const drop = i > 0 ? (steps[i-1].count - s.count) : 0;
        const dropPct = i > 0 ? Math.round((1 - s.count / steps[i-1].count) * 100) : 0;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 110, fontSize: 11.5, color: 'var(--text-muted)' }}>{s.label}</div>
            <div style={{ flex: 1, position: 'relative', height: 24 }}>
              <div style={{
                width: `${w}%`, height: '100%', borderRadius: 6,
                background: `linear-gradient(90deg, ${s.color}, ${s.color}cc)`,
                display: 'flex', alignItems: 'center', padding: '0 9px',
                fontFamily: 'DM Mono, monospace', fontSize: 10.5, fontWeight: 600,
                color: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
              }}>
                {s.count.toLocaleString()} · {s.pct}%
              </div>
              {i > 0 && (
                <div style={{
                  position: 'absolute', right: 0, top: 0, height: '100%',
                  display: 'flex', alignItems: 'center',
                  fontFamily: 'DM Mono, monospace', fontSize: 10,
                  color: 'var(--err)', paddingLeft: 8,
                }}>
                  ↓ {dropPct}% drop
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const CohortHeatmap = ({ cohorts }) => {
  function bg(v) {
    if (v >= 80) return 'rgba(124,58,237,0.85)';
    if (v >= 60) return 'rgba(124,58,237,0.65)';
    if (v >= 40) return 'rgba(124,58,237,0.45)';
    if (v >= 20) return 'rgba(124,58,237,0.28)';
    if (v >  0)  return 'rgba(124,58,237,0.15)';
    return 'var(--surf-2)';
  }
  function fg(v) { return v >= 50 ? '#fff' : 'var(--text-muted)'; }
  const cols = cohorts[0]?.weeks.length || 0;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 3, fontFamily: 'DM Mono, monospace', fontSize: 10 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', color: 'var(--text-dim)', fontWeight: 500, padding: '4px 8px 4px 0' }}>Cohorte</th>
            <th style={{ color: 'var(--text-dim)', fontWeight: 500 }}>Tenants</th>
            {Array.from({length: cols}, (_,w) => (
              <th key={w} style={{ color: 'var(--text-dim)', fontWeight: 500, padding: '4px 0', width: 38 }}>W{w}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c, i) => (
            <tr key={i}>
              <td style={{ color: 'var(--text-muted)', padding: '0 8px 0 0' }}>{c.week}</td>
              <td style={{ color: 'var(--text)', textAlign: 'center', fontWeight: 600 }}>{c.size}</td>
              {c.weeks.map((v, w) => (
                <td key={w} style={{
                  width: 36, height: 22, textAlign: 'center',
                  background: bg(v), color: fg(v),
                  borderRadius: 4, fontWeight: 600,
                }}>
                  {v > 0 ? v : '·'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* LATAM simplified map — abstract dot grid with country pins.
   No real geometry; a stylized representation. */
const LATAM_PINS = {
  MX: { x: 22, y: 30 },
  GT: { x: 27, y: 39 },
  SV: { x: 28, y: 42 },
  HN: { x: 30, y: 41 },
  CR: { x: 32, y: 47 },
  PR: { x: 42, y: 38 },
  VE: { x: 46, y: 47 },
  CO: { x: 40, y: 52 },
  EC: { x: 38, y: 58 },
  PE: { x: 41, y: 66 },
  BO: { x: 47, y: 72 },
  CL: { x: 43, y: 85 },
  AR: { x: 50, y: 86 },
};
const LATAM_OUTLINE = "M22,28 Q28,28 32,30 L36,34 Q38,34 40,36 L42,36 Q44,38 46,38 L50,40 L48,46 L52,48 L50,54 L46,58 L46,64 L48,72 L50,80 L46,88 L42,90 L42,86 L38,80 L36,72 L34,64 L36,58 L34,52 L30,48 L26,42 L24,38 L22,34 Z";

const LatamMap = ({ counts }) => {
  const maxC = Math.max(1, ...Object.values(counts));
  const total = Object.values(counts).reduce((s,v)=>s+v,0);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 16, alignItems: 'start' }}>
      <svg viewBox="0 0 80 100" style={{ width: '100%', maxHeight: 280 }}>
        <defs>
          <pattern id="dots" patternUnits="userSpaceOnUse" width="3" height="3">
            <circle cx="1" cy="1" r="0.4" fill="var(--border-2)"/>
          </pattern>
          <radialGradient id="pin-grad">
            <stop offset="0%" stopColor="var(--iris-400)" stopOpacity="1"/>
            <stop offset="100%" stopColor="var(--iris-500)" stopOpacity="0"/>
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="80" height="100" fill="url(#dots)"/>
        <path d={LATAM_OUTLINE} fill="var(--surf-2)" stroke="var(--border-2)" strokeWidth="0.3"/>
        {Object.entries(LATAM_PINS).map(([cc, p]) => {
          const c = counts[cc] || 0;
          const r = c ? 1.4 + (c / maxC) * 3.2 : 0.8;
          const op = c ? 1 : 0.35;
          return (
            <g key={cc}>
              {c > 0 && <circle cx={p.x} cy={p.y} r={r * 3} fill="url(#pin-grad)" opacity="0.5"/>}
              <circle cx={p.x} cy={p.y} r={r} fill={c ? 'var(--iris-400)' : 'var(--text-dim)'} opacity={op}/>
              {c > 0 && (
                <text x={p.x + r + 0.8} y={p.y + 1} fill="var(--text)" fontSize="2.4" fontFamily="DM Mono, monospace" fontWeight="600">
                  {cc}·{c}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11.5 }}>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5, color: 'var(--text-dim)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>
          {Object.keys(counts).length} países · {total} marcas
        </div>
        {Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0, 8).map(([cc, c]) => (
          <div key={cc} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 12 + (c / maxC) * 14, height: 4, borderRadius: 2,
              background: 'var(--iris-400)', opacity: 0.4 + (c / maxC) * 0.6,
            }}/>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)', flex: 1 }}>{cc}</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--text)', fontWeight: 600 }}>{c}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const DonutGauge = ({ value, max = 100, label, sub, color = 'var(--iris-500)', size = 100 }) => {
  const r = size/2 - 8;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, value / max);
  const off = c * (1 - pct);
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surf-3)" strokeWidth="6"/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="6"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
          transform={`rotate(-90 ${size/2} ${size/2})`}/>
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 20, color: 'var(--text)', lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 8.5, color: 'var(--text-dim)', letterSpacing: '0.1em', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
};

Object.assign(window, { Sparkline, MrrStackedBar, Funnel, CohortHeatmap, LatamMap, DonutGauge });
