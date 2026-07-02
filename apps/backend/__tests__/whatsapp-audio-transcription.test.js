const {
  normalizeMimeType,
  isSupportedAudioMime,
  isAudioMessage,
  mediaFilenameForMime,
  buildGeminiTranscriptionBody,
  transcribeWhatsAppAudio,
} = require('../src/whatsapp/audioTranscription');

describe('whatsapp audio transcription helpers', () => {
  test('normalizes WhatsApp voice note mime types', () => {
    expect(normalizeMimeType('audio/ogg; codecs=opus')).toBe('audio/ogg');
    expect(isSupportedAudioMime('audio/ogg; codecs=opus')).toBe(true);
    expect(mediaFilenameForMime('audio/ogg; codecs=opus')).toBe('whatsapp-audio.ogg');
  });

  test('detects ptt/audio messages', () => {
    expect(isAudioMessage({ type: 'ptt' })).toBe(true);
    expect(isAudioMessage({ type: 'document', _data: { mimetype: 'audio/mpeg' } })).toBe(true);
    expect(isAudioMessage({ type: 'image', _data: { mimetype: 'image/png' } })).toBe(false);
  });

  test('builds Gemini content with inline audio data', () => {
    const body = buildGeminiTranscriptionBody('audio/ogg', 'base64-audio');

    expect(body.contents[0].parts[1]).toEqual({
      inlineData: {
        mimeType: 'audio/ogg',
        data: 'base64-audio',
      },
    });
    expect(body.generationConfig.temperature).toBe(0);
  });

  test('transcribes downloaded media using provided Gemini client', async () => {
    const msg = {
      type: 'ptt',
      downloadMedia: jest.fn().mockResolvedValue({
        mimetype: 'audio/ogg; codecs=opus',
        data: Buffer.from('fake-audio').toString('base64'),
      }),
    };
    const client = {
      generateContent: jest.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'quiero dos tacos y una coca' }] } }],
      }),
    };

    const result = await transcribeWhatsAppAudio(msg, { client, maxBytes: 1024 });

    expect(result.ok).toBe(true);
    expect(result.text).toBe('quiero dos tacos y una coca');
    expect(result.provider).toBe('gemini');
    expect(client.generateContent).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gemini-2.5-flash',
      body: expect.objectContaining({ contents: expect.any(Array) }),
    }));
  });

  test('rejects audio that exceeds configured size', async () => {
    const msg = {
      type: 'audio',
      downloadMedia: jest.fn().mockResolvedValue({
        mimetype: 'audio/ogg',
        data: Buffer.from('too-large').toString('base64'),
      }),
    };

    const result = await transcribeWhatsAppAudio(msg, { client: {}, maxBytes: 2 });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('AUDIO_TOO_LARGE');
  });
});
