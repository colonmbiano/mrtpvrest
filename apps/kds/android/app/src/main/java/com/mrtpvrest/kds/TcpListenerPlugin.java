package com.mrtpvrest.kds;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.ServerSocket;
import java.net.Socket;

/**
 * TcpListener — servidor TCP minimal para que el KDS reciba "comandas
 * impresas" como si fuera una impresora térmica de cocina.
 *
 * La mayoría de los KDS comerciales modelan así el flujo:
 * el TPV manda ESC/POS por TCP a la IP del KDS exactamente igual que a
 * una impresora real. La pantalla escucha en port 9100, parsea el
 * payload (texto plano + comandos format) y muestra la comanda como
 * tarjeta. Es la arquitectura más simple porque no requiere socket.io
 * ni que backend conozca la topología de pantallas.
 *
 * El plugin escucha en un único port a la vez. Cada conexión entrante
 * se acepta en su propio thread, lee hasta CUT (1D 56 42 00) o EOF, y
 * emite el evento `data` al lado JS con el buffer en hex + intento de
 * decodificación a texto Latin1 (suficiente para ESC/POS estándar).
 *
 * Limitación intencional: no implementamos auth ni TLS. La pantalla
 * KDS está en LAN privada del restaurante y solo recibe del TPV de la
 * misma red.
 */
@CapacitorPlugin(name = "TcpListener")
public class TcpListenerPlugin extends Plugin {

    private ServerSocket server;
    private Thread acceptThread;
    private int currentPort = -1;

    @PluginMethod
    public void start(PluginCall call) {
        int port = call.getInt("port", 9100);
        if (server != null && currentPort == port && !server.isClosed()) {
            JSObject ret = new JSObject();
            ret.put("port", currentPort);
            ret.put("started", false);
            call.resolve(ret);
            return;
        }
        // Reiniciar si estaba escuchando otro port distinto.
        stopInternal();

        try {
            server = new ServerSocket(port);
            currentPort = port;
        } catch (IOException e) {
            call.reject("No se pudo abrir el port " + port + ": " + e.getMessage());
            return;
        }

        final ServerSocket boundServer = server;
        acceptThread = new Thread(() -> {
            while (!Thread.currentThread().isInterrupted() && !boundServer.isClosed()) {
                try {
                    Socket client = boundServer.accept();
                    handleClient(client);
                } catch (IOException e) {
                    // accept() falla cuando server.close() se invoca; salir limpio.
                    break;
                }
            }
        }, "TcpListener-accept");
        acceptThread.setDaemon(true);
        acceptThread.start();

        JSObject ret = new JSObject();
        ret.put("port", currentPort);
        ret.put("started", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopInternal();
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject ret = new JSObject();
        boolean alive = server != null && !server.isClosed();
        ret.put("listening", alive);
        ret.put("port", alive ? currentPort : -1);
        call.resolve(ret);
    }

    private void stopInternal() {
        if (server != null) {
            try {
                server.close();
            } catch (IOException ignored) { /* noop */ }
            server = null;
        }
        if (acceptThread != null) {
            acceptThread.interrupt();
            acceptThread = null;
        }
        currentPort = -1;
    }

    private void handleClient(Socket client) {
        new Thread(() -> {
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            try {
                client.setSoTimeout(2000);
                InputStream in = client.getInputStream();
                byte[] tmp = new byte[2048];
                int n;
                while ((n = in.read(tmp)) > 0) {
                    buf.write(tmp, 0, n);
                    // Salir antes de timeout si vemos el comando CUT al final
                    // (GS V B 00 = 0x1D 0x56 0x42 0x00). Es el último byte que
                    // manda buildKitchenTicket / buildCustomerReceipt en el TPV.
                    byte[] cur = buf.toByteArray();
                    int len = cur.length;
                    if (len >= 4
                        && (cur[len - 4] & 0xFF) == 0x1D
                        && (cur[len - 3] & 0xFF) == 0x56
                        && (cur[len - 2] & 0xFF) == 0x42
                        && (cur[len - 1] & 0xFF) == 0x00) {
                        break;
                    }
                }
            } catch (IOException ignored) {
                // soTimeout o cliente desconectado: no es error si llegamos a tener datos.
            } finally {
                try { client.close(); } catch (IOException ignored) { /* noop */ }
            }

            byte[] data = buf.toByteArray();
            if (data.length == 0) return;

            // Decodificación tolerante: ESC/POS suele ir en CP437/Latin1 con
            // comandos binarios. Mandamos hex (canónico) y un intento de
            // texto en Latin1 para que el JS no tenga que reimplementar
            // decoding si solo le interesan los caracteres imprimibles.
            String hex = bytesToHex(data);
            String text;
            try {
                text = new String(data, "ISO-8859-1");
            } catch (Exception e) {
                text = new String(data);
            }

            JSObject event = new JSObject();
            event.put("hex", hex);
            event.put("text", text);
            event.put("length", data.length);
            event.put("from", client.getInetAddress() != null ? client.getInetAddress().getHostAddress() : "?");
            notifyListeners("data", event);
        }, "TcpListener-client").start();
    }

    private static String bytesToHex(byte[] bytes) {
        char[] hexChars = new char[bytes.length * 2];
        for (int j = 0; j < bytes.length; j++) {
            int v = bytes[j] & 0xFF;
            hexChars[j * 2]     = HEX_ALPHABET[v >>> 4];
            hexChars[j * 2 + 1] = HEX_ALPHABET[v & 0x0F];
        }
        return new String(hexChars);
    }

    private static final char[] HEX_ALPHABET = "0123456789abcdef".toCharArray();
}
