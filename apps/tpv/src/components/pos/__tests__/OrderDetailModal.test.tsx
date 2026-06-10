import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import OrderDetailModal from "@/components/pos/OrderDetailModal";

describe("OrderDetailModal", () => {
  it("keeps every ticket action inside the scrollable modal body", () => {
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
    expect(screen.getByRole("button", { name: /Cuenta/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Comanda/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cambiar tipo/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mover mesa/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Eliminar ticket/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cobrar ahora/i })).toBeInTheDocument();
    expect(scrollArea).toContainElement(screen.getByRole("button", { name: /Cobrar ahora/i }));
  });
});
