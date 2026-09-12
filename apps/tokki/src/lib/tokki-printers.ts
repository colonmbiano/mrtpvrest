import { get } from "idb-keyval";
import { printKitchenTickets, type PrinterRecord, type KitchenTicketInput } from "./printer-tcp";

export function normalizePrinters(records: PrinterRecord[]): PrinterRecord[] {
  return records.map((p) => p.connectionType ? p : {
    ...p, type: "CASHIER", connectionType: p.type === "TCP" ? "NETWORK" : p.type, isActive: true,
  });
}

export function kitchenTargets(records: PrinterRecord[]): PrinterRecord[] {
  const active = records.filter(p => p.isActive && !p.isVirtual && p.connectionType === "NETWORK" && p.ip);
  const hasKitchen = active.some(p => (p.stations?.length ? p.stations : [p.type]).some(s => s === "BAR" || s === "KITCHEN"));
  // Mostrador con una sola térmica: imprime también las comandas allí.
  if (!hasKitchen && active.length === 1) return [{ ...active[0]!, stations: ["CASHIER", "BAR"] }];
  return records;
}

export async function printTokkiOrder(records: PrinterRecord[], input: KitchenTicketInput) {
  const local = normalizePrinters(await get<PrinterRecord[]>("tokki-printers") || []);
  const current = [...local, ...records.filter(p => !local.some(l => l.id === p.id || (l.ip && l.ip === p.ip && l.port === p.port)))];
  const result = await printKitchenTickets(kitchenTargets(current), input);
  if (!result.ok || result.failed.length) throw new Error(result.failed.map(f => `${f.name}: ${f.error}`).join(" · ") || "No hay una impresora disponible.");
  return result;
}
