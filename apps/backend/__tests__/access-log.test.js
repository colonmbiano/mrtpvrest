'use strict';

// Registro de accesos sin secretos (src/lib/access-log.js): los tokens que llegan en
// la query string (p. ej. /api/bot-alert?token=...) no deben quedar en los logs.

const express = require('express');
const request = require('supertest');
const { accessLog, redactUrl } = require('../src/lib/access-log');

describe('redactUrl', () => {
  it('oculta el valor de token y deja los demás parámetros', () => {
    expect(redactUrl('/api/bot-alert?token=s3cr3t&r=master')).toBe('/api/bot-alert?token=[REDACTED]&r=master');
  });

  it('cubre otros nombres sensibles, sin importar mayúsculas ni codificación', () => {
    expect(redactUrl('/x?API_KEY=a&key=b&Secret=c&password=d&signature=e&access_token=f&hub.verify_token=g'))
      .toBe('/x?API_KEY=[REDACTED]&key=[REDACTED]&Secret=[REDACTED]&password=[REDACTED]&signature=[REDACTED]&access_token=[REDACTED]&hub.verify_token=[REDACTED]');
    expect(redactUrl('/x?%74oken=s3cr3t')).toBe('/x?%74oken=[REDACTED]');
  });

  it('no toca URLs sin query ni parámetros que no son secretos', () => {
    expect(redactUrl('/api/store/menu')).toBe('/api/store/menu');
    expect(redactUrl('/api/store/menu?r=master-burguer-s&format=json')).toBe('/api/store/menu?r=master-burguer-s&format=json');
    expect(redactUrl('/x?token')).toBe('/x?token');
    expect(redactUrl(undefined)).toBe('');
  });

  it('acepta URLs absolutas (Referer) y nombres mal codificados', () => {
    expect(redactUrl('https://a.example/p?token=s3cr3t')).toBe('https://a.example/p?token=[REDACTED]');
    expect(redactUrl('/x?%E0%A4%A=1&token=s3cr3t')).toBe('/x?%E0%A4%A=1&token=[REDACTED]');
  });
});

describe('accessLog', () => {
  function logOf(format, path, headers = {}) {
    const lines = [];
    const app = express();
    app.use(accessLog({ format, stream: { write: (line) => lines.push(line) } }));
    app.post('/api/bot-alert', (_req, res) => res.json({ ok: true }));
    let call = request(app).post(path);
    for (const [name, value] of Object.entries(headers)) call = call.set(name, value);
    return call.then(() => lines.join(''));
  }

  it('el formato combined de producción no escribe el token de la URL ni del Referer', async () => {
    const line = await logOf('combined', '/api/bot-alert?token=s3cr3t-alerta', { Referer: 'https://panel.example/m?key=s3cr3t-panel' });
    expect(line).toContain('POST /api/bot-alert?token=[REDACTED]');
    expect(line).toContain('https://panel.example/m?key=[REDACTED]');
    expect(line).not.toContain('s3cr3t');
  });

  it('el formato dev de desarrollo tampoco', async () => {
    const line = await logOf('dev', '/api/bot-alert?token=s3cr3t-alerta');
    expect(line).toContain('/api/bot-alert?token=[REDACTED]');
    expect(line).not.toContain('s3cr3t');
  });
});
