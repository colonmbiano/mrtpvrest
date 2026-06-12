import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import OrderDetailModal from "@/components/pos/OrderDetailModal";

describe("OrderDetailModal", () => {
  // El rediseño del modal movió las acciones a un footer FIJO (fuera del área
  // scrolleable) para que "Cobrar ahora" siempre quede visible sin scrollear;
  // el body con los items sigue siendo el área con overflow.
  it("renderiza todas las acciones del ticket con el body scrolleable y Cobrar en el footer fijo", () => {
    render(
      <OrderDetailModal
        isOpen
        onClose={jest.fn()}
        orderNumber="1001"
        customerName="Publico general"
        orderType="MESA"
        status="OPEN"
        total={120}
        items={[{ id: "item-1", name: "Hamburguesa", quantity: 1, subtotal: 120 }]}
        onReprint={jest.fn()}
        onReprintKitchen={jest.fn()}
        onCharge={jest.fn()}
        onCancelOrder={jest.fn()}
        onMergeOrTransfer={jest.fn()}
        onChangeType={jest.fn()}
      />,
    );

    const scrollArea = screen.getByTestId("order-detail-scroll");
    expect(scrollArea).toHaveClass("overflow-y-auto");
    // Los items viven en el área scrolleable.
    expect(scrollArea).toContainElement(screen.getByText("Hamburguesa"));
    expect(screen.getByRole("button", { name: /Cuenta/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Comanda/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cambiar tipo/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mover mesa/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Eliminar ticket/i })).toBeInTheDocument();
    // El CTA primario vive en el footer fijo, NO dentro del scroll: debe
    // quedar siempre visible aunque el ticket tenga muchos items.
    const chargeBtn = screen.getByRole("button", { name: /Cobrar ahora/i });
    expect(chargeBtn).toBeInTheDocument();
    expect(scrollArea).not.toContainElement(chargeBtn);
  });
});
