"use client";
import React, { useState } from "react";
import { X, Receipt, Search, Bike, Printer, ChevronRight } from "lucide-react";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";

interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  type: string; // TAKEOUT, DINE_IN, DELIVERY
  status: string; // PENDING, CONFIRMED, PREPARING, READY, DELIVERED
  total: number;
  time: string;
  itemsCount: number;
  driver?: string;
  needsDriver?: boolean;
}

interface OrdersDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
  onSelectOrder: (order: Order) => void;
  onConfirmPayment: (order: Order) => void;
}

const OrdersDrawer: React.FC<OrdersDrawerProps> = ({
  isOpen,
  onClose,
  orders,
  onSelectOrder,
  onConfirmPayment,
}) => {
  const [activeFilter, setActiveFilter] = useState("Todos");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const filters = ["Todos", "Mesa", "Llevar", "Domicilio"];

  return (
    <div className="fixed inset-0 z-[120] flex justify-end font-sans">
      {/* OVERLAY */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" 
        onClick={onClose} 
      />
      
      {/* DRAWER */}
      <aside className="relative w-full max-w-[440px] h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 ease-out overflow-hidden" style={{ background: "#0C0C0E" }}>
        {/* Halo Glows for Drawer */}
        <div 
          className="absolute pointer-events-none"
          style={{
            width: 600, height: 600, top: -100, right: -200,
            background: "radial-gradient(circle, #FF840015 0%, #FF840000 70%)"
          }}
        />
        <div 
          className="absolute pointer-events-none"
          style={{
            width: 600, height: 600, bottom: -100, left: -200,
            background: "radial-gradient(circle, #88D66C10 0%, #88D66C00 70%)"
          }}
        />

        {/* HEADER */}
        <div className="relative z-10 p-6 border-b border-border flex items-center gap-4 shrink-0 bg-surf-2/50 backdrop-blur-md">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-brand" style={{ background: "var(--brand-soft)" }}>
            <Receipt size={24} />
          </div>
          <div className="flex-1 flex flex-col">
            <span className="text-xl font-semibold tracking-tight text-tx-pri">Tickets Abiertos</span>
            <span className="text-xs text-tx-mut font-medium mt-1">
              {orders.length} en curso · 1 sin repartidor
            </span>
          </div>
          <button onClick={onClose} className="p-2 w-10 h-10 flex items-center justify-center rounded-full bg-surf-2 text-tx-mut hover:text-tx-pri hover:bg-surf-3 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* FILTERS & SEARCH */}
        <div className="relative z-10 p-5 border-b border-border space-y-5 bg-surf-1">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`
                  px-5 py-2.5 rounded-full text-xs font-bold transition-all whitespace-nowrap tracking-wide
                  ${activeFilter === f 
                    ? "bg-brand text-brand-fg shadow-[0_0_12px_var(--brand)] scale-105" 
                    : "bg-surface-2 text-tx-mut hover:text-tx-pri hover:bg-surface-3 border border-border"}
                `}
              >
                {f}
              </button>
            ))}
          </div>
          
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-tx-mut" size={16} />
            <input 
              placeholder="Buscar por cliente o #orden..." 
              className="w-full h-12 bg-surface-2 border border-border rounded-2xl pl-11 pr-4 text-sm text-tx-pri focus:outline-none focus:border-brand transition-all placeholder:text-tx-mut"
            />
          </div>
        </div>

        {/* ORDERS LIST */}
        <div className="relative z-10 flex-1 overflow-y-auto scrollbar-hide">
          {orders.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-40 gap-4">
              <Receipt size={48} className="text-tx-mut" />
              <p className="text-sm font-medium tracking-wide text-tx-mut">No hay tickets activos</p>
            </div>
          ) : (
            <div className="flex flex-col p-3 gap-2">
              {orders.map((order) => {
                const isSelected = selectedId === order.id;
                return (
                  <div 
                    key={order.id}
                    onClick={() => setSelectedId(isSelected ? null : order.id)}
                    className={`
                      p-4 rounded-2xl cursor-pointer transition-all relative border
                      ${isSelected ? "bg-surface-3 border-brand/50 shadow-md" : "bg-surface-2 border-border hover:border-brand/30"}
                    `}
                  >
                    {isSelected && (
                      <div className="absolute -left-px top-4 bottom-4 w-1 rounded-r-md bg-brand" />
                    )}
                    
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="mono text-[10px] font-bold text-tx-mut tracking-wider uppercase bg-surf-3 px-1.5 py-0.5 rounded-md">
                            {order.orderNumber}
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--brand)" }}>
                            {order.type}
                          </span>
                        </div>
                        <h3 className="text-base font-semibold text-tx-pri truncate leading-tight">
                          {order.customerName}
                        </h3>
                        <p className="text-[11px] font-medium text-tx-mut">
                          {order.itemsCount} productos · hace {order.time}
                        </p>
                        
                        {order.driver && (
                          <div className="flex items-center gap-2 mt-2 text-tx-sec">
                            <Bike size={12} />
                            <span className="text-[11px] font-bold">{order.driver}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-3 shrink-0">
                        <Chip variant={order.status === "READY" ? "success" : "info"} size="sm">
                          {order.status}
                        </Chip>
                        <span className="mono text-lg font-bold tracking-tight text-tx-pri">
                          ${order.total.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* EXPANDED ACTIONS */}
                    {isSelected && (
                      <div className="mt-5 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                        {order.needsDriver && (
                          <Button 
                            variant="primary" 
                            fullWidth 
                            className="h-11 text-xs font-bold uppercase tracking-widest gap-2"
                          >
                            <Bike size={16} /> Asignar repartidor
                          </Button>
                        )}
                        
                        <div className="grid grid-cols-2 gap-2">
                          <Button 
                            variant="soft" 
                            className="h-10 text-[10px] font-bold uppercase tracking-widest gap-2 bg-surf-3 border border-border hover:bg-surf-4"
                            onClick={(e) => { e.stopPropagation(); onSelectOrder(order); }}
                          >
                            Ver detalle
                          </Button>
                          <Button 
                            variant="primary" 
                            className="h-10 text-[10px] font-bold uppercase tracking-widest gap-2"
                            onClick={(e) => { e.stopPropagation(); onConfirmPayment(order); }}
                          >
                            Cobrar
                          </Button>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border mt-2">
                          <Button variant="ghost" className="h-9 text-[10px] font-bold uppercase tracking-widest gap-2 text-tx-mut hover:text-tx-pri">
                            <Printer size={14} /> Reimprimir
                          </Button>
                          <Button variant="ghost" className="h-9 text-[10px] font-bold uppercase tracking-widest gap-2 text-danger opacity-80 hover:opacity-100">
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="relative z-10 p-5 border-t border-border bg-surf-1 flex flex-col gap-3">
           <Button variant="soft" fullWidth className="h-12 text-xs font-bold uppercase tracking-widest gap-2 bg-surf-2 border border-border">
             Ver historial completo
             <ChevronRight size={16} />
           </Button>
        </div>
      </aside>
    </div>
  );
};

export default OrdersDrawer;
