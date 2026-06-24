// Tests del endurecimiento del registro self-serve:
// - isDisposableEmail: bloqueo de desechables / dominios de prueba.
// - verifyTurnstile: se omite (ok) cuando no hay TURNSTILE_SECRET_KEY.

const { isDisposableEmail } = require('../src/lib/email-domains')
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

describe('verifyTurnstile', () => {
  const original = process.env.TURNSTILE_SECRET_KEY

  afterEach(() => {
    if (original === undefined) delete process.env.TURNSTILE_SECRET_KEY
    else process.env.TURNSTILE_SECRET_KEY = original
  })

  test('sin secret configurado: se omite y pasa', async () => {
    delete process.env.TURNSTILE_SECRET_KEY
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
