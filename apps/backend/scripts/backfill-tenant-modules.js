// scripts/backfill-tenant-modules.js
//
// Backfill idempotente de la tabla canónica TenantModule a partir del estado
// legacy de cada tenant (enabledModules String[] + flags hasInventory/
// hasDelivery/hasWebStore). Seguro de re-ejecutar: hace upsert por
// (tenantId, moduleKey).
//
// Uso (tras `prisma db push` que crea la tabla tenant_modules):
//   node apps/backend/scripts/backfill-tenant-modules.js
//
// NO usa `migrate dev` — el flujo del proyecto es `db push` (ver CLAUDE.md).

const { prisma } = require('@mrtpvrest/database')
const { deriveActiveKeys, syncTenantModuleRows, CANONICAL_KEYS } = require('../src/lib/tenantModules')

async function main() {
  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      slug: true,
      enabledModules: true,
      hasInventory: true,
      hasDelivery: true,
      hasWebStore: true,
    },
  })

  console.log(`Backfill TenantModule — ${tenants.length} tenants · ${CANONICAL_KEYS.length} módulos por tenant\n`)

  let ok = 0
  for (const t of tenants) {
    const activeKeys = deriveActiveKeys(t)
    await syncTenantModuleRows(prisma, t.id, activeKeys)
    ok++
    console.log(`✓ ${t.slug.padEnd(28)} activos: [${[...activeKeys].sort().join(', ') || '—'}]`)
  }

  console.log(`\nListo: ${ok}/${tenants.length} tenants sincronizados.`)
}

main()
  .then(async () => { await prisma.$disconnect() })
  .catch(async (err) => {
    console.error('Backfill falló:', err)
    await prisma.$disconnect()
    process.exit(1)
  })
