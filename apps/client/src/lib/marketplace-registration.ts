// Fase 1: modelo público de formularios. Los datos no se envían ni persisten.
export const REGISTRATION_ROLES = ['negocio', 'cliente', 'repartidor'] as const;
export type RegistrationRole = typeof REGISTRATION_ROLES[number];

export type RegistrationDraft = {
  name: string;
  contact: string;
  email: string;
  phone: string;
  city: string;
  businessType: string;
  deliveryMode: string;
  vehicle: string;
  network: string;
};

export const EMPTY_REGISTRATION_DRAFT: RegistrationDraft = {
  name: '', contact: '', email: '', phone: '', city: '',
  businessType: 'RESTAURANT', deliveryMode: 'BOTH', vehicle: 'MOTO', network: 'SHARED',
};

export function parseRegistrationRole(value: unknown): RegistrationRole | null {
  return typeof value === 'string' && (REGISTRATION_ROLES as readonly string[]).includes(value)
    ? value as RegistrationRole : null;
}

export function normalizeRegistrationDraft(draft: RegistrationDraft): RegistrationDraft {
  return {
    ...draft,
    name: draft.name.trim().replace(/\s+/g, ' '),
    contact: draft.contact.trim().replace(/\s+/g, ' '),
    city: draft.city.trim().replace(/\s+/g, ' '),
    email: draft.email.trim().toLowerCase(),
    phone: draft.phone.replace(/[\s()-]/g, ''),
  };
}

export function validateRegistrationDraft(role: RegistrationRole, original: RegistrationDraft): Record<string, string> {
  const form = normalizeRegistrationDraft(original);
  const errors: Record<string, string> = {};
  const personName = role === 'negocio' ? form.contact : form.name;
  if (personName.length < 2 || personName.length > 100) errors[role === 'negocio' ? 'contact' : 'name'] = 'Escribe un nombre de 2 a 100 caracteres.';
  if (role === 'negocio' && (form.name.length < 2 || form.name.length > 120)) {
    errors.name = 'Escribe el nombre del negocio (2 a 120 caracteres).';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) || form.email.length > 254) {
    errors.email = 'Ingresa un correo electrónico válido.';
  }
  // México: validación inicial de 10 dígitos locales, acepta +52 como prefijo opcional.
  if (!/^(?:\+52)?[0-9]{10}$/.test(form.phone)) errors.phone = 'Usa un teléfono de México de 10 dígitos.';
  if (form.city.length < 2 || form.city.length > 100) errors.city = 'Indica una localidad de 2 a 100 caracteres.';
  if (role === 'negocio' && !['RESTAURANT','GROCERY','RETAIL','HARDWARE','AUTOPARTS'].includes(form.businessType)) {
    errors.businessType = 'Selecciona un giro válido.';
  }
  if (role === 'negocio' && !['OWN','SHARED','BOTH'].includes(form.deliveryMode)) {
    errors.deliveryMode = 'Selecciona un tipo de reparto.';
  }
  if (role === 'repartidor' && !['MOTO','BICYCLE','CAR','WALK'].includes(form.vehicle)) {
    errors.vehicle = 'Selecciona un vehículo válido.';
  }
  if (role === 'repartidor' && !['OWN','SHARED','BOTH'].includes(form.network)) {
    errors.network = 'Selecciona tu modalidad de reparto.';
  }
  return errors;
}
