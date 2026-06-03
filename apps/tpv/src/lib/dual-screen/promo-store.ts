/**
 * promo-store.ts
 * Almacén de imágenes de promociones en IndexedDB (los blobs no caben en
 * localStorage). localStorage solo guarda los metadatos/ids; aquí viven los
 * Blob reales (tanto promos locales como el cache de promos remotas para
 * funcionamiento offline).
 */

const DB_NAME = "mrtpvrest-dual-screen";
const STORE_NAME = "promo-images";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB no disponible"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function savePromoImage(id: string, blob: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(blob, id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function getPromoImage(id: string): Promise<Blob | null> {
  let db: IDBDatabase;
  try {
    db = await openDB();
  } catch {
    return null;
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => {
      db.close();
      resolve((req.result as Blob) ?? null);
    };
    req.onerror = () => {
      db.close();
      resolve(null);
    };
  });
}

export async function deletePromoImage(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/**
 * Comprime una imagen a WebP con ancho máximo `maxWidth` usando
 * createImageBitmap + canvas. Devuelve el Blob optimizado (o el archivo
 * original si el navegador no soporta la conversión).
 */
export async function fileToOptimizedBlob(
  file: File | Blob,
  maxWidth = 1920,
  quality = 0.85
): Promise<Blob> {
  if (typeof createImageBitmap === "undefined" || typeof document === "undefined") {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1;
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/webp", quality)
    );
    return blob ?? file;
  } catch {
    return file;
  }
}
