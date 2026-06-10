const connect = jest.fn().mockResolvedValue({ client: 7 });
const send = jest.fn().mockResolvedValue(undefined);
const disconnect = jest.fn().mockResolvedValue({ client: 7 });

jest.mock("capacitor-tcp-socket", () => ({
  TcpSocket: { connect, send, disconnect },
}));

import { printKitchenTickets } from "@/lib/printer-tcp";

describe("printKitchenTickets", () => {
  it("reports a visible failure when there is no configured kitchen printer", async () => {
    const result = await printKitchenTickets([], {
      orderNumber: "1001",
      orderType: "DINE_IN",
      tableNumber: "4",
      items: [{ name: "Taco", quantity: 2, price: 35 }],
    });

    expect(result.ok).toBe(0);
    expect(result.failed).toEqual([
      expect.objectContaining({
        name: "Impresoras",
        error: expect.stringContaining("No hay impresoras"),
      }),
    ]);
  });

  it("prints one ticket per assignment when groups share the same printer", async () => {
    const result = await printKitchenTickets(
      [{
        id: "printer-1",
        name: "Cocina",
        type: "KITCHEN",
        ip: "192.168.1.50",
        port: 9100,
        connectionType: "NETWORK",
        isActive: true,
        printerGroupIds: ["plancha", "freidora"],
        printerGroupRefs: [
          { id: "plancha", name: "Plancha" },
          { id: "freidora", name: "Freidora" },
        ],
      }],
      {
        orderNumber: "1002",
        orderType: "DINE_IN",
        tableNumber: "5",
        config: { separateByGroup: true },
        items: [
          { name: "Hamburguesa", quantity: 1, price: 90, printerGroupIds: ["plancha"] },
          { name: "Papas", quantity: 1, price: 45, printerGroupIds: ["freidora"] },
        ],
      },
    );

    expect(result).toEqual({ ok: 2, failed: [] });
    expect(connect).toHaveBeenCalledTimes(2);
    const payloads = send.mock.calls.map(([arg]) => arg.data as string);
    expect(payloads.some((payload) => payload.includes("PLANCHA") && payload.includes("Hamburguesa"))).toBe(true);
    expect(payloads.some((payload) => payload.includes("FREIDORA") && payload.includes("Papas"))).toBe(true);
    expect(payloads.every((payload) => !(payload.includes("Hamburguesa") && payload.includes("Papas")))).toBe(true);
  });
});
