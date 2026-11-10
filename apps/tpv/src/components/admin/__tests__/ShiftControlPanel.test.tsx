import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ShiftControlPanel from "../ShiftControlPanel";
import api from "@/lib/api";
jest.mock("@/lib/api", () => ({ __esModule: true, default: { get: jest.fn(), patch: jest.fn(), put: jest.fn() } }));
const review = { driverReceipts: [{ driverId: "polo", name: "Polo", expectedCash: 300 }],
  warnings: [], unverifiedPayments: [], unassignedDeliveries: [], missingReceipts: [], responsibles: [] };
beforeEach(() => { jest.clearAllMocks(); (api.get as jest.Mock).mockResolvedValue({ data: review }); });
test("no prellena efectivo; exige motivo del faltante y envía el conteo real", async () => {
  const onChange = jest.fn();
  render(<ShiftControlPanel shiftId="s1" onChange={onChange} />);
  const input = await screen.findByLabelText("Efectivo que recibiste");
  expect(input).toHaveValue(null);
  expect(onChange).toHaveBeenLastCalledWith([], "", false);
  fireEvent.change(input, { target: { value: "200" } });
  await waitFor(() => expect(onChange).toHaveBeenLastCalledWith([{ driverId: "polo", countedCash: 200, differenceReason: "" }], "", false));
  fireEvent.change(screen.getByLabelText("Motivo de la diferencia"), { target: { value: "Faltan cien pesos por entregar" } });
  await waitFor(() => expect(onChange).toHaveBeenLastCalledWith([{ driverId: "polo", countedCash: 200, differenceReason: "Faltan cien pesos por entregar" }], "", true));
});
test("verifica un pago con referencia antes de retirarlo de los pendientes", async () => {
  (api.get as jest.Mock).mockResolvedValue({ data: { ...review, driverReceipts: [],
    warnings: [{ code: "UNVERIFIED_PAYMENTS", count: 1, label: "Pagos digitales sin verificar" }],
    unverifiedPayments: [{ id: "o1", orderNumber: "6195", amount: 150, method: "TRANSFER" }] } });
  (api.patch as jest.Mock).mockResolvedValue({ data: {} });
  render(<ShiftControlPanel shiftId="s1" onChange={jest.fn()} />);
  const reference = await screen.findByLabelText("Referencia bancaria o de terminal");
  fireEvent.change(reference, { target: { value: "SPEI-12345" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar contra banco / terminal" }));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/api/driver-cash/payments/o1/verify", {
    method: "TRANSFER", verified: true, reference: "SPEI-12345",
  }));
});

test("identifica cada gasto sin comprobante con concepto, monto y responsable", async () => {
  (api.get as jest.Mock).mockResolvedValue({ data: { ...review, driverReceipts: [],
    warnings: [{ code: "MISSING_RECEIPTS", count: 2, label: "Gastos sin comprobante" }],
    responsibles: [{ id: "kebra", name: "Kebra", role: "DELIVERY" }, { id: "polo", name: "Polo", role: "DELIVERY" }],
    missingReceipts: [{ id: "g1", driverId: "kebra", description: "Lata de elotes", amount: 25 },
      { id: "g2", driverId: "polo", description: "Aceite para la camioneta", amount: 120 }] } });
  render(<ShiftControlPanel shiftId="s1" onChange={jest.fn()} />);
  expect(await screen.findByText("Lata de elotes · $25.00")).toBeInTheDocument();
  expect(screen.getByText("Aceite para la camioneta · $120.00")).toBeInTheDocument();
  expect(screen.getByText("Kebra")).toBeInTheDocument();
  expect(screen.getByText("Polo")).toBeInTheDocument();
});

test("invalida la revisión previa mientras actualiza y si falla la consulta", async () => {
  (api.get as jest.Mock).mockResolvedValueOnce({ data: { ...review, driverReceipts: [] } });
  const onChange = jest.fn();
  render(<ShiftControlPanel shiftId="s1" onChange={onChange} />);
  await waitFor(() => expect(onChange).toHaveBeenLastCalledWith([], "", true));
  let rejectRefresh!: (reason: Error) => void;
  (api.get as jest.Mock).mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRefresh = reject; }));
  fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
  await waitFor(() => expect(onChange).toHaveBeenLastCalledWith([], "", false));
  rejectRefresh(new Error("Sin conexión"));
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo revisar el cierre");
  expect(onChange).toHaveBeenLastCalledWith([], "", false);
});
