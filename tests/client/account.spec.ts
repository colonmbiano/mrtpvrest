import { expect, test, type Locator, type Page } from '@playwright/test';

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

test('favoritas: guardar desde la tienda, verla en Mi cuenta y quitarla', async ({ page }, info) => {
  // Sin sesión, guardar lleva a entrar y vuelve a la tienda.
  await page.goto('/tacos-don-pepe');
  await page.getByRole('button', { name: 'Guardar Tacos Don Pepe en favoritas' }).click();
  await expect(page).toHaveURL(/\/cuenta\/entrar\?next=%2Ftacos-don-pepe/);

  const email = newEmail(info.project.name);
  await signUp(page, email);
  await verify(page, email);
  await page.goto('/cuenta/entrar?next=/tacos-don-pepe');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/tacos-don-pepe$/);

  const save = page.getByRole('button', { name: 'Guardar Tacos Don Pepe en favoritas' });
  await expect(save).toHaveAttribute('aria-pressed', 'false');
  await save.click();
  const saved = page.getByRole('button', { name: 'Quitar Tacos Don Pepe de favoritas' });
  await expect(saved).toHaveAttribute('aria-pressed', 'true');
  // Al volver a la tienda sigue marcada (viene del servidor, no del navegador).
  await page.reload();
  await expect(page.getByRole('button', { name: 'Quitar Tacos Don Pepe de favoritas' })).toBeVisible();

  await page.goto('/cuenta');
  const favorites = page.getByRole('region', { name: 'Mis tiendas favoritas' });
  await expect(favorites.getByRole('link', { name: 'Tacos Don Pepe' })).toHaveAttribute('href', '/tacos-don-pepe');
  await favorites.getByRole('button', { name: 'Quitar Tacos Don Pepe de favoritas' }).click();
  await expect(favorites.getByText('Aún no tienes favoritas.', { exact: false })).toBeVisible();
});

// En `next dev` no hay service worker: las pruebas de avisos ponen uno de mentira
// (registro, PushManager y permiso de notificaciones) antes de que cargue la página.
async function fakePush(page: Page, permission: NotificationPermission = 'default') {
  await page.addInitScript((initial) => {
    let state = initial;
    let current: PushSubscription | null = null;
    const calls: unknown[] = [];
    (window as unknown as { __pushCalls: unknown[] }).__pushCalls = calls;
    Object.defineProperty(Notification, 'permission', { configurable: true, get: () => state });
    Notification.requestPermission = (async () => { if (state === 'default') state = 'granted'; return state; }) as typeof Notification.requestPermission;
    const pushManager = {
      getSubscription: async () => current,
      subscribe: async (options: PushSubscriptionOptionsInit) => {
        const key = new Uint8Array(options.applicationServerKey as ArrayBuffer);
        calls.push({ userVisibleOnly: options.userVisibleOnly, keyLength: key.byteLength, firstByte: key[0] });
        const endpoint = `https://push.example.com/sub-${Math.random().toString(36).slice(2)}`;
        current = {
          endpoint,
          toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } }),
          unsubscribe: async () => { current = null; return true; },
        } as unknown as PushSubscription;
        return current;
      },
    };
    navigator.serviceWorker.getRegistration = (async () => ({ pushManager }) as unknown as ServiceWorkerRegistration) as typeof navigator.serviceWorker.getRegistration;
  }, permission);
}

async function pushEndpoints(page: Page, email: string): Promise<string[]> {
  return (await page.request.get(`${API}/__test/push?email=${encodeURIComponent(email)}`)).json();
}

test('avisos: sin service worker explica que son de la app publicada', async ({ page }, info) => {
  const email = newEmail(info.project.name);
  await signUp(page, email);
  await verify(page, email);
  await logIn(page, email);
  const alerts = page.getByRole('region', { name: 'Avisos de tus pedidos' });
  await expect(alerts).toContainText('Los avisos funcionan en la app publicada o instalada.');
  await expect(alerts.getByRole('button')).toHaveCount(0);
});

test('avisos: activar suscribe este navegador a la cuenta; apagar y salir lo dan de baja', async ({ page }, info) => {
  await fakePush(page);
  const email = newEmail(info.project.name);
  await signUp(page, email);
  await verify(page, email);
  await logIn(page, email);
  const alerts = page.getByRole('region', { name: 'Avisos de tus pedidos' });

  await alerts.getByRole('button', { name: 'Activar avisos' }).click();
  await expect(alerts.getByRole('button', { name: 'Apagar avisos' })).toHaveAttribute('aria-pressed', 'true');
  await expect(alerts).toContainText('Te avisamos en este dispositivo');
  // Avisos visibles y la llave VAPID del servidor en bytes (65, sin comprimir).
  expect(await page.evaluate(() => (window as unknown as { __pushCalls: unknown[] }).__pushCalls)).toEqual([{ userVisibleOnly: true, keyLength: 65, firstByte: 4 }]);
  const [endpoint] = await pushEndpoints(page, email);
  expect(endpoint).toMatch(/^https:\/\/push\.example\.com\/sub-/);

  await alerts.getByRole('button', { name: 'Apagar avisos' }).click();
  await expect(alerts.getByRole('button', { name: 'Activar avisos' })).toHaveAttribute('aria-pressed', 'false');
  expect(await pushEndpoints(page, email)).toEqual([]);

  // Cerrar sesión también da de baja este navegador.
  await alerts.getByRole('button', { name: 'Activar avisos' }).click();
  await expect(alerts.getByRole('button', { name: 'Apagar avisos' })).toBeVisible();
  expect(await pushEndpoints(page, email)).toHaveLength(1);
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await pushEndpoints(page, email)).toEqual([]);
});

test('avisos: con las notificaciones bloqueadas explica cómo permitirlas', async ({ page }, info) => {
  await fakePush(page, 'denied');
  const email = newEmail(info.project.name);
  await signUp(page, email);
  await verify(page, email);
  await logIn(page, email);
  const alerts = page.getByRole('region', { name: 'Avisos de tus pedidos' });
  await expect(alerts).toContainText('Bloqueaste las notificaciones de este sitio.');
  await expect(alerts.getByRole('button')).toHaveCount(0);
});

test('volver a pedir abre la tienda con los mismos productos en el carrito', async ({ page }, info) => {
  const email = newEmail(info.project.name);
  await signUp(page, email);
  await verify(page, email);
  await logIn(page, email);
  await page.goto('/cuenta/pedidos');
  await page.getByRole('button', { name: 'Ver pedidos anteriores' }).click();
  const cafe = page.getByRole('listitem').filter({ hasText: 'Café del Lago' });
  // Solo los pedidos terminados se repiten; los activos se siguen.
  await expect(page.getByRole('listitem').filter({ hasText: 'Tacos Don Pepe' }).getByRole('link', { name: 'Volver a pedir' })).toHaveCount(0);
  const again = cafe.getByRole('link', { name: 'Volver a pedir' });
  const href = await again.getAttribute('href');
  const url = new URL(href!);
  expect(url.pathname).toBe('/cafe-del-lago');
  // El enlace solo lleva ids y cantidades: el precio sale del menú vigente.
  const cart = JSON.parse(Buffer.from(url.searchParams.get('cart')!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  expect(cart).toEqual([{ m: 'm4', q: 2 }]);
  await again.click();
  await expect(page).toHaveURL(/\/cafe-del-lago$/);
});

// La app instalable del marketplace: manifiesto propio, íconos, página sin conexión
// y la invitación a instalarla.
function pngSize(png: Buffer) {
  // Cabecera PNG: firma de 8 bytes y el bloque IHDR con ancho y alto.
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

test('app: el marketplace tiene su manifiesto con íconos; las tiendas no lo heredan', async ({ page }) => {
  const res = await page.request.get('/marketplace.webmanifest');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('application/manifest+json');
  const manifest = await res.json();
  expect(manifest).toMatchObject({ id: '/', start_url: '/', scope: '/', display: 'standalone', lang: 'es-MX' });
  expect(manifest.shortcuts.map((s: { url: string }) => s.url)).toEqual(['/cuenta/pedidos', '/cuenta']);
  expect(manifest.icons.map((i: { purpose: string }) => i.purpose)).toContain('maskable');
  const icons = [
    ...manifest.icons.map((i: { src: string; sizes: string }) => [i.src, Number(i.sizes.split('x')[0])]),
    ['/icons/marketplace-apple-touch-icon.png', 180],
    // Respaldo del manifiesto de cada tienda (lib/tenant.ts).
    ['/icons/icon-192.png', 192], ['/icons/icon-512.png', 512], ['/icons/apple-touch-icon.png', 180],
  ] as [string, number][];
  for (const [src, size] of icons) {
    const png = await page.request.get(src);
    expect(png.status(), src).toBe(200);
    expect(png.headers()['content-type'], src).toBe('image/png');
    expect(pngSize(await png.body()), src).toEqual({ width: size, height: size });
  }

  for (const path of ['/', '/cuenta/entrar', '/registro?tipo=cliente']) {
    await page.goto(path);
    await expect(page.locator('link[rel="manifest"]'), path).toHaveAttribute('href', '/marketplace.webmanifest');
    await expect(page.locator('link[rel="apple-touch-icon"]'), path).toHaveAttribute('href', '/icons/marketplace-apple-touch-icon.png');
  }
  await page.goto('/tacos-don-pepe');
  await expect(page.getByRole('heading', { name: 'Tacos Don Pepe' }).first()).toBeVisible();
  await expect(page.locator('link[rel="manifest"][href="/marketplace.webmanifest"]')).toHaveCount(0);
});

test('app: la página sin conexión existe y ofrece reintentar', async ({ page }) => {
  // Es la que el service worker precachea; si no existiera, no se instalaría.
  const res = await page.goto('/_offline');
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Estás sin conexión' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByRole('heading', { name: 'Estás sin conexión' })).toBeVisible();
});

// Chromium avisa que la app se puede instalar con `beforeinstallprompt`; las pruebas
// lo disparan a mano y cuentan las veces que se abre el aviso nativo.
async function fakeInstallPrompt(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __installPrompts: number; __offerInstall: () => void };
    w.__installPrompts = 0;
    w.__offerInstall = () => {
      const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
        platforms: ['web'],
        prompt: async () => { w.__installPrompts++; },
        userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
      });
      window.dispatchEvent(event);
    };
  });
}

// Hasta que la página hidrata no hay quien escuche el evento: se repite hasta que aparece.
async function offerInstall(page: Page, button: Locator) {
  await expect(async () => {
    await page.evaluate(() => (window as unknown as { __offerInstall: () => void }).__offerInstall());
    await expect(button).toBeVisible({ timeout: 500 });
  }).toPass();
}

const installPrompts = (page: Page) => page.evaluate(() => (window as unknown as { __installPrompts: number }).__installPrompts);

test('app: cuando el navegador permite instalarla, la portada y Mi cuenta lo ofrecen', async ({ page }, info) => {
  await fakeInstallPrompt(page);
  await page.goto('/');
  const header = page.getByRole('button', { name: 'Instalar la app' });
  await offerInstall(page, header);
  await header.click();
  await expect.poll(() => installPrompts(page)).toBe(1);
  // El aviso del navegador sirve una sola vez.
  await expect(header).toHaveCount(0);

  const email = newEmail(info.project.name);
  await signUp(page, email);
  await verify(page, email);
  await logIn(page, email);
  const install = page.getByRole('region', { name: 'Instala la app' });
  // Sin el aviso del navegador (y fuera de iPhone) la sección no aparece.
  await expect(page.getByRole('region', { name: 'Avisos de tus pedidos' })).toContainText('Los avisos funcionan');
  await expect(install).toHaveCount(0);
  await offerInstall(page, install.getByRole('button', { name: 'Instalar app' }));
  await install.getByRole('button', { name: 'Instalar app' }).click();
  await expect.poll(() => installPrompts(page)).toBe(1);
  await expect(install).toHaveCount(0);
});

test('app: en iPhone, Mi cuenta explica cómo agregarla a inicio; ya instalada no insiste', async ({ page }, info) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'userAgent', {
      configurable: true,
      get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    });
  });
  const email = newEmail(info.project.name);
  await signUp(page, email);
  await verify(page, email);
  await logIn(page, email);
  const install = page.getByRole('region', { name: 'Instala la app' });
  await expect(install).toContainText('toca Compartir y luego «Agregar a inicio»');
  await expect(install.getByRole('button')).toHaveCount(0);

  // Abierta desde la pantalla de inicio (Safari marca navigator.standalone).
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'standalone', { configurable: true, get: () => true });
  });
  await page.reload();
  await expect(page.getByRole('region', { name: 'Avisos de tus pedidos' })).toContainText('Los avisos funcionan');
  await expect(install).toHaveCount(0);
});
