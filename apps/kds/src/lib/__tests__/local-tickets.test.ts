import { localTicketsKey, readLocalTickets, writeLocalTickets, type LocalKitchenTicket } from "../local-tickets";

function storage() {
  const values = new Map<string, string>([["restaurantId", "r1"], ["locationId", "loc1"], ["deviceId", "d1"]]);
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
const ticket = (id: string): LocalKitchenTicket => ({ id, receivedAt: 1234, from: "192.168.1.2",
  lines: ["COMANDA"], headerLines: [], items: [{ name: "Burger", quantity: 1, modifiers: [], notes: ["Sin cebolla"] }],
  isKitchen: true, isReceipt: false, orderNumber: "1042", tableLabel: "8" });

test("recupera más de 50 comandas y conserva las archivadas", () => {
  const s = storage();
  const tickets = Array.from({ length: 70 }, (_, i) => ticket(String(i)));
  tickets[0]!.archivedAt = 4321;
  writeLocalTickets(s, tickets);
  expect(readLocalTickets(s)).toEqual(tickets);
});
test("aísla el respaldo por restaurante, sucursal y dispositivo", () => {
  const s = storage();
  const original = localTicketsKey(s);
  writeLocalTickets(s, [ticket("a")]);
  for (const name of ["restaurantId", "locationId", "deviceId"]) {
    const before = s.getItem(name)!;
    s.setItem(name, "other");
    expect(localTicketsKey(s)).not.toBe(original);
    expect(readLocalTickets(s)).toEqual([]);
    s.setItem(name, before);
  }
});
test("informa corrupción o falta de espacio en vez de aparentar que guardó", () => {
  const s = storage();
  s.setItem(localTicketsKey(s), JSON.stringify([{}]));
  expect(() => readLocalTickets(s)).toThrow();
  expect(() => writeLocalTickets({ ...s, setItem: () => { throw new Error("QuotaExceeded"); } }, [ticket("a")])).toThrow("QuotaExceeded");
});
