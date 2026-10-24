import { execSync } from 'node:child_process';

const cwd = 'C:\\Users\\colon\\AndroidStudioProjects\\mrtpvrest-marketplace';

function run(cmd) {
  console.log(`> ${cmd}`);
  const out = execSync(cmd, { cwd, encoding: 'utf8' });
  console.log(out);
  return out;
}

// Commit 1: Client & Backend Cupones
run('git add apps/client/src/lib/marketplaceV1Checkout.ts apps/client/scripts/marketplace-checkout.test.mjs apps/backend/src/lib/marketplace-quote.js');
run('git commit -m "feat(client,backend): soporte para cupones y desglose de cotizacion en checkout v1 (73 tests)"');

// Commit 2: SaaS Dispatch Ops
run('git add apps/saas/lib/marketplaceDispatchAudit.ts apps/saas/app/(dashboard)/marketplace/DispatchAuditSection.tsx apps/saas/app/(dashboard)/marketplace/page.tsx apps/saas/scripts/saas-marketplace.test.mjs');
run('git commit -m "feat(saas): panel de auditoria y monitoreo de despacho de operaciones en vivo (60 tests)"');

console.log('Commits creados con exito.');
