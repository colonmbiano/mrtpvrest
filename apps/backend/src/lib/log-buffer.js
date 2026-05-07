// Ring buffer in-memory + EventEmitter para los logs estructurados del
// backend. Permite consumir el stream en vivo desde un panel admin sin
// depender de Railway/Datadog.
//
// - capacity = 500 entries (ajustable vía LOG_BUFFER_SIZE).
// - getSnapshot() devuelve el contenido actual ordenado del más viejo al
//   más nuevo.
// - subscribe(fn) llama fn(record) en cada push y devuelve una función
//   unsubscribe.

const { EventEmitter } = require('events');

const MAX = Number(process.env.LOG_BUFFER_SIZE) > 0
  ? Number(process.env.LOG_BUFFER_SIZE)
  : 500;

const buffer = [];
const bus = new EventEmitter();
bus.setMaxListeners(50);

function push(record) {
  buffer.push(record);
  if (buffer.length > MAX) buffer.shift();
  bus.emit('log', record);
}

function getSnapshot() {
  return buffer.slice();
}

function subscribe(fn) {
  bus.on('log', fn);
  return () => bus.off('log', fn);
}

module.exports = { push, getSnapshot, subscribe, capacity: MAX };
