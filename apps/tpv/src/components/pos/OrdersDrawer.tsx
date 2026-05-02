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
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* OVERLAY */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300" 
        onClick={onClose} 
      />
      
      {/* DRAWER */}
      <aside className="relative w-[440px] h-full bg-surf-1 border-l border-bd shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 ease-out">
        {/* HEADER */}
        <div className="p-6 border-b border-bd flex items-center gap-4 shrink-0 bg-surf-2/30">
          <div className="w-10 h-10 rounded-xl bg-surf-3 flex items-center justify-center text-tx-sec">
            <Receipt size={20} />
          </div>
          <div className="flex-1 flex flex-col">
            <span className="text-[16px] font-black">Pedidos activos</span>
            <span className="text-[11px] text-tx-dis font-bold uppercase tracking-tight">
              {orders.length} en curso · 1 sin repartidor
            </span>
          </div>
          <button onClick={onClose} className="p-2 text-tx-mut hover:text-tx-pri transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* FILTERS & SEARCH */}
        <div className="p-4 border-b border-bd space-y-4">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`
                  px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap
                  ${activeFilter === f 
                    ? "bg-iris-500 text-white shadow-md shadow-iris-glow/20" 
                    : "bg-surf-2 text-tx-dis hover:text-tx-sec border border-bd"}
                `}
              >
                {f}
              </button>
            ))}
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-tx-dis" size={14} />
            <input 
              placeholder="Buscar por nombre o #orden..." 
              className="w-full h-10 bg-surf-2 border border-bd rounded-xl pl-10 pr-4 text-[13px] focus:outline-none focus:border-iris-500 transition-pos"
            />
          </div>
        </div>

        {/* ORDERS LIST */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {orders.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-20 gap-4">
              <Receipt size={48} />
              <p className="text-xs font-black uppercase tracking-widest">No hay pedidos activos</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {orders.map((order) => {
                const isSelected = selectedId === order.id;
                return (
                  <div 
                    key={order.id}
                    onClick={() => setSelectedId(isSelected ? null : order.id)}
                    className={`
                      p-5 border-b border-bd cursor-pointer transition-all relative
                      ${isSelected ? "bg-surf-2" : "hover:bg-surf-2/50"}
                    `}
                  >
                    {isSelected && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-iris-500" />
                    )}
                    
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="mono text-[10px] font-black text-tx-dis tracking-tighter uppercase">{order.orderNumber}</span>
                          <span className="text-[10px] text-tx-dis font-bold uppercase tracking-widest opacity-50">·</span>
                          <span className="text-[10px] text-iris-500 font-black uppercase tracking-widest">{order.type}</span>
                        </div>
                        <h3 className="text-[15px] font-black text-tx-pri truncate leading-tight">
                          {order.customerName}
                        </h3>
                        <p className="text-[11px] font-bold text-tx-dis">
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
                        <span className="mono tnum text-[16px] font-black tracking-tight">${order.total}</span>
                      </div>
                    </div>

                    {/* EXPANDED ACTIONS */}
                    {isSelected && (
                      <div className="mt-5 space-y-2 animate-in slide-in-from-top-2 duration-200">
                        {order.needsDriver && (
                          <Button 
                            variant="primary" 
                            fullWidth 
                            className="h-11 text-xs font-black uppercase tracking-widest gap-2"
                          >
                            <Bike size={16} /> Asignar repartidor
                          </Button>
                        )}
                        
                        <div className="grid grid-cols-2 gap-2">
                          <Button 
                            variant="soft" 
                            className="h-10 text-[10px] font-black uppercase tracking-widest gap-2"
                            onClick={(e) => { e.stopPropagation(); onSelectOrder(order); }}
                          >
                            Ver detalle
                          </Button>
                          <Button 
                            variant="primary" 
                            className="h-10 text-[10px] font-black uppercase tracking-widest gap-2"
                            onClick={(e) => { e.stopPropagation(); onConfirmPayment(order); }}
                          >
                            Cobrar
                          </Button>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2">
                          <Button variant="ghost" className="h-9 text-[9px] font-black uppercase tracking-widest gap-2 opacity-60">
                            <Printer size={12} /> Reimprimir
                          </Button>
                          <Button variant="ghost" className="h-9 text-[9px] font-black uppercase tracking-widest gap-2 text-danger opacity-60">
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
        <div className="p-6 border-t border-bd bg-surf-2/50 flex flex-col gap-3">
           <Button variant="soft" fullWidth className="h-12 text-xs font-black uppercase tracking-widest gap-2">
             Ver historial de ventas
             <ChevronRight size={14} />
           </Button>
        </div>
      </aside>
    </div>
  );
};

export default OrdersDrawer;
