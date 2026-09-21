import { render, waitFor } from "@testing-library/react";
import SyncInitializer from "@/components/SyncInitializer";
import { useAuthStore } from "@/store/authStore";

const mockReplace = jest.fn();
const mockInitBackgroundSync = jest.fn();
const mockStopBackgroundSync = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => "/pos/order-type",
}));

jest.mock("@/lib/offline", () => ({
  initBackgroundSync: () => mockInitBackgroundSync(),
  stopBackgroundSync: () => mockStopBackgroundSync(),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  TPV_AUTH_REQUIRED_EVENT: "tpv:auth-required",
}));

describe("SyncInitializer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.cookie = "tpv-session-active=; path=/; max-age=0";
    document.cookie = "tpv-role=; path=/; max-age=0";
    useAuthStore.setState({
      employee: null,
      token: null,
      isAuthenticated: false,
    });
  });

  it("invalida una cookie de sesión si el estado seguro no tiene empleado", async () => {
    document.cookie = "tpv-session-active=true; path=/";

    render(<SyncInitializer />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/locked"));
    expect(document.cookie).not.toContain("tpv-session-active=true");
    expect(mockInitBackgroundSync).not.toHaveBeenCalled();
  });

  it("inicia la sincronización cuando la sesión sí está autenticada", () => {
    useAuthStore.setState({
      employee: {
        id: "employee-1",
        name: "Caja",
        role: "CASHIER",
        isActive: true,
        permissions: [],
      },
      isAuthenticated: true,
    });

    const view = render(<SyncInitializer />);

    expect(mockInitBackgroundSync).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
    view.unmount();
    expect(mockStopBackgroundSync).toHaveBeenCalled();
  });
});
