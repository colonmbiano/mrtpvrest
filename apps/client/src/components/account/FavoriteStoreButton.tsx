'use client';

// Corazón de "tienda favorita" en la barra del marketplace de cada tienda. Sin sesión,
// lleva a entrar y vuelve a esta tienda. Con sesión, consulta si ya es favorita.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Heart } from 'lucide-react';
import { getMarketplaceApiUrl } from '@/lib/config';
import { getBuyerToken } from '@/lib/marketplaceAccount';
import { listFavorites, setFavorite } from '@/lib/marketplaceFavorites';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9a3412]';

export default function FavoriteStoreButton({ slug, name }: { slug: string; name: string }) {
  const router = useRouter();
  const apiUrl = getMarketplaceApiUrl();
  // null = aún no se sabe (o sin sesión).
  const [favorite, setFavoriteState] = useState<boolean | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let stopped = false;
    (async () => {
      if (!await getBuyerToken({ apiUrl })) return;
      const list = await listFavorites({ apiUrl });
      if (stopped) return;
      setSignedIn(true);
      if (Array.isArray(list)) setFavoriteState(list.some(f => f.slug === slug));
    })();
    return () => { stopped = true; };
  }, [apiUrl, slug]);

  const toggle = async () => {
    if (!signedIn) { router.push(`/cuenta/entrar?next=${encodeURIComponent('/' + slug)}`); return; }
    const next = !favorite;
    setSaving(true); setError('');
    const result = await setFavorite(slug, next, { apiUrl });
    setSaving(false);
    if (result === true) setFavoriteState(next);
    else setError(result.message);
  };

  const on = favorite === true;
  return <span className="inline-flex shrink-0 items-center gap-2">
    <button type="button" onClick={toggle} disabled={saving} aria-pressed={signedIn ? on : undefined}
      aria-label={on ? `Quitar ${name} de favoritas` : `Guardar ${name} en favoritas`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-bold disabled:opacity-60 ${
        on ? 'border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]' : 'border-[#e7e2dc] hover:border-[#9a3412] hover:text-[#9a3412]'} ${FOCUS}`}>
      <Heart aria-hidden="true" className={`h-4 w-4 ${on ? 'fill-current' : ''}`} />
      {on ? 'Favorita' : 'Guardar'}
    </button>
    {error && <span role="alert" className="text-xs font-semibold text-red-700">{error}</span>}
  </span>;
}
