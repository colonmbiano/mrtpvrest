"use client";

export default function BarLayout() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="text-center">
        <p className="text-xs uppercase tracking-widest text-white/40 mb-3">
          Cerebro Adaptativo
        </p>
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
          Modo Bar
        </h1>
        <p className="mt-3 text-white/50">
          Comandas · Cuentas abiertas · Cierre nocturno
        </p>
      </div>
    </div>
  );
}
