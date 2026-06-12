// scripts/migrate-waiters-to-employees.js
//
// Meseros v2 Fase 2.1 — Migra cada fila legacy de `Waiter` a un `Employee`
// con rol WAITER, y sus `WaiterShift` abiertos a `EmployeeShift`. El modelo
// Waiter queda deprecado (login del TPV ya es /api/employees/login); este
// script consolida los datos antes de borrar las tablas en la sub-fase 2.4.
//
// Reglas:
//   - locationId: usa el del Waiter; si es null y la base tiene UNA sola
//     Location, asume esa (caso actual: Master Burger's). Con varias
//     locations y waiter sin location, se reporta y se salta (mapeo manual).
//   - PIN: si colisiona con un Employee activo de la misma sucursal se
//     genera un PIN nuevo aleatorio de 4 dígitos y se reporta al final
//     (hay que comunicárselo al mesero). El PIN se guarda como bcrypt +
//     offlinePin SHA256, igual que /api/employees (login y cache offline).
//   - Idempotente: si ya existe un Employee WAITER con el mismo nombre en
//     la misma sucursal, se salta (se asume migrado en una corrida previa).
//   - NO borra Waiter/WaiterShift. Con --deactivate desactiva los Waiter
//     migrados para que el login legacy deje de aceptarlos.
//
// Uso:
//   node apps/backend/scripts/migrate-waiters-to-employees.js --dry-run
//   node apps/backend/scripts/migrate-waiters-to-employees.js
//   node apps/backend/scripts/migrate-waiters-to-employees.js --deactivate

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { prisma, runWithBypass } = require('@mrtpvrest/database');

const DRY_RUN = process.argv.includes('--dry-run');
const DEACTIVATE = process.argv.includes('--deactivate');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function randomPin(taken) {
  for (let i = 0; i < 200; i++) {
    const pin = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    if (!taken.has(pin)) return pin;
  }
  throw new Error('No se encontró PIN libre de 4 dígitos (¿sucursal saturada?)');
}

// ¿El PIN en claro `pin` colisiona con algún empleado activo de la sucursal?
// Los Employee guardan bcrypt en `pin` y SHA256 en `offlinePin`; los legacy
// pueden tener texto plano. offlinePin es la comparación barata y cubre a
// todos los migrados por /api/employees/login (que backfillea ambos campos).
async function pinCollides(pin, employees) {
  const hash = sha256(pin);
  for (const e of employees) {
    if (e.offlinePin && e.offlinePin === hash) return true;
    if (e.pin && !e.pin.startsWith('$2') && e.pin === pin) return true;
    if (e.pin && e.pin.startsWith('$2') && await bcrypt.compare(pin, e.pin)) return true;
  }
  return false;
}

async function main() {
  // Lecturas cross-tenant por diseño (estamos consolidando datos legacy
  // sin restaurantId) → bypass explícito del tenant-guard.
  const waiters = await runWithBypass(() => prisma.waiter.findMany({
    include: { shifts: { where: { endAt: null } } },
    orderBy: { createdAt: 'asc' },
  }));

  if (waiters.length === 0) {
    console.log('No hay filas en Waiter — nada que migrar.');
    return;
  }

  const locations = await runWithBypass(() => prisma.location.findMany({
    select: { id: true, name: true },
  }));
  const fallbackLocation = locations.length === 1 ? locations[0] : null;

  console.log(`Migrando ${waiters.length} waiter(s) · ${locations.length} location(s) en DB${DRY_RUN ? ' · DRY-RUN' : ''}\n`);

  const pinChanges = [];
  const skipped = [];
  let migrated = 0;

  for (const w of waiters) {
    const locationId = w.locationId || fallbackLocation?.id || null;
    if (!locationId) {
      skipped.push({ waiter: w, reason: 'sin locationId y hay varias locations — mapear a mano' });
      console.log(`✗ ${w.name}: sin location asignable, saltado`);
      continue;
    }

    const employees = await runWithBypass(() => prisma.employee.findMany({
      where: { locationId, isActive: true },
      select: { id: true, name: true, role: true, pin: true, offlinePin: true },
    }));

    // Idempotencia: mismo nombre + rol WAITER en la misma sucursal = ya migrado.
    const already = employees.find((e) => e.role === 'WAITER' && e.name.trim().toLowerCase() === w.name.trim().toLowerCase());
    if (already) {
      skipped.push({ waiter: w, reason: `ya existe Employee WAITER "${already.name}" (${already.id})` });
      console.log(`↺ ${w.name}: ya migrado (${already.id}), saltado`);
      continue;
    }

    // Resolver PIN final (el legacy es texto plano de 4 dígitos).
    let finalPin = w.pin;
    if (await pinCollides(w.pin, employees)) {
      const taken = new Set(employees.map((e) => (e.pin && !e.pin.startsWith('$2') ? e.pin : null)).filter(Boolean));
      taken.add(w.pin);
      finalPin = randomPin(taken);
      pinChanges.push({ name: w.name, oldPin: w.pin, newPin: finalPin });
    }

    console.log(`→ ${w.name} → Employee WAITER @ location ${locationId}${finalPin !== w.pin ? ` · PIN nuevo ${finalPin}` : ''}${w.shifts.length ? ' · turno abierto migrado' : ''}`);

    if (DRY_RUN) { migrated++; continue; }

    await runWithBypass(() => prisma.$transaction(async (tx) => {
      const emp = await tx.employee.create({
        data: {
          name: w.name,
          locationId,
          role: 'WAITER',
          pin: await bcrypt.hash(finalPin, 10),
          offlinePin: sha256(finalPin),
          photo: w.photo,
          isActive: w.isActive,
          tables: w.tables || [],
        },
      });

      // WaiterShift abiertos → EmployeeShift equivalente (conserva startAt).
      for (const s of w.shifts) {
        await tx.employeeShift.create({
          data: { employeeId: emp.id, startAt: s.startAt },
        });
      }

      if (DEACTIVATE) {
        await tx.waiter.update({ where: { id: w.id }, data: { isActive: false } });
      }
    }));

    migrated++;
  }

  console.log(`\nListo: ${migrated}/${waiters.length} migrados · ${skipped.length} saltados${DRY_RUN ? ' (dry-run, nada escrito)' : ''}`);
  if (pinChanges.length) {
    console.log('\n⚠ PINs reasignados por colisión — COMUNICAR a cada mesero:');
    for (const c of pinChanges) console.log(`   ${c.name}: ${c.oldPin} → ${c.newPin}`);
  }
  if (skipped.length) {
    console.log('\nSaltados:');
    for (const s of skipped) console.log(`   ${s.waiter.name}: ${s.reason}`);
  }
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (err) => {
    console.error('Migración falló:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
