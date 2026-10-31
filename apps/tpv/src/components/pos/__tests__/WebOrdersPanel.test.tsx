import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WebOrdersPanel, { type WebOrder } from "@/components/pos/WebOrdersPanel";

const base: WebOrder = {
  id: "web-1",
  orderNumber: "3001",
  customerName: "Comensal",
  orderType: "DINE_IN",
  status: "PENDING",
  total: 140,
  createdAt: new Date().toISOString(),
  itemsCount: 2,
  tableName: "Mesa 7",
};

describe("WebOrdersPanel · mesa por confirmar", () => {
  it("marca el pedido de QR por confirmar y permite rechazarlo o aceptarlo", async () => {
    const user = userEvent.setup();
    const onAccept = jest.fn();
    const onReject = jest.fn();
    render(
      <WebOrdersPanel isOpen onClose={jest.fn()} onShowDetail={jest.fn()}
        orders={[{ ...base, awaitingTableConfirmation: true }]}
        onAccept={onAccept} onReject={onReject} />,
    );

    expect(screen.getByText(/Confirma la mesa/)).toBeInTheDocument();
    expect(screen.getByText("Mesa 7")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Rechazar/ }));
    expect(onReject).toHaveBeenCalledWith("web-1");

    await user.click(screen.getByRole("button", { name: /Aceptar/ }));
    expect(onAccept).toHaveBeenCalledWith("web-1");
  });

  it("un pedido web normal no ofrece rechazar ni pide confirmar mesa", () => {
    render(
      <WebOrdersPanel isOpen onClose={jest.fn()} onShowDetail={jest.fn()}
        orders={[{ ...base, orderType: "TAKEOUT", tableName: null }]}
        onAccept={jest.fn()} onReject={jest.fn()} />,
    );

    expect(screen.queryByText(/Confirma la mesa/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Rechazar/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Aceptar/ })).toBeInTheDocument();
  });
});
