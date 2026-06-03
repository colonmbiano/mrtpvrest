"use client";
import PromosManager from "@/components/PromosManager";

export default function PantallaClientePage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="font-syne text-3xl font-black">Pantalla de Cliente</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Publicidad que rota en la segunda pantalla del TPV cuando no hay venta activa.
          Se sincroniza a todas las terminales del negocio.
        </p>
      </div>
      <PromosManager />
    </div>
  );
}
