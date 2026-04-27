// Helpers para mapear errores de Groq (vía OpenAI SDK) a errores HTTP del API.
// Si Groq devuelve 429 o 5xx (saturación / fallo upstream), exponemos un error
// 503 al cliente con un mensaje en español.

const GROQ_BUSY_MESSAGE = 'El motor de respuesta rápida está saturado, intenta de nuevo en unos segundos';
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const GROQ_MODEL = 'llama-3.1-8b-instant';

function isGroqOverload(err) {
  if (!err) return false;
  const status = Number(err.status ?? err.statusCode ?? err.response?.status ?? 0);
  if (status === 429) return true;
  if (status >= 500 && status < 600) return true;
  const msg = String(err.message || '').toLowerCase();
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests')) return true;
  if (msg.includes('overloaded') || msg.includes('service unavailable') || msg.includes('upstream')) return true;
  return false;
}

function wrapGroqError(err) {
  if (isGroqOverload(err)) {
    const wrapped = new Error(GROQ_BUSY_MESSAGE);
    wrapped.code = 'GROQ_BUSY';
    wrapped.status = 503;
    wrapped.cause = err;
    return wrapped;
  }
  const wrapped = new Error(err?.message || 'Error consultando el motor de IA.');
  wrapped.code = err?.code || 'UPSTREAM';
  wrapped.status = Number(err?.status ?? err?.statusCode ?? 502);
  wrapped.cause = err;
  return wrapped;
}

module.exports = {
  GROQ_BUSY_MESSAGE,
  GROQ_BASE_URL,
  GROQ_MODEL,
  isGroqOverload,
  wrapGroqError,
};
