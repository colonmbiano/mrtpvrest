/**
 * haptics.ts — wrappers seguros sobre @capacitor/haptics.
 *
 * Las funciones se autoanulan en web (Capacitor.isNativePlatform = false).
 * El plugin se importa dinámicamente para no inflar el bundle web ni
 * fallar en SSR/Next.js export. Si el plugin no está instalado o el
 * dispositivo no soporta vibración, los errores se tragan silenciosamente
 * — un cobro nunca debe fallar porque no se haya podido vibrar.
 */

let nativeChecked = false;
let isNative = false;

async function ensureNative(): Promise<boolean> {
  if (nativeChecked) return isNative;
  nativeChecked = true;
  try {
    const { Capacitor } = await import("@capacitor/core");
    isNative = Capacitor.isNativePlatform();
  } catch {
    isNative = false;
  }
  return isNative;
}

export async function hapticLight(): Promise<void> {
  if (!(await ensureNative())) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* noop */
  }
}

export async function hapticMedium(): Promise<void> {
  if (!(await ensureNative())) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch {
    /* noop */
  }
}

export async function hapticHeavy(): Promise<void> {
  if (!(await ensureNative())) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Heavy });
  } catch {
    /* noop */
  }
}

export async function hapticSuccess(): Promise<void> {
  if (!(await ensureNative())) return;
  try {
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    /* noop */
  }
}

export async function hapticWarning(): Promise<void> {
  if (!(await ensureNative())) return;
  try {
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType.Warning });
  } catch {
    /* noop */
  }
}

export async function hapticError(): Promise<void> {
  if (!(await ensureNative())) return;
  try {
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType.Error });
  } catch {
    /* noop */
  }
}
