'use strict';

// ───────────────────────────────────────────────────────────────────────────
// table-qr.js — Token firmado del QR de mesa.
//
// El QR de cada mesa llevaba `?mesa=<número>`, con dos problemas:
//   1. El vínculo se rehacía por NOMBRE en cada pedido, así que renombrar una
//      mesa reasignaba el papel ya pegado (el QR de "Mesa 4" empezaba a mandar
//      pedidos a la que ahora tuviera el 4), y dos mesas con el mismo número
//      dejaban el pedido huérfano del mapa.
//   2. `?mesa=1` es texto plano y adivinable: cualquiera podía pedir a nombre de
//      otra mesa desde su casa editando la URL.
//
// El token ata el pedido al `tableId` real y lo firma:
//
//   token = base64url("<tableId>.<número>") + "." + base64url(HMAC-SHA256)
//
// El número viaja DENTRO del payload firmado (no como parámetro suelto) para que
// la etiqueta que ve el comensal y la mesa a la que entra el pedido salgan de la
// misma fuente: alterar el número invalida la firma.
//
// La firma no pretende ser un secreto fuerte — quien se sienta en la mesa puede
// escanear el QR igual. Lo que cierra es el abuso REMOTO: sin la llave no se
// puede fabricar un token para una mesa arbitraria.
// ───────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');

// Bytes de HMAC que se conservan. 16 bytes (128 bits) es de sobra contra
// falsificación y mantiene el QR chico — importante: un token más largo obliga a
// una matriz más densa y el código impreso se vuelve difícil de escanear.
const SIG_BYTES = 16;

// Llave dedicada si existe; si no, la del JWT (siempre presente en prod). Se lee
// en cada llamada a propósito: los tests cambian el env entre casos.
function secret() {
  return process.env.TABLE_QR_SECRET || process.env.JWT_SECRET || '';
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function sign(payload) {
  return b64url(crypto.createHmac('sha256', secret()).update(payload).digest()).slice(
    0,
    Math.ceil((SIG_BYTES * 4) / 3),
  );
}

/**
 * Token firmado para el QR de una mesa.
 * @returns {string} token, o '' si no hay llave configurada (el caller cae al
 *          esquema legacy `?mesa=`).
 */
function signTableToken({ tableId, number }) {
  if (!secret() || !tableId) return '';
  const payload = b64url(`${tableId}.${number ?? ''}`);
  return `${payload}.${sign(payload)}`;
}

/**
 * Verifica un token del QR.
 * @returns {{tableId: string, number: number|null}|null} null si el token es
 *          inválido, viene alterado o no hay llave para verificar.
 */
function verifyTableToken(token) {
  if (!secret() || typeof token !== 'string') return null;
  // Tope defensivo: no gastamos HMAC en cadenas enormes de un cliente hostil.
  if (!token || token.length > 512) return null;

  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const provided = token.slice(dot + 1);

  const expected = sign(payload);
  // timingSafeEqual exige buffers del mismo largo; si difieren, ya no coincide.
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let decoded;
  try {
    decoded = Buffer.from(payload, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  // El id es lo que va antes del ÚLTIMO punto: los cuid no traen puntos, pero
  // así el formato aguanta ids que sí los tuvieran.
  const sep = decoded.lastIndexOf('.');
  if (sep <= 0) return null;
  const tableId = decoded.slice(0, sep);
  const rawNumber = decoded.slice(sep + 1);
  const number = /^\d+$/.test(rawNumber) ? parseInt(rawNumber, 10) : null;
  if (!tableId) return null;

  return { tableId, number };
}

module.exports = { signTableToken, verifyTableToken };
