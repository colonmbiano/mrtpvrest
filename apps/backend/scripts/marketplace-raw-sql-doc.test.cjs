'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? files(full) : entry.name.endsWith('.js') ? [full] : [];
  });
}

test('cada llamada SQL cruda tiene una fila de alcance en TENANCY', () => {
  const actual = [];
  for (const file of files(path.join(root, 'apps/backend/src'))) {
    const source = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n');
    for (const match of source.matchAll(/\.\$(queryRaw(?:Unsafe)?|executeRaw(?:Unsafe)?)\b/g)) {
      actual.push(path.relative(root, file).replaceAll(path.sep, '/') + ':$' + match[1]);
    }
  }
  const doc = fs.readFileSync(path.join(root, 'docs/TENANCY.md'), 'utf8');
  const documented = [...doc.matchAll(/^\| `(apps\/backend\/src\/[^\`]+)` \| `(\$(?:queryRaw|executeRaw)(?:Unsafe)?)` \|/gm)]
    .map(match => match[1] + ':' + match[2]);
  assert.deepEqual(documented.sort(), actual.sort());
});
