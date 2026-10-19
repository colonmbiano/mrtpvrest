import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MoveTableModal from "../MoveTableModal";
import api from "@/lib/api";
import { reassignOrderTable } from "@/lib/order-repository";

jest.mock("@/lib/api", () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock("@/lib/order-repository", () => ({ reassignOrderTable: jest.fn() }));
jest.mock("sonner", () => ({ toast: { success: jest.fn() } }));
const source = { id: "o1", orderNumber: "101", table: { id: "t1", name: "Mesa 1" } };
const destinations = [
  { id: "t1", name: "Mesa 1", status: "OCCUPIED" },
  { id: "t2", name: "Mesa 2", status: "AVAILABLE", zone: { name: "Terraza" } },
  { id: "t3", name: "Mesa 3", status: "OCCUPIED" },
  { id: "t4", name: "Mesa 4", status: "DIRTY" },
  { id: "t5", name: "Mesa 5", status: "AVAILABLE", activeOrder: { id: "another" } },
];
const get = api.get as jest.Mock;
const move = reassignOrderTable as jest.Mock;
beforeEach(() => {
  jest.clearAllMocks();
  get.mockResolvedValue({ data: destinations });
  move.mockResolvedValue({ id: "o1", tableId: "t2" });
});

test("mueve la cuenta a una mesa libre con confirmación y bloquea ocupadas/sucias", async () => {
  const user = userEvent.setup();
  const success = jest.fn();
  render(<MoveTableModal source={source} onClose={jest.fn()} onSuccess={success} />);
  const group = within(await screen.findByRole("group", { name: "Mesa destino" }));
  expect(group.queryByRole("button", { name: /Mesa 1/ })).not.toBeInTheDocument();
  for (const name of [/Mesa 3/, /Mesa 4/, /Mesa 5/]) expect(group.getByRole("button", { name })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Selecciona una mesa" })).toBeDisabled();
  await user.click(group.getByRole("button", { name: /Mesa 2/ }));
  expect(move).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Mover a Mesa 2" }));
  expect(move).toHaveBeenCalledWith("o1", "t1", "t2");
  expect(success).toHaveBeenCalledWith("t2");
});

test("un conflicto conserva la cuenta y permite actualizar mesas", async () => {
  const user = userEvent.setup();
  const success = jest.fn();
  move.mockRejectedValue({ response: { status: 409, data: { error: "La mesa destino ya tiene una cuenta abierta" } } });
  render(<MoveTableModal source={source} onClose={jest.fn()} onSuccess={success} />);
  await user.click(await screen.findByRole("button", { name: /Mesa 2 Terraza/ }));
  await user.click(screen.getByRole("button", { name: "Mover a Mesa 2" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("ya tiene una cuenta abierta");
  expect(success).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: /Mesa 2 Terraza/ })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Actualizar mesas" }));
  expect(await screen.findByRole("button", { name: /Mesa 2 Terraza/ })).toBeEnabled();
});

test("un fallo al consultar mesas ofrece reintento sin usar información en caché", async () => {
  const user = userEvent.setup();
  get.mockRejectedValueOnce(new Error("Network Error"));
  render(<MoveTableModal source={source} onClose={jest.fn()} onSuccess={jest.fn()} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Revisa tu conexión");
  expect(screen.getByRole("button", { name: "Selecciona una mesa" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Actualizar mesas" }));
  expect(await screen.findByRole("button", { name: /Mesa 2 Terraza/ })).toBeEnabled();
});

test("cancelar no envía ningún cambio", async () => {
  const user = userEvent.setup();
  const close = jest.fn();
  render(<MoveTableModal source={source} onClose={close} onSuccess={jest.fn()} />);
  await screen.findByRole("group", { name: "Mesa destino" });
  await user.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(close).toHaveBeenCalledTimes(1);
  expect(move).not.toHaveBeenCalled();
});
