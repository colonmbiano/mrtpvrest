"use client";
import React from "react";
import {
  Utensils,
  ShoppingBag,
  Bike,
  LayoutGrid,
  Wallet,
  Settings,
  ArrowRight,
} from "lucide-react";
import type { OrderType } from "@/components/tpv/TicketPanel";
import UserBadge from "@/components/UserBadge";

export type ExtendedOrderType = OrderType;

interface OrderTypeSelectorProps {
  onSelect: (type: ExtendedOrderType) => void;
  onClose?: () => void;
  onTables?: () => void;
  onShiftClose?: () => void;
  onConfig?: () => void;
}

type OrderTypeCard = {
  id: OrderType;
  title: string;
  desc: string;
  icon: typeof Utensils;
  accent: string;
};

const ORDER_TYPES: OrderTypeCard[] = [
  {
    id: "DINE_IN",
    title: "Comer Aquí",
    desc: "Asignar mesa o atender en sala",
    icon: Utensils,
    accent: "#ffb84d",
  },
  {
    id: "TAKEOUT",
    title: "Para Llevar",
    desc: "Cliente recoge en mostrador",
    icon: ShoppingBag,
    accent: "#3b82f6",
  },
  {
    id: "DELIVERY",
    title: "Delivery",
    desc: "Preparación y entrega al cliente",
    icon: Bike,
    accent: "#10b981",
  },
];

const OrderTypeSelector: React.FC<OrderTypeSelectorProps> = ({
  onSelect,
  onClose,
  onTables,
  onShiftClose,
  onConfig,
}) => {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-[#0a0a0c]"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      {/* Ambient Warm Tech glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-60 -left-60 w-[700px] h-[700px] rounded-full blur-[120px] bg-amber-500/10" />
        <div className="absolute -bottom-60 -right-60 w-[700px] h-[700px] rounded-full blur-[120px] bg-amber-500/10" />
      </div>

      {/* Badge global del empleado activo. Visible en todas las pantallas
          fuera de la orden para que el cajero siempre vea quién está
          logueado. */}
      <div className="absolute top-5 right-5 z-20">
        <UserBadge />
      </div>

      <div className="relative z-10 w-full max-w-6xl p-6 sm:p-10 flex flex-col items-center">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-block px-4 py-1.5 mb-6 rounded-full text-[10px] font-black uppercase tracking-[0.3em] text-[#ffb84d] bg-[#ffb84d]/10 border border-[#ffb84d]/20">
            Panel de Operación
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight leading-tight">
            ¿Cómo iniciamos
            <br />tu turno?
          </h1>
          <p className="mt-4 text-base md:text-lg font-medium text-white/60 max-w-xl mx-auto leading-relaxed">
            Elige el tipo de servicio o ejecuta una acción operativa.
          </p>
        </div>

        {/* === Tarjeta premium contenedora === */}
        <div className="w-full bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-6 md:p-10 shadow-[0_30px_80px_rgba(0,0,0,0.4)]">
          {/* Título sección Nueva Orden */}
          <div className="flex items-center gap-3 mb-5 px-1">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#ffb84d]">
              Nueva Orden
            </span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Grid principal: 3 tarjetas amplias */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
            {ORDER_TYPES.map((t) => {
              const Icon = t.icon;
              const isPrimary = t.id === "DINE_IN";
              return (
                <button
                  key={t.id}
                  onClick={() => onSelect(t.id)}
                  className={`
                    group relative flex flex-col items-start text-left
                    p-7 rounded-2xl min-h-[64px]
                    bg-white/5 border ${isPrimary ? "border-[#ffb84d]/40" : "border-white/10"}
                    active:scale-95 transition-transform duration-150
                    overflow-hidden
                  `}
                >
                  {/* Halo ambiente del color de acento */}
                  <div
                    aria-hidden
                    className="absolute -top-20 -right-20 w-56 h-56 rounded-full blur-[80px] opacity-20"
                    style={{ background: t.accent }}
                  />

                  {/* Icono grande */}
                  <div
                    className="relative w-16 h-16 rounded-2xl flex items-center justify-center mb-7 shadow-2xl"
                    style={{
                      background: isPrimary ? "#ffb84d" : "rgba(255,255,255,0.06)",
                      color: isPrimary ? "#0a0a0c" : t.accent,
                      border: isPrimary ? "none" : `1px solid ${t.accent}40`,
                    }}
                  >
                    <Icon size={32} strokeWidth={2.5} />
                  </div>

                  {/* Texto */}
                  <h3 className="text-2xl font-black text-white mb-1.5 tracking-tight leading-tight">
                    {t.title}
                  </h3>
                  <p className="text-sm font-medium text-white/55 leading-relaxed mb-3 max-w-[90%]">
                    {t.desc}
                  </p>

                  {/* Flecha */}
                  <div
                    className="absolute bottom-6 right-6"
                    style={{ color: isPrimary ? "#ffb84d" : "rgba(255,255,255,0.35)" }}
                  >
                    <ArrowRight size={24} strokeWidth={3} />
                  </div>

                  {/* Pulse del primario */}
                  {isPrimary && (
                    <span
                      className="absolute top-3 right-3 w-2 h-2 rounded-full bg-[#ffb84d] animate-pulse"
                      aria-hidden
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Título sección Atajos */}
          <div className="flex items-center gap-3 mb-5 px-1">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">
              Atajos Operativos
            </span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Atajos: solo 3 — Mapa, Corte, Configuración */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {onTables && (
              <button
                onClick={onTables}
                className="flex items-center gap-4 px-5 py-4 min-h-[64px] rounded-2xl bg-white/5 border border-white/10 active:scale-95 transition-transform duration-150"
              >
                <div className="w-12 h-12 rounded-xl bg-[#ffb84d]/10 text-[#ffb84d] border border-[#ffb84d]/20 flex items-center justify-center flex-shrink-0">
                  <LayoutGrid size={22} strokeWidth={2.5} />
                </div>
                <div className="flex flex-col items-start min-w-0">
                  <span className="text-sm font-black text-white tracking-tight">
                    Mapa de Mesas
                  </span>
                  <span className="text-[11px] font-semibold text-white/50 truncate">
                    Estado del salón en tiempo real
                  </span>
                </div>
              </button>
            )}

            {onShiftClose && (
              <button
                onClick={onShiftClose}
                className="flex items-center gap-4 px-5 py-4 min-h-[64px] rounded-2xl bg-white/5 border border-white/10 active:scale-95 transition-transform duration-150"
              >
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <Wallet size={22} strokeWidth={2.5} />
                </div>
                <div className="flex flex-col items-start min-w-0">
                  <span className="text-sm font-black text-white tracking-tight">
                    Corte de Caja
                  </span>
                  <span className="text-[11px] font-semibold text-white/50 truncate">
                    Cerrar turno y cuadrar dinero
                  </span>
                </div>
              </button>
            )}

            {onConfig && (
              <button
                onClick={onConfig}
                className="flex items-center gap-4 px-5 py-4 min-h-[64px] rounded-2xl bg-[#ffb84d] text-[#0a0a0c] active:scale-95 transition-transform duration-150 shadow-[0_15px_40px_rgba(255,184,77,0.25)]"
              >
                <div className="w-12 h-12 rounded-xl bg-[#0a0a0c]/15 flex items-center justify-center flex-shrink-0">
                  <Settings size={22} strokeWidth={2.5} className="text-[#0a0a0c]" />
                </div>
                <div className="flex flex-col items-start min-w-0">
                  <span className="text-sm font-black tracking-tight">
                    Configuración
                  </span>
                  <span className="text-[11px] font-bold opacity-80 truncate">
                    Administrar el sistema
                  </span>
                </div>
              </button>
            )}
          </div>
        </div>

        {/* Cerrar sesión */}
        {onClose && (
          <button
            onClick={onClose}
            className="mt-8 w-full max-w-xs min-h-[56px] py-4 rounded-2xl bg-transparent border border-white/10 flex items-center justify-center text-[11px] font-black uppercase tracking-[0.25em] text-white/50 active:scale-95 transition-transform duration-150"
          >
            Cerrar Sesión
          </button>
        )}
      </div>
    </div>
  );
};

export default OrderTypeSelector;
