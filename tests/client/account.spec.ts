import { expect, test, type Page } from '@playwright/test';

// Cuenta del comprador del marketplace contra la API simulada (mock-account.mjs).
const API = 'http://127.0.0.1:4328';
const PASSWORD = 'Frase larga de prueba 2026';

let seq = 0;
function newEmail(project: string) {
  return `cliente-${project}-${Date.now()}-${++seq}@correo.mx`;
}

async function lastLink(page: Page, email: string, purpose: 'verify' | 'reset'): Promise<string> {
  const res = await page.request.get(`${API}/__test/outbox?email=${encodeURIComponent(email)}&purpose=${purpose}`);
  const mail = await res.json();
  expect(mail?.token, `sin correo de ${purpose} para ${email}`).toMatch(/^[a-f0-9]{64}$/);
  return mail.token;
}

async function signUp(page: Page, email: string) {
  await page.goto('/registro?tipo=cliente');
  await expect(page.getByRole('heading', { name: 'Crea tu cuenta de cliente' })).toBeVisible();
  await page.getByLabel('Nombre completo').fill('Ana López');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Teléfono').fill('722 123 4567');
  await page.getByLabel('Ciudad o localidad').fill('Valle de Bravo');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirma tu contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();
}

async function verify(page: Page, email: string) {
  const token = await lastLink(page, email, 'verify');
  await page.goto(`/registro/verificar#token=${token}`);
  await expect(page.getByRole('heading', { name: 'Correo verificado' })).toBeVisible();
  // El token no se queda en la barra de direcciones.
  expect(new URL(page.url()).hash).toBe('');
}

async function logIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/cuenta/entrar');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}

test('registro, verificación, entrada, direcciones y salida', async ({ page }, info) => {
  const email = newEmail(info.project.name);
  await signUp(page, email);
  await verify(page, email);

  await page.getByRole('link', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/cuenta\/entrar$/);
  await logIn(page, email);

  await expect(page).toHaveURL(/\/cuenta$/);
  await expect(page.getByRole('heading', { name: 'Ana López' })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  // La libreta llega con el token de comprador (Bearer), no como invitado.
  await expect(page.getByText('Av. Juárez 100, Centro')).toBeVisible();
  await page.getByRole('button', { name: 'Quitar Av. Juárez 100, Centro' }).click();
  await expect(page.getByText('Av. Juárez 100, Centro')).toHaveCount(0);
  await expect(page.getByText('Calle Pino 22, La Peña')).toBeVisible();

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/cuenta');
  await expect(page).toHaveURL(/\/cuenta\/entrar\?next=%2Fcuenta|\/cuenta\/entrar\?next=\/cuenta/);
});

test('el registro valida datos y contraseñas antes de enviar', async ({ page }) => {
  await page.goto('/registro?tipo=cliente');
  await page.getByLabel('Nombre completo').fill('Ana');
  await page.getByLabel('Correo electrónico').fill('no-es-correo');
  await page.getByLabel('Teléfono').fill('123');
  await page.getByLabel('Ciudad o localidad').fill('Valle de Bravo');
  await page.getByLabel('Contraseña', { exact: true }).fill('corta');
  await page.getByLabel('Confirma tu contraseña').fill('corta');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByText('Ingresa un correo electrónico válido.')).toBeVisible();
  await expect(page.getByText('Usa un teléfono de México de 10 dígitos.')).toBeVisible();
  await expect(page.getByText('Usa al menos 12 caracteres.')).toBeVisible();

  await page.getByLabel('Correo electrónico').fill('ana@correo.mx');
  await page.getByLabel('Teléfono').fill('7221234567');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirma tu contraseña').fill(PASSWORD + ' distinta');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByText('Las contraseñas no coinciden.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Crea tu cuenta de cliente' })).toBeVisible();
});

test('sin sesión, Mi cuenta pide entrar; un correo sin verificar no entra', async ({ page }, info) => {
  await page.goto('/cuenta');
  await expect(page).toHaveURL(/\/cuenta\/entrar\?next=/);
  await expect(page.getByRole('heading', { name: 'Entra a tu cuenta' })).toBeVisible();

  const email = newEmail(info.project.name);
  await signUp(page, email);
  await logIn(page, email);
  await expect(page.getByText('Correo o contraseña incorrectos, o tu correo aún no está verificado.')).toBeVisible();
  await expect(page).toHaveURL(/\/cuenta\/entrar$/);
});

test('un enlace de verificación inválido o ya usado lo explica', async ({ page }, info) => {
  await page.goto('/registro/verificar#token=' + 'a'.repeat(64));
  await expect(page.getByRole('heading', { name: 'No pudimos verificar tu correo' })).toBeVisible();
  await expect(page.getByText('El enlace ya se usó o venció. Pide uno nuevo.')).toBeVisible();

  await page.goto('/registro/verificar');
  await expect(page.getByText('El enlace no es válido. Ábrelo completo desde el correo.')).toBeVisible();

  const email = newEmail(info.project.name);
  await signUp(page, email);
  await verify(page, email);
  const used = await lastLink(page, email, 'verify');
  // Abrir el enlace otra vez como desde el correo: página nueva, no solo otro fragmento.
  await page.goto('about:blank');
  await page.goto(`/registro/verificar#token=${used}`);
  await expect(page.getByRole('heading', { name: 'No pudimos verificar tu correo' })).toBeVisible();
});

test('recuperar la contraseña cambia la clave y la anterior deja de servir', async ({ page }, info) => {
  const email = newEmail(info.project.name);
  await signUp(page, email);
  await verify(page, email);

  await page.goto('/cuenta/entrar');
  await page.getByRole('button', { name: 'Recupérala' }).click();
  await expect(page.getByRole('heading', { name: 'Recupera tu contraseña' })).toBeVisible();
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByRole('button', { name: 'Enviar enlace' }).click();
  await expect(page.getByText(/te enviamos un enlace para cambiar tu contraseña/)).toBeVisible();

  const token = await lastLink(page, email, 'reset');
  await page.goto(`/registro/restablecer#token=${token}`);
  const nueva = 'Otra frase larga 2026 segura';
  await page.getByLabel('Contraseña nueva').fill(nueva);
  await page.getByLabel('Confirma la contraseña').fill(nueva);
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();
  await expect(page.getByRole('heading', { name: 'Contraseña actualizada' })).toBeVisible();

  await logIn(page, email);
  await expect(page.getByText('Correo o contraseña incorrectos, o tu correo aún no está verificado.')).toBeVisible();
  await logIn(page, email, nueva);
  await expect(page).toHaveURL(/\/cuenta$/);
});

test('la portada lleva a Mi cuenta y ?next solo acepta rutas internas', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Mi cuenta' }).first()).toHaveAttribute('href', '/cuenta');

  const email = newEmail(info.project.name);
  await signUp(page, email);
  await verify(page, email);
  await page.goto('/cuenta/entrar?next=https://evil.example.com');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/127\.0\.0\.1:4327\/cuenta$/);
});

test('Mis pedidos: lista de todas las tiendas, ver anteriores y seguir con su código', async ({ page }, info) => {
  const email = newEmail(info.project.name);
  await signUp(page, email);
  await verify(page, email);
  await logIn(page, email);
  await expect(page).toHaveURL(/\/cuenta$/);

  await page.getByRole('link', { name: 'Mis pedidos' }).click();
  await expect(page).toHaveURL(/\/cuenta\/pedidos$/);
  const tacos = page.getByRole('listitem').filter({ hasText: 'Tacos Don Pepe' });
  await expect(tacos).toContainText('Pedido #1041');
  await expect(tacos).toContainText('3× Tacos al pastor, 1× Agua de horchata');
  await expect(tacos).toContainText('Listo para recoger');
  await expect(tacos).toContainText('Recoger en tienda');
  await expect(page.getByRole('listitem').filter({ hasText: 'Pizzería Colorines' })).toContainText('En camino');
  // Página de 2: el entregado llega con "ver anteriores".
  await expect(page.getByText('Café del Lago')).toHaveCount(0);
  await page.getByRole('button', { name: 'Ver pedidos anteriores' }).click();
  const cafe = page.getByRole('listitem').filter({ hasText: 'Café del Lago' });
  await expect(cafe).toContainText('Entregado');
  await expect(cafe.getByRole('button', { name: /Seguir pedido/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ver pedidos anteriores' })).toHaveCount(0);

  // Recoger: estado y código de recogida (pedido con la cuenta, sin token de rastreo).
  await tacos.getByRole('button', { name: /Seguir pedido/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Seguimiento del pedido' });
  await expect(dialog.getByRole('heading', { name: 'Listo para recoger' })).toBeVisible();
  await expect(dialog.getByLabel('Código de recogida 1 2 3 4 5 6')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cerrar' }).click();
  await expect(dialog).toHaveCount(0);

  // A domicilio: código de entrega y aviso de ubicación vieja.
  await page.getByRole('listitem').filter({ hasText: 'Pizzería Colorines' }).getByRole('button', { name: /Seguir pedido/ }).click();
  await expect(dialog.getByRole('heading', { name: 'En camino' })).toBeVisible();
  await expect(dialog.getByLabel('Código de entrega 6 5 4 3 2 1')).toBeVisible();
  await expect(dialog.getByText('La ubicación del repartidor no está actualizada.')).toBeVisible();
});

test('Mis pedidos sin sesión pide entrar y vuelve a la lista', async ({ page }, info) => {
  await page.goto('/cuenta/pedidos');
  await expect(page).toHaveURL(/\/cuenta\/entrar\?next=%2Fcuenta%2Fpedidos|\/cuenta\/entrar\?next=\/cuenta\/pedidos/);
  const email = newEmail(info.project.name);
  await signUp(page, email);
  await verify(page, email);
  await page.goto('/cuenta/entrar?next=/cuenta/pedidos');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/cuenta\/pedidos$/);
  await expect(page.getByText('Tacos Don Pepe')).toBeVisible();
});
