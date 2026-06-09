/**
 * notificationSound.ts
 * Timbre de notificación para el TPV vía Web Audio API.
 *
 * Por qué Web Audio y no <audio src="/notification.mp3">:
 *  - No depende de un asset en /public. El mp3 nunca existió en apps/tpv y
 *    `new Audio("/notification.mp3")` daba 404 → ningún pedido web sonaba.
 *  - Funciona offline, clave en una caja con red intermitente.
 *  - Un único AudioContext reutilizado evita fugas al crear uno por aviso.
 *
 * Autoplay: los navegadores bloquean el audio hasta el primer gesto del
 * usuario. primeNotificationSound() registra (una sola vez) listeners que
 * "despiertan" el contexto en el primer toque/tecla del cajero, de modo que
 * el primer pedido web ya suene.
 */
"use client";

type WindowWithWebkit = Window & { webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null;
let primed = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  try {
    const Ctor =
      window.AudioContext || (window as WindowWithWebkit).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  } catch {
    return null;
  }
  return ctx;
}

/**
 * Registra (idempotente) el desbloqueo del audio en el primer gesto del
 * cajero. Llamar una vez al montar la terminal.
 */
export function primeNotificationSound(): void {
  if (primed || typeof window === "undefined") return;
  primed = true;
  const unlock = () => {
    const c = getCtx();
    if (c && c.state === "suspended") c.resume().catch(() => {});
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  window.addEventListener("touchstart", unlock);
}

/**
 * Reproduce un timbre de dos tonos ascendentes ("ding-dong"), claro y
 * audible en una caja con ruido, distinto del tick del NumpadPIN.
 */
export function playNotificationSound(): void {
  const c = getCtx();
  if (!c) return;
  // Si sigue suspendido (aún sin gesto previo) intentamos reanudar; si el
  // navegador lo rechaza, el catch lo silencia sin romper nada.
  if (c.state === "suspended") c.resume().catch(() => {});

  const now = c.currentTime;
  const tones = [
    { freq: 880, start: 0, dur: 0.18 }, // A5
    { freq: 1175, start: 0.16, dur: 0.3 }, // D6
  ];
  for (const t of tones) {
    try {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain);
      gain.connect(c.destination);
      osc.type = "sine";
      osc.frequency.value = t.freq;
      const s = now + t.start;
      // Ataque rápido + caída exponencial. Arrancamos en ~0 porque
      // exponentialRamp no admite 0 exacto.
      gain.gain.setValueAtTime(0.0001, s);
      gain.gain.exponentialRampToValueAtTime(0.35, s + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, s + t.dur);
      osc.start(s);
      osc.stop(s + t.dur);
    } catch {
      /* AudioContext puede no estar disponible en terminales restringidas. */
    }
  }
}
