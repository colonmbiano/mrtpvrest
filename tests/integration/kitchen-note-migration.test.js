const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { prisma } = require('../../packages/database');

test('isKitchenNote preserves existing rows and values when applied twice', async () => {
  const statements = fs.readFileSync(path.join(__dirname,
    '../../packages/database/prisma/migrations/20261017220000_add_kitchen_note_flags/migration.sql'), 'utf8')
    .split(';').map(sql => sql.trim()).filter(Boolean);
  try {
    await prisma.$transaction(async tx => {
      // Temporary tables shadow the real tables only on this connection.
      // No restaurant data is read or changed; both tables disappear on commit.
      await tx.$executeRawUnsafe('CREATE TEMP TABLE "modifiers" (id integer PRIMARY KEY) ON COMMIT DROP');
      await tx.$executeRawUnsafe('CREATE TEMP TABLE "MenuItemComplement" (id integer PRIMARY KEY, "isKitchenNote" boolean NOT NULL DEFAULT false) ON COMMIT DROP');
      await tx.$executeRawUnsafe('INSERT INTO "modifiers" (id) VALUES (1)');
      await tx.$executeRawUnsafe('INSERT INTO "MenuItemComplement" (id, "isKitchenNote") VALUES (1, true), (2, false)');

      for (const sql of statements) await tx.$executeRawUnsafe(sql);
      assert.deepEqual(await tx.$queryRawUnsafe('SELECT * FROM "modifiers" ORDER BY id'),
        [{ id: 1, isKitchenNote: false }]);
      await tx.$executeRawUnsafe('UPDATE "modifiers" SET "isKitchenNote" = true WHERE id = 1');
      for (const sql of statements) await tx.$executeRawUnsafe(sql);

      for (const table of ['modifiers', 'MenuItemComplement']) {
        await tx.$executeRawUnsafe(`INSERT INTO "${table}" (id) VALUES (3)`);
        const rows = await tx.$queryRawUnsafe(`SELECT * FROM "${table}" ORDER BY id`);
        assert.equal(rows.find(row => row.id === 1).isKitchenNote, true);
        assert.equal(rows.find(row => row.id === 3).isKitchenNote, false);
        const columns = await tx.$queryRawUnsafe(`SELECT attnotnull FROM pg_attribute WHERE attrelid = 'pg_temp."${table}"'::regclass AND attname = 'isKitchenNote'`);
        assert.equal(columns[0].attnotnull, true);
      }
      assert.equal((await tx.$queryRawUnsafe('SELECT "isKitchenNote" FROM "MenuItemComplement" WHERE id = 2'))[0].isKitchenNote, false);
    });
  } finally {
    await prisma.$disconnect();
  }
});
