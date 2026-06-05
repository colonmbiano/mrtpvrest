/**
 * supabaseUpload.ts
 * Helper para subir imágenes al bucket público "menu-images" de Supabase Storage
 * usando la REST API directa (sin SDK).
 *
 * Requiere las siguientes variables públicas:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * El bucket "menu-images" debe existir y tener acceso de lectura público.
 * Si las variables NO están configuradas, se usa fallback al endpoint
 * `/api/upload/image` del backend.
 */
import api from "@/lib/api";

const BUCKET = "menu-images";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const isSupabaseConfigured = (): boolean =>
  Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * Redimensiona/comprime una imagen en el navegador antes de subirla.
 * Las fotos de celular suelen pesar 5–12 MB y el backend (multer) rechaza a
 * los 5 MB. Reescalar a máx. `maxDim` px y reencodear a JPEG deja el archivo
 * muy por debajo del límite y acelera la subida. Si algo falla (formato raro,
 * navegador sin soporte), devuelve el archivo original sin romper el flujo.
 */
export async function compressImage(
  file: File,
  maxDim = 1600,
  quality = 0.85
): Promise<File> {
  if (typeof window === "undefined") return file;
  if (!file.type.startsWith("image/")) return file;
  // Los GIF pueden ser animados; no los tocamos para no perder la animación.
  if (file.type === "image/gif") return file;

  try {
    // `imageOrientation: 'from-image'` respeta la rotación EXIF de las fotos.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));

    // Ya es pequeña en dimensiones y en bytes: no vale la pena recomprimir.
    if (scale === 1 && file.size <= 1_500_000) {
      bitmap.close?.();
      return file;
    }

    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) { bitmap.close?.(); return file; }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (!blob || blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "img";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

function safeFileName(originalName: string): string {
  const ext = originalName.includes(".")
    ? originalName.slice(originalName.lastIndexOf("."))
    : "";
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  const slug = originalName
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "img";
  return `${ts}-${rand}-${slug}${ext.toLowerCase()}`;
}

async function uploadToSupabase(file: File): Promise<string> {
  const path = safeFileName(file.name);
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(path)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "false",
      "Cache-Control": "3600",
    },
    body: file,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase upload ${res.status}: ${text || res.statusText}`);
  }

  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

async function uploadToBackend(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("image", file);
  const { data } = await api.post("/api/upload/image", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  if (!data?.url) throw new Error("Respuesta de upload sin url");
  return data.url;
}

/**
 * Sube una imagen y devuelve la URL pública.
 * Prioriza Supabase Storage si está configurado, con fallback al backend.
 */
export async function uploadMenuImage(file: File): Promise<string> {
  // Comprimir SIEMPRE antes de subir para no chocar con el límite de 5 MB del
  // backend ni dejar imágenes innecesariamente pesadas en el storefront.
  const optimized = await compressImage(file);

  if (isSupabaseConfigured()) {
    try {
      return await uploadToSupabase(optimized);
    } catch (err) {
      console.error("Supabase upload falló, intentando backend:", err);
    }
  }
  return uploadToBackend(optimized);
}
