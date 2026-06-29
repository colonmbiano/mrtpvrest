// Extrae el/los nombre(s) de variante de un OrderItem. La variante puede venir:
//   - embebida en el nombre como "Producto (Grande)" (single-select, lo más común;
//     la pone resolveVariantSelection en money.js)
//   - en una línea de notes "Variantes: X, Y" (multi-select, ver convención del
//     proyecto en project_order_variant_in_notes)
// Devuelve un array de variantes (puede ser vacío). Centralizado para que los
// reportes y cualquier consumidor parseen igual (evita regex divergentes).

function parseVariantsFromItem(name, notes) {
  const out = [];
  const m = /\(([^)]+)\)\s*$/.exec(name || '');
  if (m) out.push(m[1].trim());
  if (typeof notes === 'string') {
    const line = notes.split('\n').find((l) => /^\s*variantes\s*:/i.test(l));
    if (line) {
      const rest = line.replace(/^\s*variantes\s*:/i, '').trim();
      for (const v of rest.split(',')) {
        const t = v.trim();
        if (t) out.push(t);
      }
    }
  }
  return out;
}

module.exports = { parseVariantsFromItem };
