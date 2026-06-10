import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrdersDrawer, { type DrawerOrder } from "@/components/pos/OrdersDrawer";

const orders: DrawerOrder[] = [
  {
    id: "order-1",
    orderNumber: "1001",
    customerName: "Ana",
    type: "MESA",
    status: "OPEN",
    total: 120,
    time: "ahora",
    itemsCount: 2,
  },
  {
    id: "order-2",
    orderNumber: "1002",
    customerName: "Luis",
    type: "LLEVAR",
    status: "PREPARING",
    total: 80,
    time: "2 min",
    itemsCount: 1,
  },
];

describe("OrdersDrawer multiselección", () => {
  it("selecciona varios tickets y conserva el primero como cuenta final", async () => {
    const user = userEvent.setup();
    const onMergeOrders = jest.fn().mockResolvedValue(undefined);

    render(
      <OrdersDrawer
        isOpen
        onClose={jest.fn()}
        orders={orders}
        onShowDetail={jest.fn()}
        onConfirmPayment={jest.fn()}
        onReprintOrder={jest.fn()}
        canMergeOrders
        onMergeOrders={onMergeOrders}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Seleccionar varios tickets" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Seleccionar ticket de Ana" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Seleccionar ticket de Luis" }),
    );

    expect(screen.getByText("Cuenta final")).toBeInTheDocument();
    expect(screen.getByText("$200.00")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Juntar 2" }));
    expect(screen.getByText("Juntar 2 tickets")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(onMergeOrders).toHaveBeenCalledWith(orders[0], [orders[1]]);
  });
});
