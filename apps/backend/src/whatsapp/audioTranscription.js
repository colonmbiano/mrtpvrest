const axios = require('axios');

const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_MAX_BYTES = 14 * 1024 * 1024;
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

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

function buildGeminiTranscriptionBody(mimeType, data) {
  return {
    contents: [{
      role: 'user',
      parts: [
        {
          text: [
            'Transcribe esta nota de voz de WhatsApp de un cliente de restaurante.',
            'Devuelve solo el texto transcrito en espanol de Mexico.',
            'Cuida productos, cantidades, direccion, telefono, referencias y forma de pago.',
            'No inventes datos que no se escuchan.',
          ].join(' '),
        },
        {
          inlineData: {
            mimeType,
            data,
          },
        },
      ],
    }],
    generationConfig: {
      temperature: 0,
    },
  };
}

function extractGeminiText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  return parts
    .map((part) => part?.text || '')
    .join('\n')
    .trim();
}

async function callGeminiTranscription({ apiKey, model, mimeType, data, client }) {
  const body = buildGeminiTranscriptionBody(mimeType, data);
  if (client?.generateContent) {
    return client.generateContent({ model, body });
  }

  // Key en header (x-goog-api-key), no en la URL, para no filtrarla en logs.
  const url = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`;
  const response = await axios.post(url, body, {
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    timeout: 45_000,
  });
  return response.data;
}

async function transcribeWhatsAppAudio(msg, options = {}) {
  const apiKey = options.apiKey || process.env.GOOGLE_AI_API_KEY;
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
    return { ok: false, code: 'GOOGLE_AI_API_KEY_MISSING', text: '', mimeType };
  }

  try {
    const result = await callGeminiTranscription({
      apiKey,
      model,
      mimeType,
      data: media.data,
      client: options.client,
    });
    const text = extractGeminiText(result);
    return text
      ? { ok: true, code: 'OK', text, mimeType, model, provider: 'gemini' }
      : { ok: false, code: 'EMPTY_TRANSCRIPT', text: '', mimeType, model, provider: 'gemini' };
  } catch (err) {
    return { ok: false, code: 'TRANSCRIPTION_FAILED', text: '', mimeType, model, provider: 'gemini', error: err };
  }
}

module.exports = {
  DEFAULT_MODEL,
  DEFAULT_MAX_BYTES,
  normalizeMimeType,
  isSupportedAudioMime,
  isAudioMessage,
  mediaFilenameForMime,
  buildGeminiTranscriptionBody,
  extractGeminiText,
  transcribeWhatsAppAudio,
};
