/**
 * Wrapper JS al plugin nativo Android `TcpListener`.
 *
 * El plugin abre un ServerSocket en el port indicado y emite `data`
 * cada vez que el TPV (u otra impresora-cliente) entrega un payload
 * ESC/POS completo. Al detener (stop o re-start con port distinto) el
 * server cierra el ServerSocket y termina el thread accept.
 *
 * En web (next dev) el plugin no existe — `start` rechaza con
 * "Plugin no disponible" para que el caller pueda hacer fallback a
 * un canal alternativo (socket.io / polling) durante desarrollo.
 */

import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export interface TcpListenerData {
  hex: string;
  text: string;
  length: number;
  from: string;
}

interface TcpListenerPlugin {
  start(opts: { port: number }): Promise<{ port: number; started: boolean }>;
  stop(): Promise<void>;
  status(): Promise<{ listening: boolean; port: number }>;
  addListener(
    event: "data",
    cb: (ev: TcpListenerData) => void,
  ): Promise<PluginListenerHandle>;
}

const native = registerPlugin<TcpListenerPlugin>("TcpListener");

let activeListener: PluginListenerHandle | null = null;

export async function startTcpListener(port = 9100): Promise<{ port: number; started: boolean }> {
  return native.start({ port });
}

export async function stopTcpListener(): Promise<void> {
  if (activeListener) {
    try { await activeListener.remove(); } catch { /* noop */ }
    activeListener = null;
  }
  return native.stop();
}

export async function listenForData(cb: (data: TcpListenerData) => void): Promise<void> {
  // Solo permitimos UN listener vivo a la vez para evitar handlers
  // duplicados al re-montar el componente.
  if (activeListener) {
    try { await activeListener.remove(); } catch { /* noop */ }
    activeListener = null;
  }
  activeListener = await native.addListener("data", cb);
}

export async function tcpListenerStatus(): Promise<{ listening: boolean; port: number }> {
  try {
    return await native.status();
  } catch {
    return { listening: false, port: -1 };
  }
}
