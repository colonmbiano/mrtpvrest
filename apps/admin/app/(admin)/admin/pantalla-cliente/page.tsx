"use client";
import { Monitor, MonitorPlay, RefreshCw, Images } from "lucide-react";
import PromosManager from "@/components/PromosManager";
import {
  WtScreen, PageHeader, WtCard, SectionHead, SettingRow,
} from "@/components/warmtech";

export default function PantallaClientePage() {
  return (
    <WtScreen>
      <PageHeader
        eyebrow="TPV · Segunda pantalla"
        title="Pantalla de cliente"
        subtitle="Publicidad que rota en la segunda pantalla del TPV cuando no hay venta activa. Se sincroniza a todas las terminales del negocio."
      />

      {/* contexto en mobile (el subtítulo del header solo se ve en desktop) */}
      <p className="mb-4 text-[13px] leading-relaxed text-tx-mut md:hidden">
        Publicidad que rota en la segunda pantalla del TPV cuando no hay venta activa. Se sincroniza a todas las terminales del negocio.
      </p>

      {/* Preview del display + cómo funciona */}
      <WtCard className="mb-4 p-5 md:p-6">
        <SectionHead title="Cómo se ve" />
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-stretch">
          {/* Mock del display de cliente */}
          <div className="w-full max-w-[280px] shrink-0">
            <div
              className="relative aspect-video w-full overflow-hidden rounded-2xl"
              style={{ background: "linear-gradient(140deg,var(--surf-3),var(--surf-2))", border: "1px solid var(--bd-2)" }}
            >
              <div className="absolute inset-0 grid place-items-center">
                <div className="flex flex-col items-center gap-2 text-center">
                  <MonitorPlay size={32} className="text-primary" />
                  <span className="font-display text-sm font-extrabold text-tx-hi">Tus promociones</span>
                  <span className="font-mono text-[10px] uppercase tracking-[.14em] text-tx-dim">en reposo</span>
                </div>
              </div>
              {/* dots de carrusel */}
              <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 rounded-full"
                    style={{ width: i === 0 ? 16 : 6, background: i === 0 ? "var(--brand-primary)" : "var(--bd-2)" }}
                  />
                ))}
              </div>
            </div>
            <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[.12em] text-tx-dim">
              Pantalla secundaria del TPV
            </p>
          </div>

          {/* Ajustes / explicación con SettingRow */}
          <div className="w-full flex-1 overflow-hidden rounded-2xl" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
            <SettingRow
              icon={Monitor}
              label="Se muestra en reposo"
              sub="Aparece cuando la terminal no tiene una venta activa."
            />
            <SettingRow
              icon={Images}
              label="Carrusel de promociones"
              sub="Las imágenes activas rotan en orden automáticamente."
            />
            <SettingRow
              icon={RefreshCw}
              label="Sincronización en vivo"
              sub="Los cambios llegan a todas las terminales del negocio."
              last
            />
          </div>
        </div>
      </WtCard>

      {/* Gestor de promociones (lógica intacta) */}
      <WtCard className="p-5 md:p-6">
        <SectionHead title="Promociones" />
        <PromosManager />
      </WtCard>
    </WtScreen>
  );
}
