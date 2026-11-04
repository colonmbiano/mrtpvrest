'use client';

// Botón de la página sin conexión: recarga la página que se intentó abrir (el
// service worker sirve /_offline en su lugar, con la misma URL).
export default function OfflineRetry() {
  return <button type="button" onClick={() => window.location.reload()}
    className="mt-2 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#f15a24] px-5 py-2.5 text-sm font-extrabold text-white hover:bg-[#d34d1d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d8451]">
    Reintentar
  </button>;
}
