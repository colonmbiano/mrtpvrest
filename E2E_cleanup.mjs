// Cleanup: borra todos los tenants "Prueba E2E ..." dejados por el script
const API = 'https://api.mrtpvrest.com'

async function call(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(API + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`)
  return data
}

async function main() {
  // 1. Login como SuperAdmin
  console.log('> Login super@mrtpvrest.com')
  const login = await call('POST', '/api/auth/login', {
    body: { email: 'super@mrtpvrest.com', password: 'SuperAdmin1234!' },
  })
  const token = login.accessToken
  console.log('  OK token obtenido')

  // 2. Listar tenants
  console.log('\n> GET /api/admin/tenants')
  const tenants = await call('GET', '/api/admin/tenants', { token })
  const e2e = tenants.filter(t => /^Prueba E2E /.test(t.name))
  console.log('  total tenants =', tenants.length)
  console.log('  match "Prueba E2E *" =', e2e.length)
  for (const t of e2e) console.log('   -', t.id, t.name)

  // 3. Marcar como CANCELLED (DELETE falla por FK con orders/employees;
  //    cancelar es la forma soportada de desactivar el tenant).
  for (const t of e2e) {
    process.stdout.write('  CANCEL ' + t.id + ' (' + t.name + ') ... ')
    try {
      await call('PATCH', `/api/saas/tenants/${t.id}/status`, {
        token,
        body: { status: 'CANCELLED' },
      })
      console.log('OK')
    } catch (e) {
      console.log('FALLO ->', e.message.slice(0, 150))
    }
  }
  console.log('\n> Cleanup terminado.')
}

main().catch(e => {
  console.error('CLEANUP FALLO:', e.message)
  process.exit(1)
})
