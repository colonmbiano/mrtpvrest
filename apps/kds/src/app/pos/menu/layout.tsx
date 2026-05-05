"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { Search, Menu, Receipt, ShoppingCart, UtensilsCrossed } from "lucide-react";
import ConfigMenu from "@/components/pos/ConfigMenu";
import OrderTypeSelector from "@/components/pos/OrderTypeSelector";
import type { ExtendedOrderType } from "@/components/pos/OrderTypeSelector";
import OrdersDrawer from "@/components/pos/OrdersDrawer";
import PaymentModal from "@/components/pos/PaymentModal";
import { useTPVAuth } from "@/hooks/useTPVAuth";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useTicketStore } from "@/store/ticketStore";
import api from "@/lib/api";

import SidebarTicket from "@/components/pos/SidebarTicket";
import { useThemeStore } from "@/store/themeStore";

const ORDER_TYPE_LABEL: Record<string, string> = {
  DINE_IN: "MESA",
  TAKEOUT: "LLEVAR",
  DELIVERY: "DOMICILIO",
};

const ACTIVE_STATUSES = new Set([
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "OPEN",
  "OUT_FOR_DELIVERY",
]);

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 1) return "ahora";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}

export default function CashierLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const [showOrders, setShowOrders] = useState(false);
  const [mobileView, setMobileView] = useState<"menu" | "ticket">("menu");

  const { palette, mode, setPalette, toggleMode } = useThemeStore();
  const activeTicket = useTicketStore((s) => s.getActiveTicket());
  const itemCount = activeTicket.items.reduce((acc, i) => acc + i.quantity, 0);

  const [openOrders, setOpenOrders] = useState<any[]>([]);
  const [payOrder, setPayOrder] = useState<any | null>(null);
  const [shiftOpen, setShiftOpen] = useState<boolean | null>(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const prevLockedRef = useRef<boolean | null>(null);

  const {
    isLocked,
    restaurantName,
    locationName,
    currentEmployee,
    logout,
  } = useTPVAuth();

  const fetchOpenOrders = useCallback(async () => {
    try {
      const { data } = await api.get("/api/orders/admin");
      const list = Array.isArray(data) ? data : [];
      setOpenOrders(list.filter((o: any) => ACTIVE_STATUSES.has(o.status)));
    } catch (err) {
      console.error("Error cargando órdenes abiertas:", err);
    }
  }, []);

  useEffect(() => {
    if (isLocked) return;
    fetchOpenOrders();
    const id = setInterval(fetchOpenOrders, 30000);
    return () => clearInterval(id);
  }, [isLocked, fetchOpenOrders]);

  const fetchShift = useCallback(async () => {
    try {
      const { data } = await api.get("/api/shifts/active");
      setShiftOpen(Boolean(data?.isOpen ?? data?.id));
    } catch {
      setShiftOpen(false);
    }
  }, []);

  useEffect(() => {
    if (isLocked) return;
    fetchShift();
    const id = setInterval(fetchShift, 60000);
    return () => clearInterval(id);
  }, [isLocked, fetchShift]);

  const handleConfirmDrawerPayment = async (method: string) => {
    if (!payOrder) return;
    try {
      await api.put(`/api/orders/${payOrder.id}/payment`, { paymentMethod: method });
      toast.success("Cobro procesado");
      setPayOrder(null);
      fetchOpenOrders();
    } catch (err: any) {
      toast.error("Error al cobrar: " + (err?.response?.data?.error || err?.message || ""));
    }
  };

  const handleSelectOrder = async (o: any) => {
    try {
      const { data } = await api.get(`/api/orders/${o.id}`);
      setPayOrder(data);
    } catch {
      setPayOrder(o);
    }
  };

  useEffect(() => {
    if (prevLockedRef.current === true && !isLocked) {
      setShowStartPicker(true);
    }
    prevLockedRef.current = isLocked;
  }, [isLocked]);

  const handlePickType = (type: ExtendedOrderType) => {
    useTicketStore.getState().updateTicket({ type: type as any });
    setShowStartPicker(false);
  };

  const handlePickOpenTickets = () => {
    setShowStartPicker(false);
    setShowOrders(true);
  };

  useEffect(() => {
    if (showOrders) fetchOpenOrders();
  }, [showOrders, fetchOpenOrders]);

  const drawerOrders = openOrders.map((o: any) => ({
    id: o.id,
    orderNumber: o.orderNumber || `#${String(o.id).slice(-6).toUpperCase()}`,
    customerName: o.customerName || o.user?.name || "Público general",
    type: ORDER_TYPE_LABEL[o.orderType] || o.orderType || "ORDEN",
    status: o.status,
    total: Number(o.total ?? 0),
    time: timeAgo(o.createdAt),
    itemsCount: Array.isArray(o.items) ? o.items.length : 0,
    needsDriver: o.orderType === "DELIVERY" && !o.deliveryDriverId,
  }));

  // VALIDACIÓN DE ROL
  useEffect(() => {
    if (currentEmployee) {
      const allowedRoles = ["CASHIER", "OWNER", "ADMIN", "MANAGER"];
      if (!allowedRoles.includes(currentEmployee.role)) {
        console.warn(
          `[SECURITY] Acceso denegado a /pos/menu: rol ${currentEmployee.role} no autorizado`
        );
        router.replace("/");
      }
    }
  }, [currentEmployee, router]);

  return (
    <div className="flex h-[100dvh] w-full bg-surf-0 overflow-hidden font-sans text-tx-pri">
      {/* SIDE RAIL */}
      <aside className="hidden lg:flex w-20 bg-surface-1 border-r border-border flex-col items-center py-6 gap-8 shrink-0 relative z-20">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl text-brand-fg shadow-[0_0_15px_rgba(255,132,0,0.3)] transition-all hover:scale-105" style={{ background: "var(--brand)" }}>
          M
        </div>

        <button
          onClick={() => setShowMenu(true)}
          className="w-12 h-12 flex items-center justify-center rounded-2xl text-tx-mut hover:text-tx-pri hover:bg-surface-2 transition-all active:scale-95"
        >
          <Menu size={24} />
        </button>

        <button
          onClick={() => setShowOrders(true)}
          className="w-12 h-12 flex items-center justify-center rounded-2xl text-tx-mut hover:text-tx-pri hover:bg-surface-2 transition-all relative active:scale-95"
        >
          <Receipt size={24} />
          {openOrders.length > 0 && (
            <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full shadow-[0_0_8px_var(--brand)]" style={{ background: "var(--brand)" }} />
          )}
        </button>

        <div className="flex-1" />

        <button
          onClick={() => setShowMenu(true)}
          className="w-12 h-12 flex items-center justify-center rounded-2xl text-tx-mut hover:text-tx-pri hover:bg-surface-2 transition-all active:scale-95"
        >
          <UtensilsCrossed size={24} />
        </button>
      </aside>

      <ConfigMenu
        isOpen={showMenu}
        onClose={() => setShowMenu(false)}
        onLogout={logout}
        currentTheme={palette}
        onThemeChange={setPalette}
        isDark={mode === "dark"}
        onToggleMode={toggleMode}
      />

      <OrdersDrawer
        isOpen={showOrders}
        onClose={() => setShowOrders(false)}
        orders={drawerOrders}
        onSelectOrder={handleSelectOrder}
        onConfirmPayment={handleSelectOrder}
      />

      {showStartPicker && (
        <OrderTypeSelector 
          onSelect={handlePickType} 
          openOrdersCount={openOrders.length}
          onOpenTickets={handlePickOpenTickets}
          onClose={() => setShowStartPicker(false)}
        />
      )}

      {payOrder && (
        <PaymentModal
          isOpen={!!payOrder}
          onClose={() => setPayOrder(null)}
          orderNumber={payOrder.orderNumber || String(payOrder.id).slice(-6).toUpperCase()}
          tableName={payOrder.table?.name || payOrder.tableNumber || undefined}
          total={Number(payOrder.total ?? 0)}
          items={(payOrder.items || []).map((i: any) => ({
            name: i.name || i.menuItem?.name || "Producto",
            quantity: i.quantity ?? 1,
            subtotal: Number(i.subtotal ?? 0),
          }))}
          onConfirm={handleConfirmDrawerPayment}
        />
      )}

      {/* MAIN CONTENT AREA */}
      <div className={`flex-1 flex flex-col min-w-0 min-h-0 ${mobileView === "menu" ? "flex" : "hidden"} lg:flex`}>
        {/* TOP HEADER */}
        <header className="h-16 sm:h-20 border-b border-border bg-surface-1 flex items-center px-6 gap-6 shrink-0 z-10">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-black tracking-widest uppercase truncate max-w-[200px] text-tx-pri">
              {restaurantName || "MRTPVREST"}
            </h1>
            <span className="hidden sm:inline-block px-2.5 py-1 rounded-md bg-surface-2 border border-border text-[10px] font-bold text-tx-mut">
              {locationName?.toUpperCase() || "SUCURSAL"}
            </span>
          </div>

          <div className="hidden md:flex flex-1 max-w-xl mx-auto relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-tx-mut" size={16} />
            <input
              placeholder="Buscar platillo o categoría..."
              className="w-full h-12 bg-surface-2 border border-border rounded-xl pl-11 pr-4 text-sm font-medium focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand/30 transition-all placeholder:text-tx-mut"
            />
          </div>

          <div className="flex-1 md:hidden" />

          <div className="flex items-center gap-4 shrink-0">
            <div className="hidden lg:flex flex-col items-end">
              <span className="text-sm font-bold tracking-tight text-tx-pri">
                {currentEmployee?.name || "Sin sesión"}
              </span>
              <span
                className={`text-[10px] font-black uppercase tracking-widest ${
                  shiftOpen === false ? "text-danger" : ""
                }`}
                style={{ color: shiftOpen !== false ? "var(--brand)" : undefined }}
              >
                {shiftOpen === false ? "TURNO CERRADO" : shiftOpen ? "TURNO ACTIVO" : (currentEmployee?.role || "—")}
              </span>
            </div>
            
            <div className="w-10 h-10 rounded-full bg-surface-2 border border-border flex items-center justify-center text-xs font-black text-tx-pri" style={{ color: "var(--brand)" }}>
              {currentEmployee?.name?.charAt(0).toUpperCase() || "E"}
            </div>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="flex-1 overflow-hidden flex flex-col min-h-0">
          {children}
        </main>
      </div>

      <div className={`${mobileView === "ticket" ? "flex" : "hidden"} lg:flex w-full lg:w-auto min-h-0 relative z-20`}>
        <SidebarTicket />
      </div>

      {/* MOBILE FAB: TOGGLE MENU/TICKET */}
      <button
        onClick={() => setMobileView(mobileView === "menu" ? "ticket" : "menu")}
        className="lg:hidden fixed bottom-6 right-6 z-50 h-16 w-16 rounded-full text-brand-fg shadow-[0_0_24px_rgba(255,132,0,0.4)] flex items-center justify-center active:scale-95 transition-all"
        style={{ background: "var(--brand)" }}
        aria-label={mobileView === "menu" ? "Ver ticket" : "Ver menú"}
      >
        {mobileView === "menu" ? (
          <div className="relative">
            <ShoppingCart size={24} />
            {itemCount > 0 && (
              <span className="absolute -top-2 -right-2 min-w-[20px] h-[20px] px-1 rounded-full bg-surface-0 text-brand text-[10px] font-black flex items-center justify-center mono border border-brand/20">
                {itemCount}
              </span>
            )}
          </div>
        ) : (
          <UtensilsCrossed size={24} />
        )}
      </button>
    </div>
  );
}
