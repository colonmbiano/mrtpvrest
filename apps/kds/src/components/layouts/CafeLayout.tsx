"use client";

export default function CafeLayout() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="text-center">
        <p className="text-xs uppercase tracking-widest text-white/40 mb-3">
          Cerebro Adaptativo
        </p>
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
          Modo Cafetería
        </h1>
        <p className="mt-3 text-white/50">
          Mostrador rápido · Modificadores · Fidelidad
        </p>
      </div>
    </div>
  );
}
