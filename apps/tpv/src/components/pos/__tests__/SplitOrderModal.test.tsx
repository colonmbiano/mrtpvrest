import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SplitOrderModal from "../SplitOrderModal";

describe("SplitOrderModal", () => {
  it("permite mover una de dos unidades del mismo renglón", async () => {
    const onConfirm = jest.fn().mockResolvedValue(undefined);
    render(
      <SplitOrderModal
        isOpen
        orderNumber="42"
        items={[{ id: "burger", name: "Hamburguesa", quantity: 2, subtotal: 240 }]}
        onClose={jest.fn()}
        onConfirm={onConfirm}
      />,
    );

    const create = screen.getByRole("button", { name: "Crear ticket" });
    expect(create).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Agregar una unidad de Hamburguesa" }));
    expect(screen.getByText("$120.00")).toBeInTheDocument();
    expect(create).toBeEnabled();

    fireEvent.click(create);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith([{ id: "burger", quantity: 1 }]));
  });

  it("impide pasar toda la cuenta al ticket nuevo", () => {
    render(
      <SplitOrderModal
        isOpen
        orderNumber="42"
        items={[{ id: "burger", name: "Hamburguesa", quantity: 2, subtotal: 240 }]}
        onClose={jest.fn()}
        onConfirm={jest.fn()}
      />,
    );

    const plus = screen.getByRole("button", { name: "Agregar una unidad de Hamburguesa" });
    fireEvent.click(plus);
    fireEvent.click(plus);
    expect(screen.getByRole("button", { name: "Crear ticket" })).toBeDisabled();
  });
});
