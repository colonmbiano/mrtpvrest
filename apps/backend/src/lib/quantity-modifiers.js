// Repeated IDs represent units in QUANTITY groups; snapshots remain compact.
function validateQuantityGroups(groups, ids) {
  for (const group of groups || []) {
    if (group.groupType !== 'QUANTITY') continue;
    const allowed = new Map(group.modifiers.map(m => [m.id, m]));
    const chosen = ids.filter(id => allowed.has(id));
    const min = Math.max(group.required ? 1 : 0, group.minSelection || 0);
    if (chosen.length < min || (group.maxSelection > 0 && chosen.length > group.maxSelection)) {
      throw new Error(`Elige ${min === group.maxSelection ? `exactamente ${min}` : `entre ${min} y ${group.maxSelection}`} en "${group.name}".`);
    }
    if (chosen.some(id => allowed.get(id).isAvailable === false)) {
      throw new Error(`Opción no disponible en "${group.name}".`);
    }
  }
}

function compactQuantityModifiers(mods, groups) {
  const quantityIds = new Set((groups || []).filter(g => g.groupType === 'QUANTITY').flatMap(g => g.modifiers.map(m => m.id)));
  const result = [];
  const counts = new Map();
  for (const mod of mods) {
    const id = mod.modifierId || mod.id;
    if (!quantityIds.has(id)) { result.push(mod); continue; }
    const entry = counts.get(id) || { mod, count: 0, price: 0 };
    entry.count++;
    entry.price += Number(mod.priceAdd || 0);
    counts.set(id, entry);
  }
  for (const { mod, count, price } of counts.values()) result.push({ ...mod, name: `${count} ${mod.name}`, priceAdd: price });
  return result;
}

// Include the saved quantity label so different mixes cannot share a replay key.
function modifierSnapshotKey(modifier) {
  return JSON.stringify([modifier.modifierId, modifier.name]);
}

module.exports = { validateQuantityGroups, compactQuantityModifiers, modifierSnapshotKey };
