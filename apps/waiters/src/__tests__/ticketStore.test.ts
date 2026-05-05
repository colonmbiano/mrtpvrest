/**
 * ticketStore.test.ts
 * Pruebas unitarias para el ticketStore (carrito multi-ticket).
 */
import { renderHook, act } from "@testing-library/react";
import { useTicketStore } from "@/store/ticketStore";
import type { CartItem } from "@/store/ticketStore";

const makeItem = (overrides: Partial<CartItem> = {}): CartItem => ({
  id: "item-1",
  menuItemId: "menu-1",
  name: "Hamburguesa",
  price: 80,
  category: "Burgers",
  quantity: 1,
  subtotal: 80,
  notes: "",
  variantId: null,
  variantName: null,
  ...overrides,
});

describe("useTicketStore", () => {
  beforeEach(() => {
    useTicketStore.setState({
      tickets: [
        {
          id: 1,
          name: "",
          phone: "",
          type: "TAKEOUT",
          table: "",
          tableId: "",
          tableName: "",
          address: "",
          items: [],
          discount: 0,
          discountType: "percent",
        },
      ],
      activeIndex: 0,
    });
  });

  describe("addItemToActive", () => {
    it("agrega un item nuevo al ticket activo", () => {
      const { result } = renderHook(() => useTicketStore());

      act(() => { result.current.addItemToActive(makeItem()); });

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(result.current.tickets[0]!.items).toHaveLength(1);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(result.current.tickets[0]!.items[0]!.quantity).toBe(1);
    });

    it("incrementa cantidad si el mismo item ya existe", () => {
      const { result } = renderHook(() => useTicketStore());
      const item = makeItem();

      act(() => {
        result.current.addItemToActive(item);
        result.current.addItemToActive(item);
      });

      const ticket = result.current.tickets[0]!;
      const firstItem = ticket.items[0]!;
      expect(ticket.items).toHaveLength(1);
      expect(firstItem.quantity).toBe(2);
      expect(firstItem.subtotal).toBe(160);
    });

    it("trata items con distintos variantId como productos distintos", () => {
      const { result } = renderHook(() => useTicketStore());

      act(() => {
        result.current.addItemToActive(makeItem());
        result.current.addItemToActive(makeItem({ variantId: "var-doble" }));
      });

      expect(result.current.tickets[0]!.items).toHaveLength(2);
    });
  });

  describe("changeItemQty", () => {
    it("incrementa cantidad correctamente", () => {
      useTicketStore.setState((s) => ({
        tickets: s.tickets.map((t, i) =>
          i === 0 ? { ...t, items: [makeItem({ quantity: 2, subtotal: 160 })] } : t
        ),
      }));
      const { result } = renderHook(() => useTicketStore());

      act(() => { result.current.changeItemQty(0, 1); });

      const item = result.current.tickets[0]!.items[0]!;
      expect(item.quantity).toBe(3);
      expect(item.subtotal).toBe(240);
    });

    it("elimina item cuando cantidad llega a 0", () => {
      useTicketStore.setState((s) => ({
        tickets: s.tickets.map((t, i) =>
          i === 0 ? { ...t, items: [makeItem({ quantity: 1, subtotal: 80 })] } : t
        ),
      }));
      const { result } = renderHook(() => useTicketStore());

      act(() => { result.current.changeItemQty(0, -1); });

      expect(result.current.tickets[0]!.items).toHaveLength(0);
    });
  });

  describe("addTicket / closeTicket", () => {
    it("agrega un ticket nuevo y lo activa", () => {
      const { result } = renderHook(() => useTicketStore());

      act(() => { result.current.addTicket(); });

      expect(result.current.tickets).toHaveLength(2);
      expect(result.current.activeIndex).toBe(1);
    });

    it("cierra ticket y ajusta activeIndex", () => {
      const { result } = renderHook(() => useTicketStore());

      act(() => { result.current.addTicket(); });
      act(() => { result.current.closeTicket(0); });

      expect(result.current.tickets).toHaveLength(1);
      expect(result.current.activeIndex).toBe(0);
    });

    it("al cerrar el único ticket, resetea a ticket vacío", () => {
      const { result } = renderHook(() => useTicketStore());

      act(() => { result.current.closeTicket(0); });

      expect(result.current.tickets).toHaveLength(1);
      expect(result.current.tickets[0]!.items).toHaveLength(0);
    });
  });

  describe("clearActiveItems", () => {
    it("vacía los items del ticket activo", () => {
      useTicketStore.setState((s) => ({
        tickets: s.tickets.map((t, i) =>
          i === 0
            ? {
                ...t,
                items: [
                  makeItem(),
                  makeItem({ id: "item-2", menuItemId: "menu-2" }),
                ],
              }
            : t
        ),
      }));
      const { result } = renderHook(() => useTicketStore());

      act(() => { result.current.clearActiveItems(); });

      expect(result.current.tickets[0]!.items).toHaveLength(0);
    });
  });

  describe("updateTicket", () => {
    it("actualiza campos del ticket activo sin afectar otros", () => {
      const { result } = renderHook(() => useTicketStore());

      act(() => { result.current.addTicket(); });
      act(() => { result.current.setActiveIndex(0); });
      act(() => {
        result.current.updateTicket({ name: "Mesa 5", type: "DINE_IN" });
      });

      expect(result.current.tickets[0]!.name).toBe("Mesa 5");
      expect(result.current.tickets[0]!.type).toBe("DINE_IN");
      // Ticket 1 no se ve afectado
      expect(result.current.tickets[1]!.name).toBe("");
    });
  });
});
