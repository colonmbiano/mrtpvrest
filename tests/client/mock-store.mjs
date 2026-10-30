// API aislada para las pruebas del menú QR. Nunca envía pedidos a producción.
import { createServer } from 'node:http';

const categories = [
  { id: 'burgers', name: 'Hamburguesas', items: [
    { id: 'classic', name: 'Hamburguesa clásica', description: 'Carne de res, queso y verduras frescas.', price: 95 },
    { id: 'custom', name: 'Hamburguesa a tu gusto', description: 'Elige tu tamaño y preparación.', price: 110,
      variants: [{ id: 'single', name: 'Sencilla', price: 110 }, { id: 'double', name: 'Doble', price: 150 }],
      modifierGroups: [{ id: 'cooking', name: 'Término', required: true, modifiers: [{ id: 'well', name: 'Bien cocida', priceAdd: 0 }] }] },
    { id: 'combo', name: 'Combo de hamburguesa', description: 'Hamburguesa con bebida a elegir.', price: 140, isCombo: true,
      comboComponents: [{ id: 'drink-choice', name: 'Tu bebida', minSelect: 1, maxSelect: 1, isRequired: true,
        options: [{ id: 'cola-option', priceDelta: 0, optionMenuItemId: 'cola', optionMenuItem: { id: 'cola', name: 'Refresco' } }] }] },
  ] },
  { id: 'drinks', name: 'Bebidas', items: [
    { id: 'lemon', name: 'Limonada', description: 'Limón natural y agua mineral.', price: 40 },
    { id: 'coffee', name: 'Café frío', description: 'Café de la casa con hielo.', price: 45 },
  ] },
  { id: 'sides', name: 'Complementos', items: [{ id: 'fries', name: 'Papas a la francesa', price: 55 }] },
  { id: 'desserts', name: 'Postres', items: [{ id: 'cake', name: 'Pastel de chocolate', price: 65 }] },
  { id: 'empty', name: 'Sin productos', items: [] },
];
const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') { res.end(); return; }
  if (req.method !== 'GET') { res.writeHead(405); res.end('{}'); return; }
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/api/store/info') res.end(JSON.stringify({ id: 'demo', slug: 'demo', name: 'Restaurante de prueba', hasWebStore: true, isOpen: true, primaryColor: '#a73520', currency: 'MXN', currencyLocale: 'es-MX' }));
  else if (path === '/api/store/menu') res.end(JSON.stringify({ categories }));
  else if (path === '/api/store/locations') res.end(JSON.stringify([{ id: 'loc-test', name: 'Terraza', hasTableMap: true }]));
  else res.end('[]');
});
server.listen(4318, '127.0.0.1');
