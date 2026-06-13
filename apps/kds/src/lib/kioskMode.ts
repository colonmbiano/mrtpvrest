import { registerPlugin } from "@capacitor/core";

interface KioskModePlugin {
  unlock(options: { pin: string; openSettings?: boolean }): Promise<{ unlocked: boolean }>;
  lock(): Promise<void>;
}

const native = registerPlugin<KioskModePlugin>("KioskMode");

export async function unlockKiosk(pin: string): Promise<void> {
  await native.unlock({ pin, openSettings: true });
}

export async function lockKiosk(): Promise<void> {
  await native.lock();
}
