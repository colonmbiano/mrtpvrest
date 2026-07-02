const OpenAI = require('openai');
const { toFile } = require('openai');

const DEFAULT_MODEL = 'gpt-4o-mini-transcribe';
const DEFAULT_MAX_BYTES = 24 * 1024 * 1024;

const AUDIO_TYPES = new Set(['audio', 'ptt', 'voice']);
const MIME_EXTENSIONS = new Map([
  ['audio/flac', 'flac'],
  ['audio/mpeg', 'mp3'],
  ['audio/mp3', 'mp3'],
  ['audio/mp4', 'mp4'],
  ['audio/mpga', 'mpga'],
  ['audio/m4a', 'm4a'],
  ['audio/ogg', 'ogg'],
  ['audio/opus', 'ogg'],
  ['audio/wav', 'wav'],
  ['audio/wave', 'wav'],
  ['audio/x-wav', 'wav'],
  ['audio/webm', 'webm'],
]);

function normalizeMimeType(value) {
  return String(value || '').split(';')[0].trim().toLowerCase();
}

function isSupportedAudioMime(mimeType) {
  return MIME_EXTENSIONS.has(normalizeMimeType(mimeType));
}

function isAudioMessage(msg) {
  const type = String(msg?.type || '').toLowerCase();
  const mimeType = msg?._data?.mimetype || msg?.mimetype;
  return AUDIO_TYPES.has(type) || isSupportedAudioMime(mimeType);
}

function mediaFilenameForMime(mimeType) {
  const normalized = normalizeMimeType(mimeType) || 'audio/ogg';
  const ext = MIME_EXTENSIONS.get(normalized) || 'ogg';
  return `whatsapp-audio.${ext}`;
}

function resolveMaxBytes() {
  const configured = Number(process.env.WHATSAPP_AUDIO_MAX_BYTES || 0);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_BYTES;
}

async function transcribeWhatsAppAudio(msg, options = {}) {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  const model = options.model || process.env.WHATSAPP_AUDIO_TRANSCRIPTION_MODEL || DEFAULT_MODEL;
  const maxBytes = options.maxBytes || resolveMaxBytes();

  if (typeof msg?.downloadMedia !== 'function') {
    return { ok: false, code: 'NO_MEDIA_DOWNLOADER', text: '' };
  }

  let media;
  try {
    media = await msg.downloadMedia();
  } catch (err) {
    return { ok: false, code: 'DOWNLOAD_FAILED', text: '', error: err };
  }

  if (!media?.data) {
    return { ok: false, code: 'EMPTY_MEDIA', text: '' };
  }

  const mimeType = normalizeMimeType(media.mimetype || msg?._data?.mimetype || msg?.mimetype);
  if (!isSupportedAudioMime(mimeType)) {
    return { ok: false, code: 'UNSUPPORTED_AUDIO_TYPE', text: '', mimeType };
  }

  const buffer = Buffer.from(media.data, 'base64');
  if (!buffer.length) {
    return { ok: false, code: 'EMPTY_AUDIO', text: '', mimeType };
  }
  if (buffer.length > maxBytes) {
    return { ok: false, code: 'AUDIO_TOO_LARGE', text: '', mimeType, bytes: buffer.length };
  }

  if (!apiKey && !options.client) {
    return { ok: false, code: 'OPENAI_API_KEY_MISSING', text: '', mimeType };
  }

  try {
    const client = options.client || new OpenAI({ apiKey });
    const file = await toFile(buffer, mediaFilenameForMime(mimeType), { type: mimeType });
    const result = await client.audio.transcriptions.create({
      file,
      model,
      language: 'es',
      response_format: 'json',
      prompt: 'Pedido de restaurante en espanol de Mexico. Transcribe productos, cantidades, direccion, telefono y forma de pago con cuidado.',
    });
    const text = String(result?.text || '').trim();
    return text
      ? { ok: true, code: 'OK', text, mimeType, model }
      : { ok: false, code: 'EMPTY_TRANSCRIPT', text: '', mimeType, model };
  } catch (err) {
    return { ok: false, code: 'TRANSCRIPTION_FAILED', text: '', mimeType, model, error: err };
  }
}

module.exports = {
  DEFAULT_MODEL,
  DEFAULT_MAX_BYTES,
  normalizeMimeType,
  isSupportedAudioMime,
  isAudioMessage,
  mediaFilenameForMime,
  transcribeWhatsAppAudio,
};
