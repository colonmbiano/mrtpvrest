import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import DriverMovementsModal from "../DriverMovementsModal";
import api from "@/lib/api";

jest.mock("@/lib/api", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock("@/lib/offline", () => ({ apiOrQueue: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  (api.get as jest.Mock).mockResolvedValue({ data: { movements: [], summary: { balance: 0 } } });
  (api.post as jest.Mock).mockResolvedValue({ data: {} });
});

function show(canCut = true) {
  return render(<DriverMovementsModal driver={{ id: "polo", name: "Polo" }}
    onClose={jest.fn()} onRefresh={jest.fn()} accent="#ff9900" canCut={canCut} />);
}

test("solo hay una asignación de fondos; compras desde caja no usa Ingreso", async () => {
  show();
  await waitFor(() => expect(api.get).toHaveBeenCalled());
  expect(screen.queryByRole("option", { name: /Ingreso/ })).not.toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Asignar fondos" })).toHaveLength(1);
  fireEvent.change(screen.getByLabelText("Uso del fondo"), { target: { value: "COMPRAS" } });
  fireEvent.change(screen.getByLabelText("Monto ($)"), { target: { value: "1000" } });
  fireEvent.click(screen.getByRole("button", { name: "Asignar fondos" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/driver-cash/polo/float", {
    amount: 1000, source: "CAJA", purpose: "COMPRAS", description: "",
  }));
  expect((api.post as jest.Mock).mock.calls.every(([url]) => !url.endsWith("/movements"))).toBe(true);
});

test("el mismo formulario permite un fondo externo para cambio", async () => {
  show();
  await waitFor(() => expect(api.get).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: /Desde fuera/ }));
  fireEvent.change(screen.getByLabelText("Monto ($)"), { target: { value: "100" } });
  fireEvent.click(screen.getByRole("button", { name: "Asignar fondos" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/driver-cash/polo/float", {
    amount: 100, source: "EXTERNO", purpose: "CAMBIO", description: "",
  }));
});

test("sin permiso no se ofrece ninguna vía alternativa de asignar fondos", async () => {
  show(false);
  await waitFor(() => expect(api.get).toHaveBeenCalled());
  expect(screen.queryByRole("button", { name: "Asignar fondos" })).not.toBeInTheDocument();
  expect(screen.queryByRole("option", { name: /Ingreso/ })).not.toBeInTheDocument();
});
