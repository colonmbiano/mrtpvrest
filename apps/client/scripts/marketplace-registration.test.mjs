// Comprobación de contratos de registro, sin backend, credenciales ni red.
// node --test apps/client/scripts/marketplace-registration.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_REGISTRATION_DRAFT as empty,
  parseRegistrationRole,
  validateRegistrationDraft,
  normalizeRegistrationDraft,
} from '../src/lib/marketplace-registration.ts';

const base = { ...empty, name: 'María López', contact: 'Alex Perez',
  email: 'marialopez@correo.mx', phone: '722 123 4567',
  city: 'Colorines, Valle de Bravo' };

test('solo tres roles públicos y nunca permisos por texto arbitrario', () => {
  for (const role of ['negocio','cliente','repartidor']) assert.equal(parseRegistrationRole(role), role);
  for (const role of ['admin','super_admin','',null,{},['negocio'],'NEGOCIO']) {
    assert.equal(parseRegistrationRole(role), null);
  }
});

test('tres perfiles válidos con los campos correspondientes', () => {
  for (const role of ['negocio','cliente','repartidor']) {
    assert.deepEqual(validateRegistrationDraft(role, base), {}, role);
  }
});

test('validación de teléfono de México, correo y localidad', () => {
  for (const phone of ['abc','123','5521234567x', '+15521234567']) {
    assert.ok(validateRegistrationDraft('cliente', { ...base, phone }).phone, phone);
  }
  assert.deepEqual(validateRegistrationDraft('cliente', { ...base, phone: '+527221234567' }), {});
  assert.deepEqual(validateRegistrationDraft('cliente', { ...base, phone: '+52 722 123 4567' }), {});
  assert.ok(validateRegistrationDraft('cliente', { ...base, email: 'mal@' }).email);
  assert.ok(validateRegistrationDraft('cliente', { ...base, city: '' }).city);
  assert.ok(validateRegistrationDraft('cliente', { ...base, name: ' ' }).name);
});

test('negocios requieren responsable y un giro válido', () => {
  assert.ok(validateRegistrationDraft('negocio', { ...base, contact: '' }).contact);
  assert.ok(validateRegistrationDraft('negocio', { ...base, businessType: 'UNKNOWN' }).businessType);
  assert.ok(validateRegistrationDraft('negocio', { ...base, deliveryMode: 'NONE' }).deliveryMode);
  assert.deepEqual(validateRegistrationDraft('cliente', { ...base, contact: '', businessType: 'UNKNOWN' }), {});
});

test('repartidores requieren una modalidad y un medio de transporte válidos', () => {
  assert.ok(validateRegistrationDraft('repartidor', { ...base, vehicle: 'PLANE' }).vehicle);
  assert.ok(validateRegistrationDraft('repartidor', { ...base, network: 'ADMIN' }).network);
  assert.deepEqual(validateRegistrationDraft('negocio', { ...base, vehicle: 'PLANE', network: 'ADMIN' }), {});
});

test('normaliza sin mutar el formulario original', () => {
  const dirty = { ...base, name: '  María   López  ', contact: ' Alex  Perez ', email: '  MARIA@CORREO.MX  ', phone: '722-123-4567' };
  const clean = normalizeRegistrationDraft(dirty);
  assert.equal(clean.name, 'María López');
  assert.equal(clean.contact, 'Alex Perez');
  assert.equal(clean.email, 'maria@correo.mx');
  assert.equal(clean.phone, '7221234567');
  assert.equal(dirty.name, '  María   López  ');
});
