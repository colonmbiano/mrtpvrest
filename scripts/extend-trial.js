#!/usr/bin/env node
/*
 * scripts/extend-trial.js
 *
 * Extiende el trial (trialEndsAt y currentPeriodEnd) de un tenant en +30 días a
 * partir de hoy. También activa el status a 'TRIAL' si venía marcado como
 * EXPIRED, de modo que el middleware de tenant no bloquee al usuario.
 *
 * Busca el tenant en este orden:
 *   1. Argumentos de línea de comandos:  node extend-trial.js --slug=master-burguers
 *                                        node extend-trial.js --email=colon...@gmail.com
 *                                        node extend-trial.js --name="Master Burguer"
 *   2. Variables de entorno:             TENANT_SLUG, TENANT_EMAIL, TENANT_NAME
 *   3. Fallback:                         slug='master-burguers' (del seed)
 *
 * Requiere DATABASE_URL en el entorno (o en el .env del workspace).
 */
try {
  // dotenv es opcional. Si falta, continuamos con las env vars heredadas.
  require('dotenv').config({ path: require('path').resolve(__dirname, '../apps/backend/.env') });
  require('dotenv').config();
} catch (_) { /* no dotenv — ok */ }

const { prisma } = require('@mrtpvrest/database');

function parseArgs() {
  const out = {};
  for (const raw of process.argv.slice(2)) {
    const m = raw.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

async function findTenant({ slug, email, name }) {
  // 1. slug exacto
  if (slug) {
    const t = await prisma.tenant.findUnique({ where: { slug } });
    if (t) return t;
  }
  // 2. ownerEmail exacto
  if (email) {
    const t = await prisma.tenant.findFirst({ where: { ownerEmail: email } });
    if (t) return t;
    // 2b. por el email del usuario ADMIN asociado
    const user = await prisma.user.findUnique({
      where: { email },
      select: { tenantId: true, restaurantId: true, restaurant: { select: { tenantId: true } } },
    });
    if (user) {
      const tid = user.tenantId || user.restaurant?.tenantId;
      if (tid) {
        const t = await prisma.tenant.findUnique({ where: { id: tid } });
        if (t) return t;
      }
    }
  }
  // 3. nombre (case-insensitive contains)
  if (name) {
    const t = await prisma.tenant.findFirst({
      where: { name: { contains: name, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
    });
    if (t) return t;
  }
  return null;
}

async function main() {
  const args = parseArgs();
  const slug  = args.slug  || process.env.TENANT_SLUG  || 'master-burguers';
  const email = args.email || process.env.TENANT_EMAIL || null;
  const name  = args.name  || process.env.TENANT_NAME  || 'master burguer';

  console.log('[extend-trial] buscando tenant:', { slug, email, name });

  const tenant = await findTenant({ slug, email, name });
  if (!tenant) {
    console.error('[extend-trial] ❌ No se encontró el tenant. Revisa --slug/--email/--name.');
    process.exit(1);
  }
  console.log(`[extend-trial] ✅ tenant: ${tenant.name} (${tenant.slug}) · id=${tenant.id}`);

  const sub = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
  if (!sub) {
    console.error('[extend-trial] ❌ El tenant no tiene Subscription asociada. Créala primero.');
    process.exit(1);
  }

  const now = new Date();
  const newEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const before = {
    status:           sub.status,
    trialEndsAt:      sub.trialEndsAt,
    currentPeriodEnd: sub.currentPeriodEnd,
  };

  const keepStatus = sub.status === 'ACTIVE' ? 'ACTIVE' : 'TRIAL';

  const updated = await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      status:           keepStatus,
      trialEndsAt:      newEnd,
      currentPeriodEnd: newEnd,
      pausedAt:         null,
      cancelledAt:      null,
    },
  });

  console.log('[extend-trial] antes:', before);
  console.log('[extend-trial] ahora:', {
    status:           updated.status,
    trialEndsAt:      updated.trialEndsAt,
    currentPeriodEnd: updated.currentPeriodEnd,
  });
  console.log(`[extend-trial] 🎉 Trial extendido 30 días — vence: ${newEnd.toLocaleString('es-MX')}`);
}

main()
  .catch(e => { console.error('[extend-trial] error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
