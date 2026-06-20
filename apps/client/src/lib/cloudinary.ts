// Optimización de imágenes de Cloudinary en el render (sin re-subir).
//
// El backend sube a Cloudinary con un transform 800x800 q_auto, pero entrega el
// secure_url SIN `f_auto`, así que los navegadores reciben JPG/PNG en vez de
// WebP/AVIF. Insertamos transformaciones de entrega en la URL para servir el
// formato moderno y el tamaño adecuado. URLs que no son de Cloudinary se
// devuelven intactas.

type CldOpts = {
  /** Ancho objetivo en px. El asset original es 800px, no tiene sentido pedir más. */
  width?: number;
  /** Relación de aspecto, ej. "16:9". Si se omite, conserva la del asset. */
  ar?: string;
};

const UPLOAD_MARKER = '/image/upload/';

export function cldImage(url: string, { width = 800, ar }: CldOpts = {}): string {
  if (!url || !url.includes(UPLOAD_MARKER)) return url;
  // Evita doble transformación si la URL ya trae f_auto.
  if (url.includes('/f_auto')) return url;
  const w = Math.min(Math.round(width), 800);
  const parts = ['f_auto', 'q_auto', 'c_fill', `w_${w}`];
  if (ar) parts.push(`ar_${ar}`);
  return url.replace(UPLOAD_MARKER, `${UPLOAD_MARKER}${parts.join(',')}/`);
}

// srcset responsive para una imagen de Cloudinary (cap a 800 = tamaño del asset).
export function cldSrcSet(url: string, widths: number[] = [420, 640, 800], ar?: string): string | undefined {
  if (!url || !url.includes(UPLOAD_MARKER)) return undefined;
  const uniq = Array.from(new Set(widths.map((w) => Math.min(w, 800)))).sort((a, b) => a - b);
  return uniq.map((w) => `${cldImage(url, { width: w, ar })} ${w}w`).join(', ');
}
