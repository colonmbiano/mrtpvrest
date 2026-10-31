'use client';
// La portada llega por streaming (app/loading.tsx): cuando el navegador intenta
// saltar al #fragmento, la sección todavía está oculta tras el fallback y el
// salto se pierde. Al montar, repite el salto una vez que el contenido existe.
import { useEffect } from 'react';

export default function ScrollToHash() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);
  return null;
}
