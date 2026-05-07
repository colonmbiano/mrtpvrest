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
  if (isSupabaseConfigured()) {
    try {
      return await uploadToSupabase(file);
    } catch (err) {
      console.error("Supabase upload falló, intentando backend:", err);
    }
  }
  return uploadToBackend(file);
}
