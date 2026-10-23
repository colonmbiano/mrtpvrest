'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, ArrowRight, Bike, CheckCircle2, ChevronRight, Mail,
  ShieldCheck, ShoppingBag, Store, UserRound,
} from 'lucide-react';
import {
  EMPTY_REGISTRATION_DRAFT, normalizeRegistrationDraft, validateRegistrationDraft,
  type RegistrationDraft, type RegistrationRole,
} from '@/lib/marketplace-registration';

const options = [
  { role: 'negocio', label: 'Soy un negocio', emoji: '🏪', icon: Store,
    eyebrow: 'VENDER EN EL MARKETPLACE', title: 'Lleva tu tienda a más clientes',
    summary: 'Crea tu presencia, publica productos y elige tu forma de reparto.',
    short: 'Vender productos', bg: 'bg-[#fff1e6]', accent: 'text-[#d94d16]', border: 'border-[#fac3a0]' },
  { role: 'cliente', label: 'Soy un cliente', emoji: '🛍️', icon: ShoppingBag,
    eyebrow: 'COMPRAR LOCAL', title: 'Compra en tus negocios favoritos',
    summary: 'Una cuenta para descubrir y comprar en varios comercios.',
    short: 'Comprar en tiendas', bg: 'bg-[#e9f5ed]', accent: 'text-[#18804c]', border: 'border-[#b7dfc4]' },
  { role: 'repartidor', label: 'Soy repartidor', emoji: '🛵', icon: Bike,
    eyebrow: 'GENERAR ENTREGAS', title: 'Recibe pedidos de tu zona',
    summary: 'Trabaja con un comercio o participa en la red compartida.',
    short: 'Realizar entregas', bg: 'bg-[#eef1ff]', accent: 'text-[#5c5cbd]', border: 'border-[#c8c7fa]' },
] as const;

const outline = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d8451]';
const control = 'mt-1.5 block min-h-12 w-full rounded-xl border border-[#dce5df] bg-white px-3.5 py-3 text-base text-[#23362b] shadow-sm outline-none focus:border-[#159055] focus:ring-2 focus:ring-[#d9f4e3]';
const labelStyle = 'block text-sm font-bold text-[#304438]';

function Field({ id, label, value, onChange, error, type = 'text', placeholder, autoComplete, maxLength = 120 }: {
  id: keyof RegistrationDraft; label: string; value: string; onChange: (val: string) => void;
  error?: string; type?: string; placeholder?: string; autoComplete?: string; maxLength?: number;
}) {
  return <div>
    <label htmlFor={'signup-' + id} className={labelStyle}>{label} <span aria-hidden="true" className="text-[#db4d18]">*</span></label>
    <input id={'signup-' + id} name={id} value={value} onChange={event => onChange(event.target.value)}
      type={type} autoComplete={autoComplete} placeholder={placeholder} required maxLength={maxLength}
      inputMode={id === 'phone' ? 'tel' : undefined} aria-invalid={Boolean(error)}
      aria-describedby={error ? 'signup-' + id + '-error' : undefined}
      className={control + (error ? ' !border-red-500' : '')} />
    {error && <p id={'signup-' + id + '-error'} role="alert" className="mt-1 text-xs font-semibold text-red-700">{error}</p>}
  </div>;
}
function Dropdown({ id, label, value, onChange, children, error }: {
  id: keyof RegistrationDraft; label: string; value: string; onChange: (val: string) => void; children: ReactNode; error?: string;
}) {
  return <div>
    <label htmlFor={'signup-' + id} className={labelStyle}>{label}</label>
    <select id={'signup-' + id} name={id} value={value} onChange={e => onChange(e.target.value)}
      aria-invalid={Boolean(error)} className={control}>{children}</select>
    {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
  </div>;
}

export default function MarketplaceRegistration({ selectedRole }: { selectedRole: RegistrationRole | null }) {
  const [draft, setDraft] = useState<RegistrationDraft>(EMPTY_REGISTRATION_DRAFT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reviewed, setReviewed] = useState(false);
  const active = options.find(o => o.role === selectedRole);
  const update = (key: keyof RegistrationDraft, value: string) => {
    setDraft(old => ({ ...old, [key]: value }));
    setErrors(old => { const next = { ...old }; delete next[key]; return next; });
    setReviewed(false);
  };
  const review = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedRole) return;
    const problems = validateRegistrationDraft(selectedRole, draft);
    setErrors(problems);
    if (Object.keys(problems).length) { setReviewed(false); return; }
    setDraft(normalizeRegistrationDraft(draft));
    setReviewed(true);
  };

  return <div className="min-h-[100dvh] bg-[#f8faf8] pb-12 text-[#1c3028]">
    <header className="border-b border-[#e1ebe3] bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link href="/" className={'flex items-center gap-2 rounded-lg font-black tracking-tight text-[#187445] ' + outline}>
          <span className="grid size-10 place-items-center rounded-xl bg-[#e6f4e8] text-xl" aria-hidden="true">🛍️</span>
          <span>MRTPVREST <span className="text-[#f45b27]">Marketplace</span></span>
        </Link>
        <Link href="/" className={'flex items-center gap-1 text-sm font-semibold text-[#546b5c] hover:text-[#e65b27] ' + outline}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver a tiendas
        </Link>
      </div>
    </header>

    <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <div className="mb-8 max-w-3xl">
        <p className="text-xs font-black uppercase tracking-[.17em] text-[#e75c23]">Únete al Marketplace</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">Un lugar para comprar, vender y repartir.</h1>
        <p className="mt-4 text-base leading-relaxed text-[#617567]">
          Estamos diseñando un registro independiente para cada tipo de usuario.
          Selecciona cómo quieres participar y revisa el formulario correspondiente.
        </p>
      </div>

      <div className="mb-7 flex items-start gap-3 rounded-2xl border border-[#f3d79d] bg-[#fff8e9] p-4 text-sm text-[#795322]" role="status">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div><strong>Demostración de registros (fase 1).</strong> Puedes explorar y revisar los datos del formulario, pero todavía
          <strong> no se crean cuentas, no se almacenan datos ni se envía información a servidores.</strong> No ingreses contraseñas ni documentos.
        </div>
      </div>

      <div aria-label="Selecciona un tipo de cuenta" className="grid gap-4 md:grid-cols-3">
        {options.map((o) => {
          const Icon = o.icon;
          const selected = selectedRole === o.role;
          return <Link key={o.role} href={'/registro?tipo=' + o.role + '#formulario'}
            aria-current={selected ? 'step' : undefined}
            className={'group flex min-h-52 flex-col rounded-[1.4rem] border-2 p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md ' +
              (selected ? o.border + ' ' + o.bg : 'border-[#e4ebe5] bg-white hover:border-[#c9dace]') + ' ' + outline}>
            <div className={'flex size-13 h-14 w-14 items-center justify-center rounded-2xl ' + (selected ? 'bg-white' : o.bg)}>
              <Icon className={'h-7 w-7 ' + o.accent} aria-hidden="true" />
            </div>
            <strong className="mt-4 text-lg font-extrabold">{o.label}</strong>
            <p className="mt-1 text-sm leading-relaxed text-[#607166]">{o.summary}</p>
            <span className={'mt-auto flex items-center gap-1 pt-5 text-sm font-extrabold ' + o.accent}>
              {selected ? 'Seleccionado' : 'Elegir este perfil'} <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </Link>;
        })}
      </div>

      <section id="formulario" aria-labelledby="signup-title" className="scroll-mt-5">
        {!active || !selectedRole ? <div className="rounded-2xl border border-dashed border-[#c9dacd] bg-white p-7 text-center">
          <UserRound className="mx-auto h-10 w-10 text-[#4c9268]" aria-hidden="true" />
          <h2 className="mt-3 text-xl font-bold">Elige cómo participar</h2>
          <p className="mt-2 text-sm text-[#68796b]">Selecciona uno de los tres perfiles para ver sus datos de registro.</p>
        </div> : <div className="grid overflow-hidden rounded-3xl border border-[#e0e9e1] bg-white shadow-[0_15px_45px_rgba(22,65,35,.05)] lg:grid-cols-[minmax(0,1fr)_310px]">
          <div className="p-5 sm:p-8">
            <span className={'text-xs font-black tracking-[.13em] ' + active.accent}>{active.eyebrow}</span>
            <h2 id="signup-title" className="mt-2 text-2xl font-extrabold sm:text-3xl">{active.title}</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#67786b]">
              Esta es la información inicial que necesitaremos. La verificación de identidad y la creación de la cuenta vendrán después.
            </p>

            {!reviewed ? <form onSubmit={review} noValidate className="mt-7 space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="name" label={selectedRole === 'negocio' ? 'Nombre comercial' : 'Nombre completo'}
                  value={draft.name} onChange={val => update('name', val)} error={errors.name}
                  placeholder={selectedRole === 'negocio' ? 'Nombre de tu tienda' : 'Tu nombre y apellidos'}
                  autoComplete={selectedRole === 'negocio' ? 'organization' : 'name'} />
                {selectedRole === 'negocio' && <Field id="contact" label="Nombre de la persona responsable"
                  value={draft.contact} onChange={val => update('contact', val)} error={errors.contact}
                  placeholder="Nombre y apellidos" autoComplete="name" />}
                <Field id="email" label="Correo electrónico" type="email" autoComplete="email" maxLength={254}
                  value={draft.email} onChange={val => update('email', val)} error={errors.email} placeholder="correo@ejemplo.mx" />
                <Field id="phone" label="Teléfono de contacto" type="tel" autoComplete="tel" maxLength={20}
                  value={draft.phone} onChange={val => update('phone', val)} error={errors.phone} placeholder="722 123 4567" />
                <Field id="city" label="Ciudad o localidad" autoComplete="address-level2"
                  value={draft.city} onChange={val => update('city', val)} error={errors.city} placeholder="Ej. Colorines, Valle de Bravo" />
                {selectedRole === 'negocio' && <>
                  <Dropdown id="businessType" label="Giro del negocio" value={draft.businessType} onChange={val => update('businessType', val)} error={errors.businessType}>
                    <option value="RESTAURANT">Restaurante y alimentos</option><option value="GROCERY">Supermercado y abarrotes</option>
                    <option value="RETAIL">Tienda y comercio</option><option value="HARDWARE">Ferretería</option>
                    <option value="AUTOPARTS">Autopartes</option>
                  </Dropdown>
                  <Dropdown id="deliveryMode" label="¿Cómo entregarás tus pedidos?" value={draft.deliveryMode} onChange={val => update('deliveryMode', val)} error={errors.deliveryMode}>
                    <option value="BOTH">Repartidores propios y compartidos</option><option value="OWN">Repartidores propios</option>
                    <option value="SHARED">Repartidores de la plataforma</option>
                  </Dropdown>
                </>}
                {selectedRole === 'repartidor' && <>
                  <Dropdown id="vehicle" label="Medio de transporte" value={draft.vehicle} onChange={val => update('vehicle', val)} error={errors.vehicle}>
                    <option value="MOTO">Motocicleta</option><option value="BICYCLE">Bicicleta</option>
                    <option value="CAR">Automóvil</option><option value="WALK">A pie</option>
                  </Dropdown>
                  <Dropdown id="network" label="Modalidad de reparto" value={draft.network} onChange={val => update('network', val)} error={errors.network}>
                    <option value="SHARED">Red compartida</option><option value="OWN">Repartidor de un negocio</option>
                    <option value="BOTH">Ambas modalidades</option>
                  </Dropdown>
                </>}
              </div>
              <p className="text-xs leading-relaxed text-[#697b6d]">
                Por seguridad, esta demostración no solicita contraseñas, fotografías de identificaciones ni información bancaria.
              </p>
              <button type="submit" className={'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#f15a24] px-5 py-3 font-extrabold text-white hover:bg-[#d34d1d] sm:w-auto ' + outline}>
                Revisar mi información <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
              {Object.keys(errors).length > 0 && <p className="text-sm font-semibold text-red-700" role="status">Corrige los campos marcados para continuar.</p>}
            </form> : <div className="mt-7 rounded-2xl border border-[#b7dfc4] bg-[#f0faf2] p-5">
              <CheckCircle2 className="h-9 w-9 text-[#14824a]" aria-hidden="true" />
              <h3 className="mt-2 text-xl font-extrabold">Información revisada</h3>
              <p className="mt-1 text-sm leading-relaxed text-[#436e50]">
                Así se verá la revisión del registro. <strong>La solicitud no fue enviada y no existe ninguna cuenta creada.</strong>
              </p>
              <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                <dt className="font-semibold">Perfil</dt><dd>{active.label}</dd>
                <dt className="font-semibold">Nombre</dt><dd className="break-all">{draft.name}</dd>
                {selectedRole === 'negocio' && <><dt className="font-semibold">Responsable</dt><dd>{draft.contact}</dd></>}
                <dt className="font-semibold">Correo</dt><dd className="break-all">{draft.email}</dd>
                <dt className="font-semibold">Teléfono</dt><dd>{draft.phone}</dd>
                <dt className="font-semibold">Localidad</dt><dd>{draft.city}</dd>
              </dl>
              <button type="button" onClick={() => setReviewed(false)} className={'mt-5 rounded-xl border border-[#b0d7bf] bg-white px-4 py-3 text-sm font-bold text-[#176c42] ' + outline}>Editar información</button>
            </div>}
          </div>
          <aside className="border-t border-[#e2ece5] bg-[#f5f9f5] p-5 sm:p-7 lg:border-l lg:border-t-0">
            <h3 className="text-lg font-extrabold">Próximas etapas</h3>
            <ol className="mt-5 space-y-5 text-sm">
              <li className="flex gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#ddf3e5] font-black text-[#168249]">1</span><span><strong className="block">Formulario inicial</strong>Elegir tu perfil y revisar información.</span></li>
              <li className="flex gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white font-black text-[#7e9182]">2</span><span><strong className="block">Cuenta y verificación</strong>Correo, acceso seguro y validación.</span></li>
              <li className="flex gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white font-black text-[#7e9182]">3</span><span><strong className="block">Activación</strong>{selectedRole === 'negocio' ? 'Aprobar tienda y publicar catálogo.' : selectedRole === 'cliente' ? 'Guardar direcciones y empezar a comprar.' : 'Validar documentación y habilitar entregas.'}</span></li>
            </ol>
            <div className="mt-7 flex gap-2 rounded-xl bg-white p-3 text-xs text-[#597363]">
              <Mail className="h-5 w-5 shrink-0" aria-hidden="true" /> La confirmación por correo y la recuperación de contraseña se implementarán al conectar las cuentas reales.
            </div>
          </aside>
        </div>}
      </section>
    </main>
  </div>;
}
