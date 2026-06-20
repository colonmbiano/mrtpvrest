'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cldImage, cldSrcSet } from '@/lib/cloudinary';

export type Banner = {
  id: string;
  imageUrl: string;
  title?: string;
  description?: string;
  linkType?: string;
  linkValue?: string;
};

type BannerCarouselProps = {
  banners: Banner[];
  variant?: 'light' | 'dark';
  accent?: string;
  className?: string;
  /** Milisegundos entre slides en autoplay. 0 = sin autoplay. */
  interval?: number;
};

// Tiempo de pausa tras una interacción del usuario antes de reanudar el autoplay.
const RESUME_DELAY = 6000;

// Carrusel horizontal de banners de promoción. Scroll con snap; muestra todos
// los banners vigentes (no solo el primero). Banners con linkType=URL son
// clicables. Reutilizado por todos los temas del storefront.
//
// Autoplay: con 2+ banners avanza solo cada `interval` ms con scroll suave,
// se pausa al tocar/hover/enfocar y reanuda tras RESUME_DELAY. Respeta
// prefers-reduced-motion (sin autoplay ni scroll animado). Incluye control
// accesible de pausa/play (WCAG 2.2.2), dots con área táctil ≥44px,
// barra de progreso y semántica de carrusel.
export default function BannerCarousel({ banners, variant = 'light', accent = '#ff5c35', className = '', interval = 5000 }: BannerCarouselProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  // Marca de tiempo hasta la que el autoplay queda pausado por interacción.
  const pausedUntil = useRef(0);
  const [reduced, setReduced] = useState(false);

  const single = !banners || banners.length === 1;
  const autoplay = !single && interval > 0 && !reduced && !paused;
  const isDark = variant === 'dark';

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const slideEls = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return [] as HTMLElement[];
    return Array.from(el.querySelectorAll<HTMLElement>('[data-slide]'));
  }, []);

  const scrollToIndex = useCallback((index: number) => {
    const el = scrollRef.current;
    const slides = slideEls();
    if (!el || !slides.length) return;
    // offsetLeft es relativo al contenedor (position:relative); restamos el del
    // primer slide para anular el padding lateral y alinear al snap-start.
    const base = slides[0].offsetLeft;
    const target = slides[(index + slides.length) % slides.length];
    if (target) el.scrollTo({ left: target.offsetLeft - base, behavior: reduced ? 'auto' : 'smooth' });
  }, [slideEls, reduced]);

  // Mantener `active` en sync con el scroll manual.
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    const slides = slideEls();
    if (!el || !slides.length) return;
    const base = slides[0].offsetLeft;
    let nearest = 0;
    let min = Infinity;
    slides.forEach((s, i) => {
      const d = Math.abs((s.offsetLeft - base) - el.scrollLeft);
      if (d < min) { min = d; nearest = i; }
    });
    setActive(nearest);
  }, [slideEls]);

  // Autoplay + barra de progreso. Avanza cuando el progreso completa el ciclo.
  useEffect(() => {
    if (!autoplay) { setProgress(0); return; }
    const step = 50;
    const id = window.setInterval(() => {
      if (Date.now() < pausedUntil.current || document.hidden) return;
      setProgress((p) => {
        const np = p + (step / interval) * 100;
        if (np >= 100) {
          setActive((prev) => { const next = (prev + 1) % banners.length; scrollToIndex(next); return next; });
          return 0;
        }
        return np;
      });
    }, step);
    return () => window.clearInterval(id);
  }, [autoplay, interval, banners.length, scrollToIndex]);

  // Reinicia el progreso cuando cambia el slide activo (p.ej. al tocar un dot).
  useEffect(() => { setProgress(0); }, [active]);

  const nudge = useCallback(() => { pausedUntil.current = Date.now() + RESUME_DELAY; setProgress(0); }, []);

  if (single && (!banners || banners.length === 0)) return null;

  const overlay = isDark
    ? 'linear-gradient(to top, #0C0C0EE6, transparent)'
    : 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)';
  const focusRing = isDark ? '#FFFFFF' : '#000000';

  return (
    <div
      className="relative"
      role={single ? undefined : 'region'}
      aria-roledescription={single ? undefined : 'carrusel'}
      aria-label={single ? undefined : 'Promociones'}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        .bc-scroll::-webkit-scrollbar{display:none}.bc-scroll{-ms-overflow-style:none;scrollbar-width:none}
        .bc-slide:focus-visible{outline:2px solid ${focusRing};outline-offset:2px}
        .bc-dot:focus-visible{outline:2px solid ${focusRing};outline-offset:2px;border-radius:9999px}
        @keyframes bcPing{75%,100%{transform:scale(1.6);opacity:0}}
      ` }} />
      <div
        ref={scrollRef}
        onScroll={onScroll}
        onPointerDown={nudge}
        onMouseEnter={nudge}
        onTouchStart={nudge}
        className={`bc-scroll relative flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-1 px-1 ${className}`}
      >
        {banners.map((b, idx) => {
          const clickable = b.linkType === 'URL' && !!b.linkValue;
          const Wrapper: any = clickable ? 'a' : 'div';
          const wrapperProps = clickable
            ? { href: b.linkValue, target: '_blank', rel: 'noopener noreferrer' }
            : {};
          const alt = b.title || b.description || 'Promoción';
          return (
            <Wrapper
              key={b.id}
              data-slide
              {...wrapperProps}
              aria-roledescription={single ? undefined : 'slide'}
              aria-label={single ? undefined : `${idx + 1} de ${banners.length}`}
              className={`bc-slide relative snap-start shrink-0 ${single ? 'w-full' : 'w-[88%] sm:w-[420px]'} h-[180px] md:h-[240px] rounded-[24px] overflow-hidden block ${clickable ? 'cursor-pointer' : ''}`}
              style={{ border: isDark ? '1px solid #FFFFFF14' : '1px solid rgba(0,0,0,0.06)', background: isDark ? '#15151A' : '#EDEDF0' }}
            >
              <img
                src={cldImage(b.imageUrl, { width: single ? 800 : 640, ar: '16:9', crop: 'fill' })}
                srcSet={cldSrcSet(b.imageUrl, single ? [640, 800] : [420, 640, 800], '16:9', 'fill')}
                sizes={single ? '(min-width: 768px) 700px, 100vw' : '(min-width: 640px) 420px, 88vw'}
                alt={alt}
                loading={idx === 0 ? 'eager' : 'lazy'}
                decoding="async"
                className="w-full h-full object-cover"
              />
              {(b.title || b.description) && (
                <div className="absolute inset-0 flex flex-col justify-end p-5" style={{ background: overlay }}>
                  {b.title && (
                    <h3 className="text-white font-bold text-xl md:text-2xl leading-tight" style={{ fontFamily: 'Syne, sans-serif' }}>{b.title}</h3>
                  )}
                  {b.description && (
                    <p className="text-white/80 text-xs md:text-sm mt-1 line-clamp-2">{b.description}</p>
                  )}
                </div>
              )}
              {b.linkType && b.linkType !== 'NONE' && (
                <span className="absolute top-3 left-3 text-[9px] font-bold px-2 py-1 rounded-full text-black" style={{ background: accent }}>PROMO</span>
              )}
            </Wrapper>
          );
        })}
      </div>

      {!single && (
        <div className="flex items-center justify-center gap-2 mt-3">
          {/* Botón de pausa/play accesible (WCAG 2.2.2). */}
          {interval > 0 && !reduced && (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? 'Reanudar promociones' : 'Pausar promociones'}
              aria-pressed={paused}
              className="bc-dot grid place-items-center shrink-0"
              style={{ width: 44, height: 44, color: isDark ? '#FFFFFFB3' : 'rgba(0,0,0,0.55)' }}
            >
              {paused ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
              )}
            </button>
          )}
          {/* Dots con área táctil de 44px (touch-target) y punto visible dentro. */}
          {banners.map((b, i) => {
            const isActive = i === active;
            return (
              <button
                key={b.id}
                type="button"
                aria-label={`Ir al banner ${i + 1} de ${banners.length}`}
                aria-current={isActive ? 'true' : undefined}
                onClick={() => { nudge(); setActive(i); scrollToIndex(i); }}
                className="bc-dot grid place-items-center shrink-0"
                style={{ width: 28, height: 44 }}
              >
                <span className="relative block">
                  <span
                    className="block h-1.5 rounded-full transition-all duration-300"
                    style={{
                      width: isActive ? 18 : 6,
                      background: isActive ? accent : (isDark ? '#FFFFFF40' : 'rgba(0,0,0,0.2)'),
                    }}
                  />
                  {/* Anillo de progreso del autoplay sobre el dot activo. */}
                  {isActive && autoplay && (
                    <span
                      className="absolute inset-0 rounded-full"
                      style={{ background: accent, opacity: 0.5, transform: `scaleX(${progress / 100})`, transformOrigin: 'left' }}
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
