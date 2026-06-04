'use client';

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
};

// Carrusel horizontal de banners de promoción. Scroll con snap; muestra todos
// los banners vigentes (no solo el primero). Banners con linkType=URL son
// clicables. Reutilizado por todos los temas del storefront.
export default function BannerCarousel({ banners, variant = 'light', accent = '#ff5c35', className = '' }: BannerCarouselProps) {
  if (!banners || banners.length === 0) return null;

  const overlay = variant === 'dark'
    ? 'linear-gradient(to top, #0C0C0EE6, transparent)'
    : 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)';
  const single = banners.length === 1;

  return (
    <div className={`bc-scroll flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-1 px-1 ${className}`}>
      <style dangerouslySetInnerHTML={{ __html: `.bc-scroll::-webkit-scrollbar{display:none}.bc-scroll{-ms-overflow-style:none;scrollbar-width:none}` }} />
      {banners.map((b) => {
        const clickable = b.linkType === 'URL' && !!b.linkValue;
        const Wrapper: any = clickable ? 'a' : 'div';
        const wrapperProps = clickable
          ? { href: b.linkValue, target: '_blank', rel: 'noopener noreferrer' }
          : {};
        return (
          <Wrapper
            key={b.id}
            {...wrapperProps}
            className={`relative snap-start shrink-0 ${single ? 'w-full' : 'w-[88%] sm:w-[420px]'} h-[180px] md:h-[240px] rounded-[24px] overflow-hidden block ${clickable ? 'cursor-pointer' : ''}`}
            style={{ border: variant === 'dark' ? '1px solid #FFFFFF14' : '1px solid rgba(0,0,0,0.06)' }}
          >
            <img src={b.imageUrl} alt={b.title || 'Promoción'} className="w-full h-full object-cover" />
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
  );
}
