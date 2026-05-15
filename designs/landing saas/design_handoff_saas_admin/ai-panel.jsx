/* MRTPVREST · AI Side Panel
   A faked-but-believable Gemini-powered assistant.
   Summaries: errors, payments, billing, churn, top tenants.
*/

const AI_QUICK_ACTIONS = [
  { id: 'errors',   icon: 'alert',     label: 'Resumen de errores' },
  { id: 'billing',  icon: 'receipt',   label: 'Estado de facturación' },
  { id: 'churn',    icon: 'flame',     label: '¿Quién va a churnear?' },
  { id: 'top',      icon: 'trend-up',  label: 'Top 5 marcas por MRR' },
  { id: 'trials',   icon: 'clock',     label: 'Trials por vencer' },
  { id: 'health',   icon: 'heart-pulse', label: 'Health de la plataforma' },
];

// ── Pre-built AI responses (rich, with embedded data cards) ──
function buildAiResponses(data) {
  const { STATS, ALERTS, TENANTS, ERRORS, INVOICES, ACTIVITY } = data;

  const failedInvoices = INVOICES.filter(i => i.status === 'FAILED').length;
  const pendingInvoices = INVOICES.filter(i => i.status === 'PENDING').length;
  const trialsEndingSoon = TENANTS.filter(t => t.subscription.status === 'TRIAL' && t.subscription.daysLeft != null && t.subscription.daysLeft <= 3);
  const topTenants = [...TENANTS]
    .filter(t => t.subscription.status === 'ACTIVE')
    .sort((a, b) => b.subscription.mrr - a.subscription.mrr)
    .slice(0, 5);
  const churnRisk = TENANTS.filter(t =>
    (t.subscription.status === 'PAST_DUE') ||
    (t.subscription.status === 'ACTIVE' && t.health < 55)
  ).slice(0, 4);
  const errLastDay = ERRORS.filter(e => Date.now() - e.createdAt < 86400000);
  const critical = errLastDay.filter(e => e.level === 'CRITICAL').length;
  const errors24 = errLastDay.length;

  return {
    errors: {
      preface: "Te resumo los errores de las últimas 24 h:",
      card: {
        title: 'Errores · 24 h',
        rows: [
          { k: 'Total registrados',      v: errors24 },
          { k: 'Críticos',               v: critical, kind: 'err' },
          { k: 'Errores',                v: errLastDay.filter(e=>e.level==='ERROR').length, kind: 'err' },
          { k: 'Warnings',               v: errLastDay.filter(e=>e.level==='WARN').length, kind: 'warn' },
        ],
      },
      tail: `**Atención prioritaria:** ${critical} errores **críticos** sin resolver, principalmente en \`/api/auth/register\` (constraint únicos) y \`/api/onboarding/agent\` (rate-limit Gemini). Sugiero pausar el flujo de registro 60 s y rotar la API key. ¿Quieres que prepare el incidente?`,
    },
    billing: {
      preface: "Estado actual de facturación:",
      card: {
        title: 'Facturación · este mes',
        rows: [
          { k: 'MRR',                    v: fmtMoney(STATS.mrr) },
          { k: 'ARR (proyectado)',       v: fmtMoney(STATS.arr) },
          { k: 'ARPU',                   v: fmtMoney(STATS.arpu) },
          { k: 'Crecimiento vs mes ant.', v: `+${STATS.mrrGrowth}%`, kind: 'ok' },
          { k: 'Facturas fallidas',      v: failedInvoices, kind: failedInvoices > 0 ? 'err' : 'ok' },
          { k: 'Facturas pendientes',    v: pendingInvoices, kind: pendingInvoices > 0 ? 'warn' : 'ok' },
        ],
      },
      tail: `El plan **Pro** sigue siendo el motor del MRR con **$${STATS.planTotals.pro.toLocaleString()}**/mes. Hay ${failedInvoices} pagos rechazados que requieren retry — todos son tarjetas vencidas. ¿Lanzo el reintento automático?`,
    },
    churn: {
      preface: "Estos son los tenants con mayor riesgo de churn ahora mismo:",
      card: {
        title: 'Top 4 · riesgo de churn',
        rows: churnRisk.map(t => ({ k: `${t.emoji} ${t.name}`, v: `Health ${t.health}` , kind: t.health < 40 ? 'err' : 'warn' })),
      },
      tail: `**Por qué están en riesgo:** baja actividad de TPV (< 30 órdenes/d), tarjeta declinada o uso de módulos cayó >50% vs mes anterior. Recomiendo: contacto por WhatsApp + descuento del 20% por 2 meses. ¿Genero la campaña?`,
    },
    top: {
      preface: "Top 5 marcas por MRR este mes:",
      card: {
        title: 'Ranking MRR · activas',
        rows: topTenants.map((t, i) => ({
          k: `${i+1}. ${t.emoji} ${t.name}`,
          v: fmtMoney(t.subscription.mrr) + '/mo',
        })),
      },
      tail: `Las tres primeras son **multi-sucursal** (plan Unlimited). Vale la pena ofrecerles soporte premium y caso de estudio — el de "Tacos El Güero" ya tiene 4 sucursales y crece 18%/mes.`,
    },
    trials: {
      preface: trialsEndingSoon.length
        ? `Hay **${trialsEndingSoon.length}** trials que vencen en los próximos 3 días:`
        : 'Buenas noticias: ningún trial vence en los próximos 3 días.',
      card: trialsEndingSoon.length ? {
        title: 'Trials · próximos 3 días',
        rows: trialsEndingSoon.slice(0,5).map(t => ({
          k: `${t.emoji} ${t.name}`,
          v: `${t.subscription.daysLeft}d · ${t.onboardingDone ? 'onboarding OK' : 'incompleto'}`,
          kind: t.subscription.daysLeft <= 1 ? 'err' : 'warn',
        })),
      } : null,
      tail: trialsEndingSoon.length
        ? 'Conversión histórica: 45%. Sugiero email + WhatsApp con código de descuento "BIENVENIDO20" y demo personalizada para los que tienen onboarding incompleto. ¿Programo el envío para las 10 AM?'
        : 'Conversión histórica trial → paid: 45% (+3pts vs mes anterior).',
    },
    health: {
      preface: "Estado general de la plataforma ahora mismo:",
      card: {
        title: 'Sistema · live',
        rows: [
          { k: 'Uptime (30d)',           v: '99.98%', kind: 'ok' },
          { k: 'Latencia p95',           v: '142 ms',  kind: 'ok' },
          { k: 'TPVs online',            v: '94 / 96', kind: 'warn' },
          { k: 'Alertas críticas',       v: ALERTS.filter(a=>a.sev==='critical'&&!a.ack).length, kind: 'err' },
          { k: 'Marcas activas',         v: STATS.active },
          { k: 'Errores · 24h',          v: errors24, kind: errors24 > 30 ? 'warn' : 'ok' },
        ],
      },
      tail: `Hay **2 TPVs offline** (Pollo Brasa Inca · Cusco y otro más). El webhook de Stripe está fallando — investigar antes de impactar pagos. Todo lo demás verde.`,
    },
    default: {
      preface: 'Puedo ayudarte con resúmenes, alertas y acciones rápidas sobre tu plataforma. Algunas cosas que ya conozco:',
      tail: '• Errores y stack traces · 24h y 7d\n• Facturación, MRR, churn y health por tenant\n• Onboarding y trial conversion\n• Top performers y oportunidades de upsell\n\nPregúntame en lenguaje natural — o usa los atajos de abajo.',
    },
  };
}

const AiBubble = ({ msg, responses }) => {
  if (msg.role === 'user') {
    return (
      <div className="aip-msg user">
        <div className="aip-bubble">{msg.content}</div>
      </div>
    );
  }
  const r = responses && responses[msg.intent];
  return (
    <div className="aip-msg ai">
      <div className="aip-msg-meta">
        <Icon name="sparkles" size={9}/>
        <span>MRTPV Intelligence</span>
        <span style={{ opacity: 0.5 }}>· {timeAgo(msg.ts)}</span>
      </div>
      <div className="aip-bubble">
        {r ? (
          <>
            <Markdown text={r.preface}/>
            {r.card && (
              <div className="aip-card">
                <h5>{r.card.title}</h5>
                {r.card.rows.map((row, i) => (
                  <div className="aip-card-row" key={i}>
                    <span style={{ color: 'var(--text-muted)' }}>{row.k}</span>
                    <span className="v" style={{ color: row.kind === 'err' ? 'var(--err)' : row.kind === 'warn' ? 'var(--warn)' : row.kind === 'ok' ? 'var(--ok)' : 'var(--text)' }}>
                      {row.v}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {r.tail && <div style={{ marginTop: 8 }}><Markdown text={r.tail}/></div>}
          </>
        ) : (
          <Markdown text={msg.content}/>
        )}
      </div>
    </div>
  );
};

// Tiny markdown for **bold**, `code`, line breaks
const Markdown = ({ text }) => {
  if (!text) return null;
  const lines = text.split('\n');
  return lines.map((line, i) => {
    // Split on **bold** and `code`
    const parts = [];
    let rest = line;
    let m;
    while ((m = rest.match(/(\*\*(.+?)\*\*|`([^`]+)`)/))) {
      const idx = m.index;
      if (idx > 0) parts.push(rest.slice(0, idx));
      if (m[2]) parts.push(<strong key={parts.length}>{m[2]}</strong>);
      else if (m[3]) parts.push(<code key={parts.length}>{m[3]}</code>);
      rest = rest.slice(idx + m[0].length);
    }
    if (rest) parts.push(rest);
    return <p key={i} style={{ marginTop: i > 0 ? 4 : 0 }}>{parts}</p>;
  });
};

const AiPanel = ({ onClose, initialIntent }) => {
  const data = window.MRTPV_DATA;
  const responses = React.useMemo(() => buildAiResponses(data), []);
  const [messages, setMessages] = React.useState(() => [
    { role: 'ai', ts: Date.now() - 60000, intent: null, content: 'Hola Juan 👋 — soy **MRTPV Intelligence**. Puedo resumir errores, pagos, churn risk y más. Usa los atajos o pregúntame algo.' },
  ]);
  const [input, setInput] = React.useState('');
  const [typing, setTyping] = React.useState(false);
  const bodyRef = React.useRef();

  // Auto-scroll
  React.useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, typing]);

  function trigger(intent, label) {
    setMessages(m => [...m, { role: 'user', ts: Date.now(), content: label || intent }]);
    setTyping(true);
    const delay = 700 + Math.random() * 600;
    setTimeout(() => {
      setMessages(m => [...m, { role: 'ai', ts: Date.now(), intent, content: '' }]);
      setTyping(false);
    }, delay);
  }

  // Honor initial intent
  React.useEffect(() => {
    if (initialIntent && responses[initialIntent]) {
      setTimeout(() => trigger(initialIntent, AI_QUICK_ACTIONS.find(a=>a.id===initialIntent)?.label || initialIntent), 200);
    }
  }, [initialIntent]);

  function detectIntent(q) {
    const s = q.toLowerCase();
    if (/error|critic|fall|except/.test(s)) return 'errors';
    if (/factur|pago|invoice|mrr|cobr|billing|ingreso/.test(s)) return 'billing';
    if (/churn|cancel|riesgo|baja/.test(s)) return 'churn';
    if (/top|mejor|ranking|mas|más/.test(s)) return 'top';
    if (/trial|prueba|venc|expir/.test(s)) return 'trials';
    if (/health|estado|sistem|uptime|salud/.test(s)) return 'health';
    return 'default';
  }

  function send() {
    if (!input.trim()) return;
    const q = input.trim();
    setInput('');
    setMessages(m => [...m, { role: 'user', ts: Date.now(), content: q }]);
    setTyping(true);
    setTimeout(() => {
      const intent = detectIntent(q);
      setMessages(m => [...m, { role: 'ai', ts: Date.now(), intent, content: '' }]);
      setTyping(false);
    }, 900 + Math.random() * 600);
  }

  return (
    <aside className="aip">
      <div className="aip-h">
        <div className="aip-logo"><Icon name="sparkles" size={15}/></div>
        <div className="aip-title">
          <h4>MRTPV Intelligence</h4>
          <p>Super Admin · Gemini</p>
        </div>
        <button className="aip-x" onClick={onClose} title="Cerrar"><Icon name="x" size={16}/></button>
      </div>
      <div className="aip-body" ref={bodyRef}>
        {messages.map((m, i) => <AiBubble key={i} msg={m} responses={responses}/>)}
        {typing && (
          <div className="aip-msg ai">
            <div className="aip-msg-meta"><Icon name="sparkles" size={9}/><span>Pensando…</span></div>
            <div className="aip-typing"><span/><span/><span/></div>
          </div>
        )}
      </div>
      <div className="aip-quick">
        {AI_QUICK_ACTIONS.map(a => (
          <button key={a.id} className="aip-chip" onClick={() => trigger(a.id, a.label)}>
            <Icon name={a.icon} size={12}/>
            {a.label}
          </button>
        ))}
      </div>
      <div className="aip-input">
        <div className="aip-input-wrap">
          <textarea
            placeholder="Pregúntame algo… (¿cuántos pagos fallaron hoy?)"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={1}
          />
          <button className="aip-send" onClick={send} disabled={!input.trim()}>
            <Icon name="send" size={14}/>
          </button>
        </div>
        <div className="aip-foot">
          <Icon name="zap" size={10}/>
          <span>Powered by Gemini</span>
        </div>
      </div>
    </aside>
  );
};

window.AiPanel = AiPanel;
