import { act, renderHook } from "@testing-library/react";
import { useMarketplacePendingAlerts } from "@/hooks/useNotifications";
import { enableNotificationSound, playNotificationSound } from "@/lib/notificationSound";

jest.mock("socket.io-client", () => ({ io: jest.fn() }));
jest.mock("@/lib/notificationSound", () => ({
  primeNotificationSound: jest.fn(), playNotificationSound: jest.fn(),
  notificationSoundEnabled: () => false,
  enableNotificationSound: jest.fn().mockResolvedValue(true),
}));

test("repite cada 30 segundos con panel cerrado, permite activar audio y se detiene al aceptar", async () => {
  jest.useFakeTimers();
  const orders = [{ source: "MARKETPLACE", status: "PENDING_MERCHANT", createdAt: new Date().toISOString() }];
  const { result, rerender, unmount } = renderHook(({ rows }) => useMarketplacePendingAlerts(rows), { initialProps: { rows: orders } });
  expect(result.current.needsSound).toBe(true);
  expect(playNotificationSound).toHaveBeenCalledTimes(1);
  act(() => jest.advanceTimersByTime(60_000));
  expect(playNotificationSound).toHaveBeenCalledTimes(3);
  await act(async () => { await result.current.activateSound(); });
  expect(enableNotificationSound).toHaveBeenCalledTimes(1);
  expect(result.current.needsSound).toBe(false);
  rerender({ rows: [{ ...orders[0]!, status: "CONFIRMED" }] });
  const calls = (playNotificationSound as jest.Mock).mock.calls.length;
  act(() => jest.advanceTimersByTime(60_000));
  expect(playNotificationSound).toHaveBeenCalledTimes(calls);
  unmount();
  jest.useRealTimers();
});
