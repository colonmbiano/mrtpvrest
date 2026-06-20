// Optimización de imágenes de Cloudinary en el render (sin re-subir).
// El backend entrega el secure_url sin `f_auto`; insertamos transformaciones de
// entrega para servir WebP/AVIF y el tamaño adecuado. URLs no-Cloudinary (o
// nulas) se devuelven intactas. Espejo del helper de apps/client.

type CldOpts = {
  /** Ancho objetivo en px (el asset original es ≤ 800/1280). */
  width?: number;
  /** Relación de aspecto, ej. "16:9". Requiere crop 'fill'/'pad'. */
  ar?: string;
  /** 'limit' (default): escala sin recortar ni ampliar. 'fill': recorta exacto. */
  crop?: 'limit' | 'fill' | 'fit';
};

const UPLOAD_MARKER = '/image/upload/';

export function cldImage(url: string | null | undefined, { width = 800, ar, crop = 'limit' }: CldOpts = {}): string | undefined {
  if (!url || !url.includes(UPLOAD_MARKER)) return url ?? undefined;
  if (url.includes('/f_auto')) return url;
  const w = Math.min(Math.round(width), 1280);
  const parts = ['f_auto', 'q_auto', `c_${crop}`, `w_${w}`];
  if (ar) parts.push(`ar_${ar}`);
  return url.replace(UPLOAD_MARKER, `${UPLOAD_MARKER}${parts.join(',')}/`);
}
