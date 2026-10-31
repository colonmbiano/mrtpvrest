import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrderTypeSelector, { type OpenAccount } from "../OrderTypeSelector";

jest.mock("@/components/UserBadge", () => ({ __esModule: true, default: () => null }));
jest.mock("@/lib/haptics", () => ({ hapticMedium: jest.fn() }));

const accounts: OpenAccount[] = [
  { id: "1", orderNumber: "101", customerName: "Ana", rawType: "DELIVERY", paymentMethod: "CASH_ON_DELIVERY" },
  { id: "2", orderNumber: "102", customerName: "Luis", rawType: "DELIVERY", paymentMethod: "CARD" },
  { id: "3", orderNumber: "103", customerName: "Rosa", rawType: "TAKEOUT", paymentMethod: "CASH" },
].map((account) => ({
  ...account,
  rawType: account.rawType as OpenAccount["rawType"],
  tableName: null, phone: null, numberOfGuests: null,
  itemsCount: 1, total: 100, status: "PAID",
}));

describe("OrderTypeSelector: filtros de cobradas", () => {
  it("combina pago y tipo, informa resultados vacíos y permite volver a todas", async () => {
    const user = userEvent.setup();
    render(<OrderTypeSelector onSelect={jest.fn()} mode="paid" openAccounts={accounts} />);
    const payment = within(screen.getByRole("group", { name: "Tipo de pago" }));
    const type = within(screen.getByRole("group", { name: "Tipo de pedido" }));

    await user.click(payment.getByRole("button", { name: "Efectivo" }));
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Rosa")).toBeInTheDocument();
    expect(screen.queryByText("Luis")).not.toBeInTheDocument();

    await user.click(type.getByRole("button", { name: "Domicilio" }));
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.queryByText("Rosa")).not.toBeInTheDocument();
    expect(screen.getByText("Cobradas · último mes · 1 de 3")).toBeInTheDocument();
    expect(payment.getByRole("button", { name: "Efectivo" })).toHaveAttribute("aria-pressed", "true");

    await user.click(payment.getByRole("button", { name: "Transfer." }));
    expect(screen.getByText("Sin cobrados con estos filtros")).toBeInTheDocument();

    await user.click(payment.getByRole("button", { name: "Todos" }));
    expect(screen.getByText("Luis")).toBeInTheDocument();
    expect(screen.queryByText("Rosa")).not.toBeInTheDocument();
    await user.click(type.getByRole("button", { name: "Todas" }));
    expect(screen.getByText("Cobradas · último mes · 3 de 3")).toBeInTheDocument();
  });

  it("no aplica el filtro de pago a las cuentas abiertas al cambiar de pestaña", async () => {
    const user = userEvent.setup();
    const props = { onSelect: jest.fn(), openAccounts: accounts };
    const { rerender } = render(<OrderTypeSelector {...props} mode="paid" />);
    await user.click(within(screen.getByRole("group", { name: "Tipo de pago" })).getByRole("button", { name: "Tarjeta" }));
    expect(screen.queryByText("Ana")).not.toBeInTheDocument();

    rerender(<OrderTypeSelector {...props} mode="open" />);
    expect(screen.queryByRole("group", { name: "Tipo de pago" })).not.toBeInTheDocument();
    for (const name of ["Ana", "Luis", "Rosa"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });
});
