/* MRTPVREST · Mock data
   Realistic LATAM tenants, plans, invoices, logs, errors, OTAs, API keys.
*/
(function(){
  const RNG_SEED = 42;
  function rng(seed){ let s = seed; return ()=>{ s = (s*9301+49297)%233280; return s/233280; }; }
  const rand = rng(RNG_SEED);
  const pick = arr => arr[Math.floor(rand()*arr.length)];

  // ── Plans ─────────────────────────────────────────────────────
  const PLANS = [
    { id:'pl-bas', name:'BASIC',     displayName:'Básico',    price:29,  trialDays:14, maxLocations:1,  maxEmployees:3,  hasKDS:false, hasInventory:false, hasLoyalty:false, hasReports:false, hasAPIAccess:false, allowedModules:['pos_standard'], isActive:true, color:'#3b82f6' },
    { id:'pl-pro', name:'PRO',       displayName:'Pro',       price:59,  trialDays:14, maxLocations:3,  maxEmployees:15, hasKDS:true,  hasInventory:true,  hasLoyalty:true,  hasReports:true,  hasAPIAccess:false, allowedModules:['pos_standard','kds','delivery','inventory','client_menu','waiters'], isActive:true, color:'#7c3aed' },
    { id:'pl-unl', name:'UNLIMITED', displayName:'Unlimited', price:99,  trialDays:14, maxLocations:999,maxEmployees:999,hasKDS:true,  hasInventory:true,  hasLoyalty:true,  hasReports:true,  hasAPIAccess:true,  allowedModules:['pos_standard','kds','delivery','inventory','client_menu','waiters','kiosk','employee_management','cash_shift','loyalty_advanced','multi_currency'], isActive:true, color:'#f59e0b' },
  ];

  // ── Tenants (LATAM-flavored names) ───────────────────────────
  const TENANT_NAMES = [
    ['Tacos El Güero',        '🌮', 'MX', 'mexico-city'],
    ['Birriería La Estrella', '🥩', 'MX', 'guadalajara'],
    ['Antojitos Carmela',     '🌽', 'MX', 'monterrey'],
    ['Café Andino',           '☕', 'CO', 'bogota'],
    ['Empanadas del Tío',     '🥟', 'AR', 'buenos-aires'],
    ['Parrilla Don Quincho',  '🔥', 'AR', 'cordoba'],
    ['Sushi Wabi',            '🍣', 'PE', 'lima'],
    ['Ceviche Cholo',         '🌊', 'PE', 'arequipa'],
    ['Arepas La Vecindad',    '🫓', 'VE', 'caracas'],
    ['Patacón Express',       '🍌', 'CO', 'medellin'],
    ['Pizzería Buona',        '🍕', 'CL', 'santiago'],
    ['Sopaipillas Don Tito',  '🥯', 'CL', 'valparaiso'],
    ['Galletas La Abuela',    '🍪', 'GT', 'guatemala'],
    ['Mariscos Pacífico',     '🦞', 'EC', 'guayaquil'],
    ['Locro Norteño',         '🍲', 'BO', 'la-paz'],
    ['Pollo Brasa Inca',      '🍗', 'PE', 'cusco'],
    ['Helados Crio',          '🍦', 'AR', 'rosario'],
    ['Comedor Doña Vero',     '🍛', 'MX', 'puebla'],
    ['Burritos del Norte',    '🌯', 'MX', 'tijuana'],
    ['Pupusería La Ceiba',    '🫓', 'SV', 'san-salvador'],
    ['Gallo Pinto Bar',       '🍚', 'CR', 'san-jose'],
    ['Mofongo House',         '🥘', 'PR', 'san-juan'],
    ['Chicharrón Real',       '🐖', 'MX', 'oaxaca'],
    ['Marisquería La Sirena', '🦐', 'MX', 'cancun'],
    ['Café del Volcán',       '☕', 'GT', 'antigua'],
    ['Asado Patagónico',      '🥩', 'AR', 'bariloche'],
    ['Trucha del Lago',       '🐟', 'CO', 'cartagena'],
    ['Chifa Dragón',          '🥢', 'PE', 'trujillo'],
    ['Empanadas Salteñas',    '🥟', 'BO', 'santa-cruz'],
    ['Pollo Doña Lupe',       '🍗', 'HN', 'tegucigalpa'],
  ];

  const STATUSES = ['ACTIVE','ACTIVE','ACTIVE','ACTIVE','ACTIVE','TRIAL','TRIAL','TRIAL','PAST_DUE','SUSPENDED','EXPIRED'];

  const COUNTRY_NAME = { MX:'México', CO:'Colombia', AR:'Argentina', PE:'Perú', CL:'Chile', VE:'Venezuela', GT:'Guatemala', EC:'Ecuador', BO:'Bolivia', SV:'El Salvador', CR:'Costa Rica', PR:'Puerto Rico', HN:'Honduras' };

  function daysAgo(d){ const t = new Date(); t.setDate(t.getDate()-d); return t.toISOString(); }
  function daysFromNow(d){ const t = new Date(); t.setDate(t.getDate()+d); return t.toISOString(); }

  const COLORS = ['#7c3aed','#3b82f6','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4','#8b5cf6','#22c55e','#f97316'];

  const TENANTS = TENANT_NAMES.map((row, i) => {
    const [name, emoji, country, city] = row;
    const status = pick(STATUSES);
    const planIdx = status === 'TRIAL' ? 1 : (rand()<0.3 ? 0 : (rand()<0.5 ? 1 : 2));
    const plan = PLANS[planIdx];
    const createdDaysAgo = Math.floor(rand()*220) + 1;
    const trialDays = status === 'TRIAL' ? Math.floor(rand()*14)+1 : null;
    const mrr = plan.price * (1 + (status === 'ACTIVE' ? Math.floor(rand()*3) : 0)); // multi-location upsell
    return {
      id: 't-'+String(i+1).padStart(3,'0'),
      name, emoji, country, countryName: COUNTRY_NAME[country],
      slug: city + '-' + (i+1),
      domain: `${city}.mrtpvrest.com`,
      ownerEmail: city + (i%3?'@gmail.com':'@outlook.com'),
      color: COLORS[i % COLORS.length],
      createdAt: daysAgo(createdDaysAgo),
      lastSeen: status === 'SUSPENDED' || status === 'EXPIRED' ? daysAgo(Math.floor(rand()*30)+10) : daysAgo(Math.floor(rand()*3)),
      onboardingDone: status !== 'TRIAL' || rand() > 0.5,
      onboardingStep: status === 'TRIAL' ? Math.floor(rand()*5) : 5,
      plan,
      subscription: {
        status,
        daysLeft: trialDays,
        trialEndsAt: status === 'TRIAL' ? daysFromNow(trialDays) : daysAgo(0),
        mrr,
      },
      modules: {
        hasInventory: rand() > 0.4 && plan.hasInventory,
        hasDelivery:  rand() > 0.5,
        hasWebStore:  rand() > 0.6,
        hasKiosk:     plan.id === 'pl-unl' && rand() > 0.5,
      },
      whatsapp: rand() > 0.4 ? '+52 55 ' + Math.floor(1000+rand()*9000) + ' ' + Math.floor(1000+rand()*9000) : null,
      locations: status === 'ACTIVE' ? Math.min(plan.maxLocations, Math.floor(rand()*4)+1) : 1,
      users: Math.floor(rand()*plan.maxEmployees) + 1,
      orders30d: status === 'ACTIVE' ? Math.floor(800 + rand()*4200) : (status === 'TRIAL' ? Math.floor(50 + rand()*400) : 0),
      revenue30d: status === 'ACTIVE' ? Math.floor(15000 + rand()*85000) : (status === 'TRIAL' ? Math.floor(500 + rand()*4000) : 0),
      health: status === 'ACTIVE' ? Math.floor(60 + rand()*40)
            : status === 'TRIAL'  ? Math.floor(50 + rand()*40)
            : status === 'PAST_DUE' ? Math.floor(30 + rand()*30)
            : Math.floor(rand()*40),
      uptime: Math.min(100, 95 + rand()*5),
      errorRate: status === 'ACTIVE' ? rand()*0.3 : rand()*1.5,
    };
  });

  // Health-sort to make the table interesting
  TENANTS.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));

  // ── Invoices ─────────────────────────────────────────────────
  const INVOICES = [];
  TENANTS.forEach(t => {
    if (t.subscription.status === 'ACTIVE' || t.subscription.status === 'PAST_DUE') {
      const months = Math.min(6, Math.floor((Date.now() - new Date(t.createdAt).getTime()) / (30*86400000)));
      for (let m = 0; m < months; m++) {
        const status = (m === 0 && t.subscription.status === 'PAST_DUE') ? 'FAILED'
                     : (m === 0 && rand() < 0.05) ? 'PENDING'
                     : 'PAID';
        INVOICES.push({
          id: 'inv-' + t.id + '-' + m,
          tenantId: t.id,
          tenant: t.name,
          amount: t.subscription.mrr,
          currency: 'USD',
          status,
          paidAt: status === 'PAID' ? daysAgo(m*30 + Math.floor(rand()*3)) : null,
          periodStart: daysAgo((m+1)*30),
          periodEnd:   daysAgo(m*30),
          createdAt:   daysAgo((m+1)*30),
        });
      }
    }
  });

  // ── MRR history (6 months by plan) ───────────────────────────
  const MRR_HISTORY = [];
  const months = ['Nov','Dic','Ene','Feb','Mar','Abr','May'];
  let bMrr = { basic: 580, pro: 1640, unl: 990 };
  months.forEach((m, i) => {
    bMrr.basic = Math.floor(bMrr.basic * (1 + 0.04 + rand()*0.04));
    bMrr.pro   = Math.floor(bMrr.pro   * (1 + 0.06 + rand()*0.05));
    bMrr.unl   = Math.floor(bMrr.unl   * (1 + 0.08 + rand()*0.06));
    MRR_HISTORY.push({ month: m, basic: bMrr.basic, pro: bMrr.pro, unl: bMrr.unl });
  });

  // ── Activity events (live feed) ─────────────────────────────
  const EVENT_TEMPLATES = [
    { type:'register',  weight:3, fmt:t => ({ icon:'register',  color:'info',  text:'Nueva marca registrada', sub:`plan ${t.plan.displayName}` }) },
    { type:'activated', weight:2, fmt:t => ({ icon:'activated', color:'ok',    text:'Suscripción activada',  sub:`MRR +$${t.subscription.mrr}` }) },
    { type:'trial_end', weight:2, fmt:t => ({ icon:'trial_end', color:'warn',  text:'Trial vence pronto',    sub:`${Math.floor(rand()*3)+1} días restantes` }) },
    { type:'payment',   weight:2, fmt:t => ({ icon:'payment',   color:'ok',    text:'Factura pagada',        sub:`$${t.subscription.mrr} · ${t.plan.displayName}` }) },
    { type:'failed',    weight:1, fmt:t => ({ icon:'failed',    color:'err',   text:'Pago rechazado',        sub:'tarjeta declinada' }) },
    { type:'upgrade',   weight:1, fmt:t => ({ icon:'upgrade',   color:'ok',    text:'Upgrade de plan',       sub:`Pro → Unlimited` }) },
    { type:'churn',     weight:1, fmt:t => ({ icon:'churn',     color:'err',   text:'Suscripción cancelada', sub:'churn risk realizado' }) },
    { type:'ai',        weight:1, fmt:t => ({ icon:'ai',        color:'iris',  text:'IA activó promoción',   sub:'platillos baja rotación' }) },
  ];
  function pickWeighted(arr){
    const total = arr.reduce((s,e)=>s+e.weight,0);
    let r = rand()*total;
    for (const e of arr) { r -= e.weight; if (r <= 0) return e; }
    return arr[0];
  }
  const ACTIVITY = [];
  for (let i=0; i<60; i++){
    const t = pick(TENANTS);
    const tpl = pickWeighted(EVENT_TEMPLATES);
    const meta = tpl.fmt(t);
    ACTIVITY.push({
      id: 'ev-'+i,
      type: tpl.type,
      tenant: t.name, tenantId: t.id, emoji: t.emoji, country: t.country,
      ...meta,
      ts: Date.now() - Math.floor(rand()*86400000*5),
    });
  }
  ACTIVITY.sort((a,b)=>b.ts-a.ts);

  // ── System errors ────────────────────────────────────────────
  const ERROR_MSGS = [
    { lvl:'CRITICAL', msg:'PrismaClientKnownRequestError: Unique constraint failed on the fields: (`email`)',                    path:'/api/auth/register',                 method:'POST' },
    { lvl:'CRITICAL', msg:'Gemini API error: rate_limit_exceeded — onboarding agent paused for 60s',                              path:'/api/onboarding/agent',              method:'POST' },
    { lvl:'ERROR',    msg:'StripeCardError: Your card was declined',                                                              path:'/api/billing/charge',                method:'POST' },
    { lvl:'ERROR',    msg:'TimeoutError: WhatsApp send timeout after 8000ms',                                                     path:'/api/notifications/whatsapp',        method:'POST' },
    { lvl:'ERROR',    msg:'TenantNotFoundError: subdomain "tacos-elote" not resolved',                                            path:'/api/tenant/resolve',                method:'GET'  },
    { lvl:'WARN',     msg:'Slow query (1820ms): SELECT * FROM Order WHERE tenantId = ?',                                          path:'/api/orders',                        method:'GET'  },
    { lvl:'WARN',     msg:'OTA bundle mismatch: TPV v3.18.4 < minNative v3.20.0',                                                 path:'/api/ota/check',                     method:'GET'  },
    { lvl:'WARN',     msg:'Trial expiring (24h) without conversion attempt',                                                      path:'/cron/trial-watcher',                method:'JOB'  },
    { lvl:'INFO',     msg:'Stripe webhook received: invoice.payment_succeeded',                                                   path:'/api/webhooks/stripe',               method:'POST' },
    { lvl:'INFO',     msg:'Geo-IP miss — fallback to default country MX',                                                         path:'/api/onboarding/geo',                method:'GET'  },
  ];
  const ERRORS = [];
  for (let i=0; i<48; i++){
    const e = pick(ERROR_MSGS);
    const t = pick(TENANTS);
    ERRORS.push({
      id: 'err-'+String(i+1).padStart(4,'0'),
      level: e.lvl, message: e.msg, path: e.path, method: e.method,
      tenantId: rand() > 0.4 ? t.id : null,
      tenant: rand() > 0.4 ? t.name : null,
      stack: e.lvl === 'CRITICAL' || e.lvl === 'ERROR' ? 'at Object.<anonymous> (/app/src/api/' + e.path.split('/').pop() + '.ts:' + (Math.floor(rand()*200)+10) + ':' + (Math.floor(rand()*40)+1) + ')' : null,
      createdAt: Date.now() - Math.floor(rand()*86400000*3),
    });
  }
  ERRORS.sort((a,b)=>b.createdAt-a.createdAt);

  // ── OTA Bundles ──────────────────────────────────────────────
  const OTA_BUNDLES = [];
  const CHANNELS = ['production','beta','dev'];
  CHANNELS.forEach((ch, ci) => {
    const versions = ch === 'production' ? ['3.18.4','3.18.3','3.17.0'] :
                     ch === 'beta'       ? ['3.19.0-beta.4','3.19.0-beta.3','3.19.0-beta.1'] :
                                           ['3.20.0-dev.12','3.20.0-dev.11','3.20.0-dev.7'];
    versions.forEach((v, vi) => {
      OTA_BUNDLES.push({
        id: 'ota-' + ch + '-' + vi,
        appId: 'com.mrtpvrest.tpv',
        version: v,
        channel: ch,
        sizeBytes: Math.floor(28 + rand()*8) * 1024 * 1024,
        checksum: 'sha256:' + Array.from({length:8},()=>Math.floor(rand()*16).toString(16)).join(''),
        notes: vi === 0 && ch === 'production' ? 'Fix: lock screen race-condition · KDS perf +18%' :
               vi === 0 && ch === 'beta'       ? 'New: split bill UI · receipt printer fallback' :
               'Internal build · WIP modules',
        isActive: vi === 0,
        minNative: ch === 'production' ? '3.16.0' : '3.18.0',
        installs: vi === 0 ? Math.floor(40 + rand()*60) : Math.floor(rand()*20),
        rollout: vi === 0 ? Math.floor(60 + rand()*40) : 100,
        createdAt: daysAgo(vi*3 + ci),
      });
    });
  });

  // ── API Keys ─────────────────────────────────────────────────
  const SCOPES = ['orders:read','orders:write','menu:read','menu:write','reports:read','webhooks'];
  const API_KEYS = [];
  const KEY_PURPOSES = ['Integración Rappi','Webhook Stripe','Dashboard interno','BI Looker','App de meseros','Sync POS','Mobile delivery','Backend prod'];
  for (let i=0; i<10; i++){
    const t = pick(TENANTS.filter(t=>t.subscription.status==='ACTIVE'));
    API_KEYS.push({
      id: 'ak-'+String(i+1).padStart(3,'0'),
      tenantId: t.id, tenant: t.name,
      name: KEY_PURPOSES[i % KEY_PURPOSES.length],
      prefix: 'mrt_' + (i%2 ? 'live_' : 'test_') + Array.from({length:4},()=>Math.floor(rand()*16).toString(16)).join(''),
      scopes: SCOPES.slice(0, Math.floor(rand()*4)+1),
      active: rand() > 0.15,
      lastUsedAt: rand()>0.2 ? daysAgo(Math.floor(rand()*30)) : null,
      createdAt: daysAgo(Math.floor(rand()*180)+1),
      requests24h: Math.floor(rand()*8200),
    });
  }

  // ── TPV Locations (config) ───────────────────────────────────
  const TPV_LOCATIONS = [];
  TENANTS.filter(t=>t.subscription.status==='ACTIVE' || t.subscription.status==='TRIAL').slice(0,14).forEach((t,i) => {
    for (let l=0; l<t.locations; l++){
      TPV_LOCATIONS.push({
        id: 'loc-' + t.id + '-' + l,
        tenantId: t.id, tenantName: t.name,
        emoji: t.emoji, country: t.country,
        locationName: t.locations === 1 ? 'Matriz' : ['Centro','Polanco','Sur','Plaza Mayor'][l] || `Sucursal ${l+1}`,
        locationSlug: t.slug + '-' + l,
        businessType: 'RESTAURANT',
        apiUrl: `https://api.mrtpvrest.com/t/${t.slug}`,
        allowedOrderTypes: pick([['DINE_IN','TAKEOUT','DELIVERY'], ['DINE_IN','TAKEOUT'], ['TAKEOUT','DELIVERY']]),
        lockTimeoutSec: pick([0, 60, 120, 300]),
        accentColor: t.color,
        installedVersion: pick(['3.18.4','3.18.3','3.17.0','3.18.4']),
        online: rand() > 0.12,
        lastBoot: daysAgo(Math.floor(rand()*5)),
        updatedAt: daysAgo(Math.floor(rand()*20)),
      });
    }
  });

  // ── Funnel: trial → activation → conversion → retention ─────
  const FUNNEL = [
    { label:'Registros',     count: 412, pct: 100, color:'var(--iris-500)' },
    { label:'Onboarding IA', count: 384, pct: 93,  color:'var(--iris-400)' },
    { label:'Primer venta',  count: 318, pct: 77,  color:'var(--iris-300)' },
    { label:'Conversión',    count: 186, pct: 45,  color:'var(--ok)' },
    { label:'Retención 90d', count: 142, pct: 34,  color:'var(--ok)' },
  ];

  // ── Cohort retention (12 weeks back × 12 weeks forward) ─────
  const COHORTS = [];
  for (let i=0; i<8; i++){
    const cohort = { week: `S-${i*2}`, size: Math.floor(40 + rand()*30) - i*2, weeks:[] };
    cohort.weeks.push(100);
    let v = 100;
    for (let w=1; w<8; w++){
      v = Math.max(0, v - (rand()*12 + 2));
      cohort.weeks.push(Math.floor(v));
    }
    COHORTS.push(cohort);
  }

  // ── LATAM map data ──────────────────────────────────────────
  const LATAM_COUNTS = {};
  TENANTS.forEach(t => { LATAM_COUNTS[t.country] = (LATAM_COUNTS[t.country] || 0) + 1; });

  // ── Aggregate stats ─────────────────────────────────────────
  function totalsByPlan(){
    const out = { basic: 0, pro: 0, unl: 0 };
    TENANTS.filter(t => t.subscription.status === 'ACTIVE').forEach(t => {
      if (t.plan.id === 'pl-bas') out.basic += t.subscription.mrr;
      if (t.plan.id === 'pl-pro') out.pro   += t.subscription.mrr;
      if (t.plan.id === 'pl-unl') out.unl   += t.subscription.mrr;
    });
    return out;
  }
  const PLAN_TOTALS = totalsByPlan();
  const MRR_NOW = PLAN_TOTALS.basic + PLAN_TOTALS.pro + PLAN_TOTALS.unl;

  const STATS = {
    mrr: MRR_NOW,
    mrrGrowth: 14.8,
    active: TENANTS.filter(t=>t.subscription.status==='ACTIVE').length,
    trial:  TENANTS.filter(t=>t.subscription.status==='TRIAL').length,
    pastDue:TENANTS.filter(t=>t.subscription.status==='PAST_DUE').length,
    suspended: TENANTS.filter(t=>t.subscription.status==='SUSPENDED').length,
    expired:TENANTS.filter(t=>t.subscription.status==='EXPIRED').length,
    total:  TENANTS.length,
    arr:    MRR_NOW * 12,
    arpu:   Math.round(MRR_NOW / Math.max(1, TENANTS.filter(t=>t.subscription.status==='ACTIVE').length)),
    churn:  3.2,
    nps:    52,
    conversion: Math.round((TENANTS.filter(t=>t.subscription.status==='ACTIVE').length / TENANTS.length) * 100),
    planTotals: PLAN_TOTALS,
  };

  // ── Alerts (SLA / critical) ──────────────────────────────────
  const ALERTS = [
    { id:'al-1', sev:'critical', title:'Stripe webhook failing',     desc:'5 failed deliveries in last 15min · `invoice.payment_failed`', age:'2 min',   ack:false },
    { id:'al-2', sev:'critical', title:'TPV offline — Pollo Brasa Inca · Cusco',   desc:'Sin conexión hace 18min · pings perdidos: 24', age:'18 min',  ack:false },
    { id:'al-3', sev:'warn',     title:'Trial vence en <24h sin pago',  desc:'3 marcas sin tarjeta · Empanadas del Tío, Chifa Dragón, Sopaipillas Don Tito', age:'1 h', ack:false },
    { id:'al-4', sev:'warn',     title:'Latencia /api/saas/mrr p95 +220%',   desc:'1820ms vs 580ms baseline · query plan regresión', age:'3 h', ack:true },
  ];

  // ── Public export ────────────────────────────────────────────
  window.MRTPV_DATA = {
    PLANS, TENANTS, INVOICES, MRR_HISTORY, ACTIVITY, ERRORS,
    OTA_BUNDLES, API_KEYS, TPV_LOCATIONS, FUNNEL, COHORTS,
    LATAM_COUNTS, STATS, ALERTS, COUNTRY_NAME,
  };
})();
