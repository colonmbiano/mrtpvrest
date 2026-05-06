"use client";
import React, { useState } from "react";
import { CreditCard, Banknote, QrCode, Gift, CheckCircle2 } from "lucide-react";
import Button from "@/components/ui/Button";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderNumber: string;
  tableName?: string;
  total: number;
  items: { name: string; quantity: number; subtotal: number }[];
  discount?: number;
  onConfirm: (method: string) => void;
}

const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  orderNumber,
  tableName,
  total,
  items,
  discount = 0,
  onConfirm,
}) => {
  const [method, setMethod] = useState("CARD");
  const [cashReceived, setCashReceived] = useState(total);
  const change = Math.max(0, cashReceived - total);

  if (!isOpen) return null;

  const subtotal = items.reduce((acc, item) => acc + item.subtotal, 0);
  const calculatedDiscount = subtotal - total;
  const displayDiscount = discount > 0 ? discount : (calculatedDiscount > 0 ? calculatedDiscount : 0);

  const methods = [
    { id: "CASH",     icon: Banknote,   label: "Efectivo" },
    { id: "CARD",     icon: CreditCard, label: "Tarjeta" },
    { id: "TRANSFER", icon: QrCode,     label: "Transfer" },
    { id: "COURTESY", icon: Gift,       label: "Cortesía" },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* OVERLAY */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      
      {/* MODAL CONTENT */}
      <div className="relative w-full max-w-5xl h-[680px] bg-[#0a0a0c] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden flex animate-in zoom-in-95 duration-200">
        
        {/* LEFT: PAYMENT OPTIONS */}
        <div className="flex-1 p-10 flex flex-col gap-10">
          <div className="space-y-1">
            <span className="eyebrow text-amber-500/80">ORDEN #{orderNumber} {tableName && `· MESA ${tableName}`}</span>
            <h2 className="text-4xl font-black tracking-tight text-white">Procesar pago</h2>
          </div>

          {/* METHOD SELECTOR */}
          <div className="grid grid-cols-4 gap-4">
            {methods.map((m) => {
              const Icon = m.icon;
              const isSelected = method === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMethod(m.id)}
                  className={`
                    h-32 rounded-[2rem] flex flex-col items-center justify-center gap-3 transition-all active:scale-95
                    ${isSelected 
                      ? "bg-amber-500/10 border-2 border-amber-500 text-amber-500 shadow-[0_0_20px_rgba(255,184,77,0.15)]" 
                      : "bg-[#121316] border border-white/5 text-zinc-500"}
                  `}
                >
                  <Icon size={32} />
                  <span className="text-[11px] font-black uppercase tracking-[0.15em]">{m.label}</span>
                </button>
              );
            })}
          </div>

          {/* METHOD SPECIFIC VIEW */}
          <div className="flex-1 bg-[#121316] border border-white/5 rounded-[2.5rem] p-10">
            {method === "CASH" && (
              <div className="h-full flex flex-col justify-center space-y-10">
                <div className="flex justify-between items-end">
                  <div className="space-y-2">
                    <span className="eyebrow">MONTO RECIBIDO</span>
                    <div className="text-6xl font-black mono tnum text-white leading-none">${cashReceived}</div>
                  </div>
                  <div className="space-y-2 text-right">
                    <span className="eyebrow text-amber-500">CAMBIO</span>
                    <div className="text-4xl font-black mono tnum text-amber-500 leading-none">${change}</div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4">
                  {Array.from(new Set([total, total + 20, total + 50, Math.ceil(total/100)*100, 200, 500, 1000]))
                    .filter(v => v >= total)
                    .sort((a, b) => a - b)
                    .slice(0, 8)
                    .map(val => (
                      <button
                        key={val}
                        onClick={() => setCashReceived(val)}
                        className="h-16 rounded-2xl bg-[#1a1b1f] border border-white/5 font-black mono text-lg text-white active:scale-95 transition-all active:bg-amber-500 active:text-black"
                      >
                        ${val}
                      </button>
                    ))}
                </div>
              </div>
            )}

            {method === "CARD" && (
              <div className="h-full flex flex-col items-center justify-center gap-8 text-center">
                <div className="w-24 h-24 rounded-[2rem] bg-[#1a1b1f] flex items-center justify-center text-amber-500 animate-pulse border border-amber-500/20">
                  <CreditCard size={48} />
                </div>
                <div className="space-y-3">
                  <h3 className="text-2xl font-black text-white tracking-tight">Esperando terminal...</h3>
                  <p className="text-xs text-zinc-500 font-bold uppercase tracking-[0.2em]">Verifone V200c · Conectado</p>
                </div>
                <div className="w-72 h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 animate-progress origin-left" />
                </div>
              </div>
            )}

            {method === "TRANSFER" && (
              <div className="h-full flex items-center justify-center gap-12">
                <div className="w-48 h-48 bg-white p-5 rounded-[2.5rem] shadow-2xl flex items-center justify-center">
                   <QrCode size={160} className="text-black" />
                </div>
                <div className="space-y-4 max-w-xs">
                  <h3 className="text-2xl font-black leading-tight text-white tracking-tight">Escanea para pagar</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed font-medium">
                    Muestra este código al cliente. El sistema detectará el pago automáticamente una vez procesado.
                  </p>
                </div>
              </div>
            )}

            {method === "COURTESY" && (
              <div className="h-full flex flex-col items-center justify-center gap-6 text-center">
                <div className="w-20 h-20 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
                  <Gift size={48} />
                </div>
                <div className="space-y-3">
                   <h3 className="text-2xl font-black text-white tracking-tight">Marcado como cortesía</h3>
                   <p className="text-sm text-zinc-500 max-w-xs mx-auto font-medium leading-relaxed">
                     Se requiere autorización de gerente para cerrar órdenes sin cobro.
                   </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: SUMMARY & ACTIONS */}
        <div className="w-[380px] bg-[#121316] border-l border-white/5 p-12 flex flex-col">
          <div className="flex-1 overflow-y-auto space-y-8 scrollbar-hide">
            <div className="space-y-6">
              <span className="eyebrow text-zinc-500">RESUMEN DEL PEDIDO</span>
              <div className="space-y-4">
                {items.map((item, i) => (
                  <div key={i} className="flex justify-between items-baseline gap-4">
                    <span className="text-sm font-bold text-zinc-300 truncate flex-1">
                      <span className="text-amber-500 mr-2">{item.quantity}×</span>
                      {item.name}
                    </span>
                    <span className="text-sm font-bold mono tnum text-zinc-300">${item.subtotal.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3 pt-8 border-t border-white/5">
              <div className="flex justify-between text-zinc-500 text-sm font-bold">
                <span>Subtotal</span>
                <span className="mono tnum">${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-amber-500 text-sm font-bold">
                <span>Descuento</span>
                <span className="mono tnum">−${displayDiscount.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="pt-10 border-t border-white/5 flex flex-col gap-6">
            <div className="flex justify-between items-baseline">
              <span className="eyebrow">TOTAL</span>
              <span className="text-5xl font-black mono tnum text-white tracking-tighter">${total.toFixed(2)}</span>
            </div>

            <Button 
              variant="primary" 
              fullWidth 
              className="h-[72px] font-black uppercase tracking-[0.2em] text-sm gap-3 rounded-2xl active:scale-95 transition-all shadow-[0_0_30px_rgba(255,184,77,0.2)]"
              onClick={() => onConfirm(method)}
            >
              <CheckCircle2 size={24} />
              Confirmar pago
            </Button>

            <button 
              onClick={onClose}
              className="h-12 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-600 active:text-white transition-colors"
            >
              Cancelar y volver
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;
