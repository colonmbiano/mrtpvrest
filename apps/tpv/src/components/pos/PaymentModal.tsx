"use client";
import React, { useState } from "react";
import { X, CreditCard, Banknote, QrCode, Gift, CheckCircle2 } from "lucide-react";
import Button from "@/components/ui/Button";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderNumber: string;
  tableName?: string;
  total: number;
  items: { name: string; quantity: number; subtotal: number }[];
  onConfirm: (method: string) => void;
}

const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  orderNumber,
  tableName,
  total,
  items,
  onConfirm,
}) => {
  const [method, setMethod] = useState("CARD");
  const [cashReceived, setCashReceived] = useState(total);
  const change = Math.max(0, cashReceived - total);

  if (!isOpen) return null;

  const methods = [
    { id: "CASH",     icon: Banknote,   label: "Efectivo" },
    { id: "CARD",     icon: CreditCard, label: "Tarjeta" },
    { id: "TRANSFER", icon: QrCode,     label: "Transfer" },
    { id: "COURTESY", icon: Gift,       label: "Cortesía" },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* OVERLAY */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      
      {/* MODAL CONTENT */}
      <div className="relative w-full max-w-5xl h-[640px] bg-surf-1 border border-bd rounded-[2.5rem] shadow-2xl overflow-hidden flex animate-in zoom-in-95 duration-200">
        
        {/* LEFT: PAYMENT OPTIONS */}
        <div className="flex-1 p-10 flex flex-col gap-10">
          <div className="space-y-1">
            <span className="eyebrow">ORDEN #{orderNumber} {tableName && `· MESA ${tableName}`}</span>
            <h2 className="text-3xl font-black">Procesar pago</h2>
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
                    h-32 rounded-3xl flex flex-col items-center justify-center gap-3 transition-all
                    ${isSelected 
                      ? "bg-iris-soft border-2 border-iris-500 text-iris-500 shadow-lg shadow-iris-glow/20 scale-105" 
                      : "bg-surf-2 border border-bd text-tx-sec hover:bg-surf-3"}
                  `}
                >
                  <Icon size={28} />
                  <span className="text-xs font-black uppercase tracking-widest">{m.label}</span>
                </button>
              );
            })}
          </div>

          {/* METHOD SPECIFIC VIEW */}
          <div className="flex-1 bg-surf-2/50 border border-bd rounded-[2rem] p-8">
            {method === "CASH" && (
              <div className="space-y-6">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <span className="eyebrow">RECIBIDO</span>
                    <div className="text-5xl font-black mono tnum text-tx-pri">${cashReceived}</div>
                  </div>
                  <div className="space-y-1 text-right">
                    <span className="eyebrow text-success">CAMBIO</span>
                    <div className="text-3xl font-black mono tnum text-success">${change}</div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3">
                  {[total, total + 20, total + 50, Math.ceil(total/100)*100, 200, 500, 1000].filter(v => v >= total).slice(0, 8).map(val => (
                    <button
                      key={val}
                      onClick={() => setCashReceived(val)}
                      className="h-14 rounded-xl bg-surf-1 border border-bd font-black mono hover:bg-surf-3 transition-pos"
                    >
                      ${val}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {method === "CARD" && (
              <div className="h-full flex flex-col items-center justify-center gap-6 text-center">
                <div className="w-20 h-20 rounded-3xl bg-surf-3 flex items-center justify-center text-iris-500 animate-pulse">
                  <CreditCard size={40} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-black">Esperando terminal...</h3>
                  <p className="text-sm text-tx-dis font-bold uppercase tracking-wider">Verifone V200c · Conectado</p>
                </div>
                <div className="w-64 h-1.5 bg-surf-3 rounded-full overflow-hidden">
                  <div className="h-full bg-iris-500 animate-progress origin-left" />
                </div>
              </div>
            )}

            {method === "TRANSFER" && (
              <div className="h-full flex items-center gap-10">
                <div className="w-40 h-40 bg-white p-4 rounded-3xl shadow-xl flex items-center justify-center">
                   {/* Placeholder for QR */}
                   <QrCode size={120} className="text-black" />
                </div>
                <div className="space-y-3">
                  <h3 className="text-xl font-black leading-tight">Escanea para pagar vía CoDi o SPEI</h3>
                  <p className="text-sm text-tx-sec leading-relaxed">
                    Muestra este código al cliente. El sistema detectará el pago automáticamente una vez procesado.
                  </p>
                </div>
              </div>
            )}

            {method === "COURTESY" && (
              <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
                <Gift size={48} className="text-brand" />
                <div className="space-y-2">
                   <h3 className="text-xl font-black">Marcado como cortesía</h3>
                   <p className="text-sm text-tx-sec max-w-xs mx-auto">
                     Se requiere autorización de gerente para cerrar órdenes sin cobro.
                   </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: SUMMARY & ACTIONS */}
        <div className="w-[360px] bg-surf-2 border-l border-bd p-10 flex flex-col">
          <div className="flex-1 overflow-y-auto space-y-6 scrollbar-hide">
            <div className="space-y-4">
              <span className="eyebrow">RESUMEN DEL PEDIDO</span>
              <div className="space-y-3">
                {items.map((item, i) => (
                  <div key={i} className="flex justify-between items-baseline gap-4">
                    <span className="text-[13px] font-bold text-tx-sec truncate flex-1">
                      <span className="text-iris-500 mr-2">{item.quantity}×</span>
                      {item.name}
                    </span>
                    <span className="text-[13px] font-bold mono tnum text-tx-sec">${item.subtotal}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2 pt-6 border-t border-bd">
              <div className="flex justify-between text-tx-dis text-[13px] font-bold">
                <span>Subtotal</span>
                <span className="mono tnum">$576</span>
              </div>
              <div className="flex justify-between text-success text-[13px] font-bold">
                <span>Descuento</span>
                <span className="mono tnum">−$34</span>
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-bd flex flex-col gap-4">
            <div className="flex justify-between items-baseline">
              <span className="eyebrow">TOTAL A COBRAR</span>
              <span className="text-4xl font-black mono tnum text-tx-pri">${total}</span>
            </div>

            <Button 
              variant="primary" 
              fullWidth 
              size="xl" 
              className="h-16 font-black uppercase tracking-[0.15em] text-sm gap-3"
              onClick={() => onConfirm(method)}
            >
              <CheckCircle2 size={20} />
              Confirmar pago
            </Button>

            <button 
              onClick={onClose}
              className="h-10 text-[11px] font-black uppercase tracking-widest text-tx-dis hover:text-tx-mut transition-colors"
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
