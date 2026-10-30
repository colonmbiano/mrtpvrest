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
  it("combina tipo y pago en cobradas y conserva el tipo al cambiar el pago", async () => {
    const user = userEvent.setup();
    render(<OrdersDrawer isOpen mode="paid" onClose={jest.fn()}
      orders={[
        { ...orders[0]!, status: 'PAID', paymentMethod: 'SPEI' },
        { ...orders[1]!, status: 'PAID', paymentMethod: 'CARD_PRESENT' },
        { ...orders[0]!, id: 'order-3', customerName: 'Rosa', status: 'PAID', paymentMethod: 'CARD' },
      ]}
      onShowDetail={jest.fn()} onConfirmPayment={jest.fn()} onReprintOrder={jest.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Tarjeta' }));
    expect(screen.queryByText('Ana')).not.toBeInTheDocument();
    expect(screen.getByText('Luis')).toBeInTheDocument();
    expect(screen.getByText('Rosa')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mesa' }));
    expect(screen.queryByText('Luis')).not.toBeInTheDocument();
    expect(screen.getByText('Rosa')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Transfer.' }));
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.queryByText('Rosa')).not.toBeInTheDocument();
  });

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

  it("asigna un repartidor a los tickets seleccionados", async () => {
    const user = userEvent.setup();
    const onAssignDriver = jest.fn().mockResolvedValue(undefined);

    render(
      <OrdersDrawer
        isOpen
        onClose={jest.fn()}
        orders={orders}
        onShowDetail={jest.fn()}
        onConfirmPayment={jest.fn()}
        onReprintOrder={jest.fn()}
        canAssignDriver
        drivers={[{ id: "drv-1", name: "Pedro" }]}
        onAssignDriver={onAssignDriver}
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

    await user.click(screen.getByRole("button", { name: "Enviar a repartidor" }));
    await user.click(screen.getByRole("button", { name: /Pedro/ }));

    expect(onAssignDriver).toHaveBeenCalledWith(orders, "drv-1");
  });
});
