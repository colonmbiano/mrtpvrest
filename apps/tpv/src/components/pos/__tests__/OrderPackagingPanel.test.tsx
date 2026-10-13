import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import OrderPackagingPanel from "../OrderPackagingPanel";
import api from "@/lib/api";

jest.mock("@/lib/api", () => ({ __esModule: true, default: { get: jest.fn(), put: jest.fn(), post: jest.fn() } }));
const get = api.get as jest.Mock;
const put = api.put as jest.Mock;
const plan = {
  pending: false, revision: "rev1", orderType: "TAKEOUT", editable: true, message: null, packagingCost: 2,
  entries: [
    { ingredientId: "box", name: "Caja", unit: "PIECE", quantity: 2, unitCost: 1 },
    { ingredientId: "tray", name: "Charola", unit: "PIECE", quantity: 0, unitCost: 1.65 },
  ],
};
beforeEach(() => { jest.clearAllMocks(); localStorage.clear(); });

test("mesas muestran exclusión de desechables y no permiten guardar empaques", async () => {
  get.mockResolvedValue({ data: { ...plan, orderType: "DINE_IN", editable: false, entries: [], packagingCost: 0, message: "En mesa no se incluyen desechables." } });
  render(<OrderPackagingPanel orderId="o1" orderNumber="123" onClose={jest.fn()} />);
  expect(await screen.findByText("En mesa no se incluyen desechables.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Guardar empaques" })).not.toBeInTheDocument();
  expect(put).not.toHaveBeenCalled();
});

test("guarda cantidades absolutas y conserva el borrador ante un fallo de conexión", async () => {
  get.mockResolvedValue({ data: plan });
  put.mockRejectedValueOnce(new Error("offline"));
  const mounted = render(<OrderPackagingPanel orderId="o1" orderNumber="123" onClose={jest.fn()} />);
  const input = await screen.findByLabelText("Cantidad de Caja");
  fireEvent.change(input, { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: "Agregar bolsa u otro empaque" }));
  fireEvent.change(screen.getByLabelText("Cantidad de Charola"), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar empaques" }));
  await screen.findByRole("alert");
  expect(put).toHaveBeenCalledWith("/api/orders/o1/packaging", { revision: "rev1", packaging: [
    { ingredientId: "box", quantity: 0 }, { ingredientId: "tray", quantity: 1 },
  ] });
  mounted.unmount();
  render(<OrderPackagingPanel orderId="o1" orderNumber="123" onClose={jest.fn()} />);
  await screen.findByText(/Se recuperó tu borrador/);
  put.mockResolvedValueOnce({ data: { ...plan, revision: "rev2", packagingCost: 1.65, entries: plan.entries.map(e => ({ ...e, quantity: e.ingredientId === "box" ? 0 : 1 })) } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar empaques" }));
  await screen.findByText(/Empaques guardados/);
  await waitFor(() => expect(localStorage.getItem("order-packaging-draft:v1:o1")).toBeNull());
});
