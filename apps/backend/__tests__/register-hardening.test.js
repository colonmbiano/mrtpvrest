// Tests del endurecimiento del registro self-serve:
// - isDisposableEmail: bloqueo de desechables / dominios de prueba.
// - verifyTurnstile: se omite (ok) cuando no hay TURNSTILE_SECRET_KEY.

const { isDisposableEmail, normalizeEmail } = require('../src/lib/email-domains')
const { verifyTurnstile } = require('../src/lib/turnstile')

describe('isDisposableEmail', () => {
  test.each([
    'user5560@example.com',
    'foo@example.org',
    'a@test.com',
    'parisuh1350@temzo.tech',
    'x@mailinator.com',
    'y@10minutemail.com',
    'z@empresa.local',
    'q@algo.test',
    'sinarroba',
    '',
    null,
  ])('rechaza desechable/invalido: %s', (email) => {
    expect(isDisposableEmail(email)).toBe(true)
  })

  test.each([
    'colon@gmail.com',
    'dueno@mirestaurante.com',
    'pape.renata.bp@gmail.com',
    'contacto@tacoselgordo.mx',
    'admin@hotmail.com',
  ])('permite real: %s', (email) => {
    expect(isDisposableEmail(email)).toBe(false)
  })
})

describe('normalizeEmail', () => {
  // Variantes de la MISMA bandeja de Gmail colapsan a un canónico → no se puede
  // evadir el chequeo de duplicado con +tag ni con puntos.
  test.each([
    ['colon@gmail.com', 'colon@gmail.com'],
    ['colon+spam@gmail.com', 'colon@gmail.com'],
    ['c.o.l.o.n@gmail.com', 'colon@gmail.com'],
    ['c.o.l.o.n+99@googlemail.com', 'colon@googlemail.com'],
    ['Colon+Tag@Gmail.com', 'colon@gmail.com'],
  ])('canonicaliza Gmail %s → %s', (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected)
  })

  // +tag se quita en proveedores con subdirección; los puntos NO (solo Gmail).
  test('quita +tag pero conserva puntos fuera de Gmail', () => {
    expect(normalizeEmail('john.doe+promos@outlook.com')).toBe('john.doe@outlook.com')
  })

  // Dominio propio: ni +tag ni puntos se tocan (puede ser dirección literal).
  test('no toca local-part de dominios propios', () => {
    expect(normalizeEmail('ventas+web@mirestaurante.com')).toBe('ventas+web@mirestaurante.com')
  })

  test.each([['', ''], [null, ''], ['sinarroba', 'sinarroba']])(
    'entrada inválida %s → %s', (input, expected) => {
      expect(normalizeEmail(input)).toBe(expected)
    })
})

describe('verifyTurnstile', () => {
  const originalSecret = process.env.TURNSTILE_SECRET_KEY
  const originalEnv = process.env.NODE_ENV
  const originalOpt = process.env.TURNSTILE_OPTIONAL

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY
    else process.env.TURNSTILE_SECRET_KEY = originalSecret
    process.env.NODE_ENV = originalEnv
    if (originalOpt === undefined) delete process.env.TURNSTILE_OPTIONAL
    else process.env.TURNSTILE_OPTIONAL = originalOpt
  })

  test('sin secret en dev: se omite y pasa', async () => {
    delete process.env.TURNSTILE_SECRET_KEY
    process.env.NODE_ENV = 'test'
    const r = await verifyTurnstile(undefined, '1.2.3.4')
    expect(r.ok).toBe(true)
    expect(r.skipped).toBe(true)
  })

  test('sin secret en producción: falla cerrado', async () => {
    delete process.env.TURNSTILE_SECRET_KEY
    process.env.NODE_ENV = 'production'
    delete process.env.TURNSTILE_OPTIONAL
    const r = await verifyTurnstile('algun-token', '1.2.3.4')
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('captcha-misconfigured')
  })

  test('sin secret en producción con opt-out explícito: se omite', async () => {
    delete process.env.TURNSTILE_SECRET_KEY
    process.env.NODE_ENV = 'production'
    process.env.TURNSTILE_OPTIONAL = 'true'
    const r = await verifyTurnstile(undefined, '1.2.3.4')
    expect(r.ok).toBe(true)
    expect(r.skipped).toBe(true)
  })

  test('con secret pero sin token: falla cerrado', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'dummy-secret'
    const r = await verifyTurnstile('', '1.2.3.4')
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('missing-token')
  })
})
