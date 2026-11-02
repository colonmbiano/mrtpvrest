'use client';

// "Mi cuenta": datos del comprador, sus tiendas favoritas y su libreta de
// direcciones (API v1, con el token de comprador). Las direcciones se agregan al
// pedir a domicilio, donde está el mapa; las favoritas, desde cada tienda.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Heart, LogOut, MapPin, ShoppingBag, UserRound } from 'lucide-react';
import { getMarketplaceApiUrl } from '@/lib/config';
import { fetchCurrentAccount, getBuyerToken, logout, type MarketplaceAccount } from '@/lib/marketplaceAccount';
import { listFavorites, setFavorite, type FavoriteStore } from '@/lib/marketplaceFavorites';
import { deleteAddress, listAddresses, type V1Address } from '@/lib/marketplaceV1Checkout';
import { AccountShell, Notice, outline, secondaryButton, textLink } from './AccountUi';

type Addresses = { state: 'loading' } | { state: 'ready'; list: V1Address[] } | { state: 'error'; message: string };
type Favorites = { state: 'loading' } | { state: 'ready'; list: FavoriteStore[] } | { state: 'error'; message: string };

export default function AccountHome() {
  const router = useRouter();
  const apiUrl = getMarketplaceApiUrl();
  const [account, setAccount] = useState<MarketplaceAccount | null>(null);
  const [loadError, setLoadError] = useState('');
  const [addresses, setAddresses] = useState<Addresses>({ state: 'loading' });
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState('');
  const [favorites, setFavorites] = useState<Favorites>({ state: 'loading' });
  const [unfavoriting, setUnfavoriting] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const load = useCallback(async () => {
    setLoadError('');
    const current = await fetchCurrentAccount();
    if (current === null) { router.replace('/cuenta/entrar?next=/cuenta'); return; }
    if ('ok' in current) { setLoadError(current.message); return; }
    setAccount(current);
    // Sin token de comprador la libreta sería la del invitado de este navegador.
    if (!await getBuyerToken()) {
      const message = 'No pudimos abrir tus datos. Recarga la página.';
      setAddresses({ state: 'error', message }); setFavorites({ state: 'error', message });
      return;
    }
    const [result, favs] = await Promise.all([listAddresses(apiUrl), listFavorites({ apiUrl })]);
    setAddresses(Array.isArray(result) ? { state: 'ready', list: result } : { state: 'error', message: result.message });
    setFavorites(Array.isArray(favs) ? { state: 'ready', list: favs } : { state: 'error', message: favs.message });
  }, [apiUrl, router]);

  const unfavorite = async (slug: string) => {
    setUnfavoriting(slug);
    const result = await setFavorite(slug, false, { apiUrl });
    setUnfavoriting(null);
    if (result === true) setFavorites(old => old.state === 'ready' ? { state: 'ready', list: old.list.filter(f => f.slug !== slug) } : old);
    else setFavorites({ state: 'error', message: result.message });
  };

  useEffect(() => { load(); }, [load]);

  const remove = async (id: string) => {
    setRemoving(id); setRemoveError('');
    const result = await deleteAddress(apiUrl, id);
    setRemoving(null);
    if (result === true) setAddresses(old => old.state === 'ready' ? { state: 'ready', list: old.list.filter(a => a.id !== id) } : old);
    else setRemoveError(result.message);
  };

  const signOut = async () => {
    setLeaving(true);
    await logout();
    router.replace('/');
    router.refresh();
  };

  if (loadError) {
    return <AccountShell title="Mi cuenta">
      <Notice tone="error">{loadError}</Notice>
      <button type="button" onClick={load} className={secondaryButton + ' mt-4'}>Reintentar</button>
    </AccountShell>;
  }
  if (!account) return <AccountShell title="Mi cuenta"><p role="status" className="text-sm text-[#617567]">Cargando tu cuenta…</p></AccountShell>;

  return <AccountShell title="Mi cuenta">
    <section aria-labelledby="account-data" className="flex items-start gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#e6f4e8]"><UserRound className="h-6 w-6 text-[#187445]" aria-hidden="true" /></span>
      <div className="min-w-0">
        <h2 id="account-data" className="truncate text-lg font-extrabold">{account.name || 'Cliente'}</h2>
        <p className="break-all text-sm text-[#617567]">{account.email}</p>
      </div>
    </section>

    <Link href="/cuenta/pedidos" className={'mt-6 flex items-center justify-between gap-3 rounded-2xl border border-[#e4ebe5] px-4 py-3.5 hover:bg-[#f5f9f5] ' + outline}>
      <span className="flex items-center gap-2 text-base font-extrabold text-[#23362b]"><ShoppingBag className="h-5 w-5 text-[#e65b27]" aria-hidden="true" /> Mis pedidos</span>
      <ChevronRight className="h-5 w-5 text-[#7e9182]" aria-hidden="true" />
    </Link>

    <section aria-labelledby="account-favorites" className="mt-7">
      <h2 id="account-favorites" className="flex items-center gap-2 text-base font-extrabold"><Heart className="h-5 w-5 text-[#e65b27]" aria-hidden="true" /> Mis tiendas favoritas</h2>
      {favorites.state === 'loading' && <p role="status" className="mt-3 text-sm text-[#617567]">Cargando favoritas…</p>}
      {favorites.state === 'error' && <div className="mt-3"><Notice tone="error">{favorites.message}</Notice></div>}
      {favorites.state === 'ready' && favorites.list.length === 0 && <p className="mt-3 text-sm leading-relaxed text-[#617567]">
        Aún no tienes favoritas. Toca «Guardar» en cualquier tienda para tenerla a la mano.
      </p>}
      {favorites.state === 'ready' && favorites.list.length > 0 && <ul className="mt-3 space-y-2">
        {favorites.list.map(f => <li key={f.slug} className="flex items-center gap-2 rounded-2xl border border-[#e4ebe5] px-4 py-3">
          <Link href={`/${encodeURIComponent(f.slug)}`} className={'min-w-0 flex-1 truncate text-sm font-bold text-[#23362b] hover:text-[#e65b27] ' + outline}>
            {f.name}
          </Link>
          <span className={'shrink-0 text-xs font-semibold ' + (f.open ? 'text-[#18804c]' : 'text-[#7e9182]')}>{f.open ? 'Abierta' : 'Cerrada'}</span>
          <button type="button" onClick={() => unfavorite(f.slug)} disabled={unfavoriting === f.slug} aria-label={`Quitar ${f.name} de favoritas`}
            className="shrink-0 rounded-xl px-3 py-2 text-xs font-bold text-[#7e9182] hover:bg-[#f0f5f1] hover:text-[#304438] disabled:opacity-50">
            {unfavoriting === f.slug ? 'Quitando…' : 'Quitar'}
          </button>
        </li>)}
      </ul>}
    </section>

    <section aria-labelledby="account-addresses" className="mt-7">
      <h2 id="account-addresses" className="flex items-center gap-2 text-base font-extrabold"><MapPin className="h-5 w-5 text-[#e65b27]" aria-hidden="true" /> Mis direcciones</h2>
      {addresses.state === 'loading' && <p role="status" className="mt-3 text-sm text-[#617567]">Cargando direcciones…</p>}
      {addresses.state === 'error' && <div className="mt-3"><Notice tone="error">{addresses.message}</Notice></div>}
      {addresses.state === 'ready' && addresses.list.length === 0 && <p className="mt-3 text-sm leading-relaxed text-[#617567]">
        Aún no tienes direcciones. Se guardan solas cuando pides a domicilio en cualquier tienda.
      </p>}
      {addresses.state === 'ready' && addresses.list.length > 0 && <ul className="mt-3 space-y-2">
        {addresses.list.map(a => <li key={a.id} className="flex items-center gap-2 rounded-2xl border border-[#e4ebe5] px-4 py-3">
          <span className="min-w-0 flex-1 break-words text-sm font-semibold text-[#304438]">{a.address}</span>
          <button type="button" onClick={() => remove(a.id)} disabled={removing === a.id} aria-label={`Quitar ${a.address}`}
            className="shrink-0 rounded-xl px-3 py-2 text-xs font-bold text-[#7e9182] hover:bg-[#f0f5f1] hover:text-[#304438] disabled:opacity-50">
            {removing === a.id ? 'Quitando…' : 'Quitar'}
          </button>
        </li>)}
      </ul>}
      {removeError && <div className="mt-3"><Notice tone="error">{removeError}</Notice></div>}
    </section>

    <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[#e8efe9] pt-5">
      <Link href="/" className={textLink + ' text-sm'}>Ir a las tiendas</Link>
      <button type="button" onClick={signOut} disabled={leaving} className={secondaryButton + ' gap-2'}>
        <LogOut className="h-4 w-4" aria-hidden="true" /> {leaving ? 'Saliendo…' : 'Cerrar sesión'}
      </button>
    </div>
  </AccountShell>;
}
