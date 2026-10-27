import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { marketplaceNetworkEnabled } from '../src/lib/marketplaceNetwork.ts';

test('la red nace apagada y solo se activa con el valor público exacto true', () => {
  for (const value of [undefined, null, '', 'false', 'TRUE', '1', true, 1]) {
    assert.equal(marketplaceNetworkEnabled(value), false);
  }
  assert.equal(marketplaceNetworkEnabled('true'), true);
});

// Render real de HomeScreen: el módulo de ofertas se sustituye para evitar red.
const require = createRequire(new URL('../package.json', import.meta.url));
const ts = require('typescript');
const { renderToStaticMarkup } = require('react-dom/server');
const React = require('react');
const source = readFileSync(new URL('../src/components/delivery/screens/HomeScreen.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', compiled)(id => {
  if (id === '@/lib/tokens') return { C: {}, S: {}, ORDER_STATUS_CONFIG: {} };
  if (id === '@/lib/marketplaceNetwork') return { marketplaceNetworkEnabled };
  if (id === '../MarketplaceOffers') return { MarketplaceOffers: () => React.createElement('div', null, 'OFERTAS_DE_RED') };
  return require(id);
}, module, module.exports);

function render(flag) {
  const previous = process.env.NEXT_PUBLIC_MARKETPLACE_NETWORK_ENABLED;
  try {
    if (flag === undefined) delete process.env.NEXT_PUBLIC_MARKETPLACE_NETWORK_ENABLED;
    else process.env.NEXT_PUBLIC_MARKETPLACE_NETWORK_ENABLED = flag;
    return renderToStaticMarkup(React.createElement(module.exports.HomeScreen, {
      driver: { id: 'd1', name: 'Repartidor' }, orders: [], isOnline: true,
      isSharedCourier: true, onSelectOrder() {}, onChat() {}, onDeliverOrder() {}, onNavigate() {},
    }));
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_MARKETPLACE_NETWORK_ENABLED;
    else process.env.NEXT_PUBLIC_MARKETPLACE_NETWORK_ENABLED = previous;
  }
}

test('sin bandera no se dibuja la pestaña de red ni se monta el módulo de ofertas', () => {
  const html = render(undefined);
  assert.match(html, /Mi Tienda/);
  assert.doesNotMatch(html, /Red Marketplace|OFERTAS_DE_RED/);
});

test('bandera explícita habilita la pestaña manteniendo la tienda como vista inicial', () => {
  const html = render('true');
  assert.match(html, /Mi Tienda/);
  assert.match(html, /Red Marketplace/);
  assert.doesNotMatch(html, /OFERTAS_DE_RED/);
});

test('false explícito oculta la pestaña aunque el estado compartido del dispositivo sea true', () => {
  assert.doesNotMatch(render('false'), /Red Marketplace|OFERTAS_DE_RED/);
});
