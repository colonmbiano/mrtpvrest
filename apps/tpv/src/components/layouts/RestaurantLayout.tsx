"use client";

interface RestaurantLayoutProps {
  children?: React.ReactNode;
}

export default function RestaurantLayout({ children }: RestaurantLayoutProps) {
  if (children) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="text-center">
        <p className="text-xs uppercase tracking-widest text-white/40 mb-3">
          Cerebro Adaptativo
        </p>
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
          Modo Restaurante
        </h1>
        <p className="mt-3 text-white/50">
          Servicio en mesa · Cocina · Delivery
        </p>
      </div>
    </div>
  );
}
