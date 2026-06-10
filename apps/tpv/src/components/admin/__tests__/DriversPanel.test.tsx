import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import api from "@/lib/api";
import DriversPanel from "@/components/admin/DriversPanel";

jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

const mockedGet = api.get as jest.Mock;

const gpsResponse = {
  data: {
    origin: { lat: 19.2826, lng: -99.6557 },
    drivers: [
      {
        driver: { id: "driver-1", name: "Mario López", photo: null },
        location: {
          lat: 19.283,
          lng: -99.656,
          createdAt: new Date().toISOString(),
        },
        activeRoute: null,
        online: true,
      },
    ],
  },
};

describe("DriversPanel", () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  it("muestra el estado operativo al cajero sin solicitar datos de caja", async () => {
    mockedGet.mockResolvedValue(gpsResponse);

    render(
      <DriversPanel
        isOpen
        onClose={jest.fn()}
        accent="#ffb84d"
        currentRole="CASHIER"
      />,
    );

    expect(await screen.findByText("Mario López")).toBeInTheDocument();
    expect(screen.getByText("Disponible")).toBeInTheDocument();
    expect(screen.queryByText("Ingresos")).not.toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(mockedGet).toHaveBeenCalledWith("/api/gps/live");
  });

  it.each(["ADMIN", "MANAGER", "OWNER"] as const)(
    "conserva la vista financiera completa para %s",
    async (role) => {
      mockedGet.mockImplementation((url: string) => {
        if (url === "/api/gps/live") return Promise.resolve(gpsResponse);
        if (url === "/api/driver-cash/summary/today") {
          return Promise.resolve({
            data: [
              {
                driver: { id: "driver-1", name: "Mario López" },
                income: 500,
                expense: 100,
                returned: 50,
                deliveries: 3,
              },
            ],
          });
        }
        return Promise.reject(new Error(`URL inesperada: ${url}`));
      });

      render(
        <DriversPanel
          isOpen
          onClose={jest.fn()}
          accent="#ffb84d"
          currentRole={role}
        />,
      );

      expect(await screen.findByText("Mario López")).toBeInTheDocument();
      expect(screen.getByText("Ingresos")).toBeInTheDocument();
      expect(screen.getByText("$500")).toBeInTheDocument();
      expect(mockedGet).toHaveBeenCalledWith(
        "/api/driver-cash/summary/today",
      );
    },
  );

  it("muestra el error de GPS y permite reintentar", async () => {
    const user = userEvent.setup();
    mockedGet
      .mockRejectedValueOnce({
        response: { status: 500, data: { error: "GPS no disponible" } },
      })
      .mockResolvedValueOnce(gpsResponse);

    render(
      <DriversPanel
        isOpen
        onClose={jest.fn()}
        accent="#ffb84d"
        currentRole="CASHIER"
      />,
    );

    expect(await screen.findByText("GPS no disponible")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Mario López")).toBeInTheDocument();
  });

  it("muestra un estado vacío cuando no hay repartidores", async () => {
    mockedGet.mockResolvedValue({
      data: { drivers: [], origin: null },
    });

    render(
      <DriversPanel
        isOpen
        onClose={jest.fn()}
        accent="#ffb84d"
        currentRole="CASHIER"
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("No hay repartidores registrados."),
      ).toBeInTheDocument();
    });
  });
});
