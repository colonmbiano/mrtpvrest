"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Armchair, ShoppingBag, Bike, Bell, Truck, RefreshCcw, ChevronRight } from "lucide-react";
import api from "@/lib/api";
import POSShell from "@/components/tpv/POSShell";
import SideRail, { type RailSection } from "@/components/tpv/SideRail";
import CategoryTabs, { type Category } from "@/components/tpv/CategoryTabs";
import ProductGrid from "@/components/tpv/ProductGrid";
import TicketPanel, {
  type TicketLine,
  type TicketTab,
  type OrderType,
  type OrderTypeOption,
} from "@/components/tpv/TicketPanel";
import ModalStack from "@/components/tpv/ModalStack";
import { useModals } from "@/contexts/ModalContext";
import { usePOSStore } from "@/store/usePOSStore";
import { toast } from "sonner";

type ApiProduct = {
  id: string;
  name: string;
  price: number;
  imageUrl?: string | null;
  categoryId?: string;
  category?: { id: string; name: string };
  isAvailable?: boolean;
};

type ActiveOrder = {
  id: string;
  customerName: string;
  total: number;
  type: OrderType;
  status: "PENDING" | "PREPARING" | "READY" | "DELIVERED";
  address?: string;
  tableName?: string | null;
  driverName?: string | null;
};

const MOCK_CATEGORIES: Category[] = [
  { id: "ent",   name: "Entradas" },
  { id: "prin",  name: "Principales" },
  { id: "esp",   name: "Especiales" },
  { id: "beb",   name: "Bebidas" },
];

const MOCK_PRODUCTS: ApiProduct[] = [
  { id: "p1", name: "Burger Especial",  price: 12.5, categoryId: "prin", imageUrl: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80" },
  { id: "p2", name: "Pasta Carbonara",  price: 10.9, categoryId: "prin", imageUrl: "https://images.unsplash.com/photo-1612874742237-6526221588e3?w=400&q=80" },
  { id: "p3", name: "Ensalada César",   price: 8.5,  categoryId: "ent",  imageUrl: "https://images.unsplash.com/photo-1546793665-c74683f339c1?w=400&q=80" },
  { id: "p4", name: "Tacos Al Pastor",  price: 9.0,  categoryId: "esp",  imageUrl: "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=400&q=80" },
  { id: "p5", name: "Pizza Margherita", price: 11.0, categoryId: "prin", imageUrl: "https://images.unsplash.com/photo-1604068549290-dea0e4a305ca?w=400&q=80" },
  { id: "p6", name: "Limonada Natural", price: 3.5,  categoryId: "beb",  imageUrl: "https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=400&q=80" },
];

const ORDER_TYPE_OPTIONS: OrderTypeOption[] = [
  { id: "DINE_IN",  label: "Mesa",      icon: <Armchair size={12} /> },
  { id: "TAKEOUT",  label: "Llevar",    icon: <ShoppingBag size={12} /> },
  { id: "DELIVERY", label: "Domicilio", icon: <Bike size={12} /> },
];

type TicketState = {
  lines: TicketLine[];
  customerName: string;
  customerPhone: string;
  orderType: OrderType;
  tableName: string | null;
  address: string;
};

const emptyTicket = (): TicketState => ({
  lines: [],
  customerName: "",
  customerPhone: "",
  orderType: "TAKEOUT",
  tableName: null,
  address: "",
});

export default function POSv2Page() {
  const router = useRouter();
  const { openPayment, openConfirm, openDiscount, openOrderDetail, openDeliveryAssign, openChangeOrderType } = useModals();
  const themeChosen = usePOSStore((s) => s.themeChosen);
  const hasHydrated = usePOSStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    const linked = !!localStorage.getItem("restaurantId") && !!localStorage.getItem("locationId");
    if (linked && !themeChosen) router.replace("/setup?step=appearance");
  }, [hasHydrated, themeChosen, router]);

  const [section, setSection] = useState<RailSection>("catalog");
  const [categories, setCategories] = useState<Category[]>(MOCK_CATEGORIES);
  const [products, setProducts] = useState<ApiProduct[]>(MOCK_PRODUCTS);
  const [selectedCat, setSelectedCat] = useState("all");
  const [search, setSearch] = useState("");

  const [tabs, setTabs] = useState<TicketTab[]>([{ id: "1", name: "Ticket 1" }]);
  const [activeTabId, setActiveTabId] = useState("1");
  const [stateByTab, setStateByTab] = useState<Record<string, TicketState>>({ "1": emptyTicket() });

  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([
    { id: "ord-001", customerName: "Mesa 4",       total: 28.5,  type: "DINE_IN",  status: "PREPARING", tableName: "M4" },
    { id: "ord-002", customerName: "Carlos R.",    total: 15.0,  type: "TAKEOUT",  status: "READY" },
    { id: "ord-003", customerName: "Ana Martínez", total: 42.75, type: "DELIVERY", status: "PREPARING", address: "Av. Reforma 215", driverName: null },
  ]);
  const [showOrders, setShowOrders] = useState(false);

  const ticket = stateByTab[activeTabId] ?? emptyTicket();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [catRes, prodRes] = await Promise.allSettled([
          api.get("/api/categories"),
          api.get("/api/products"),
        ]);
        if (cancelled) return;
        if (catRes.status === "fulfilled" && Array.isArray(catRes.value.data)) {
          const cats = catRes.value.data
            .filter((c: any) => c?.id && c?.name)
            .map((c: any) => ({ id: c.id, name: c.name }));
          if (cats.length) setCategories(cats);
        }
        if (prodRes.status === "fulfilled" && Array.isArray(prodRes.value.data)) {
          const prods = prodRes.value.data.map((p: any) => ({
            id: p.id, name: p.name, price: Number(p.price ?? 0),
            categoryId: p.categoryId ?? p.category?.id, category: p.category,
            imageUrl: p.imageUrl ?? null, isAvailable: p.isAvailable !== false,
          }));
          if (prods.length) setProducts(prods);
        }
      } catch { /* keep mock */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => products
    .filter((p) => p.isAvailable !== false)
    .filter((p) => selectedCat === "all" || p.categoryId === selectedCat)
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    .map((p) => ({
      id: p.id, name: p.name, price: p.price,
      category: categories.find((c) => c.id === p.categoryId)?.name,
      imageUrl: p.imageUrl ?? null,
    })),
  [products, categories, selectedCat, search]);

  const subtotal = useMemo(
    () => ticket.lines.reduce((s, l) => s + l.price * l.quantity, 0),
    [ticket.lines]
  );

  const patchTicket = (patch: Partial<TicketState>) =>
    setStateByTab((m) => ({ ...m, [activeTabId]: { ...(m[activeTabId] ?? emptyTicket()), ...patch } }));

  const handlePick = (p: { id: string; name: string; price: number }) => {
    const lines = ticket.lines;
    const existing = lines.find((l) => l.id === p.id);
    const next = existing
      ? lines.map((l) => (l.id === p.id ? { ...l, quantity: l.quantity + 1 } : l))
      : [...lines, { id: p.id, name: p.name, price: p.price, quantity: 1 }];
    patchTicket({ lines: next });
  };

  const handleQty = (id: string, delta: number) =>
    patchTicket({
      lines: ticket.lines
        .map((l) => (l.id === id ? { ...l, quantity: Math.max(0, l.quantity + delta) } : l))
        .filter((l) => l.quantity > 0),
    });

  const handleRemove = (id: string) =>
    patchTicket({ lines: ticket.lines.filter((l) => l.id !== id) });

  const handleAddTab = () => {
    const newId = String(Date.now());
    setTabs([...tabs, { id: newId, name: `Ticket ${tabs.length + 1}` }]);
    setStateByTab((m) => ({ ...m, [newId]: emptyTicket() }));
    setActiveTabId(newId);
  };

  const handleCloseTab = (id: string) => {
    if (tabs.length <= 1) return;
    const remaining = tabs.filter((t) => t.id !== id);
    setTabs(remaining);
    setStateByTab((m) => {
      const { [id]: _, ...rest } = m;
      return rest;
    });
    if (activeTabId === id) setActiveTabId(remaining[remaining.length - 1]!.id);
  };

  const handleProcesar = () =>
    ticket.lines.length > 0 && openPayment({
      id: activeTabId, total: subtotal,
      items: ticket.lines.map((l) => ({ id: l.id, name: l.name, quantity: l.quantity, price: l.price })),
      customerName: ticket.customerName || undefined,
      table: ticket.tableName,
    });

  const handlePendiente = () =>
    openConfirm({
      title: "¿Marcar como pendiente?",
      message: "El ticket se enviará al panel de cobros pendientes.",
      confirmLabel: "Sí, dejar pendiente",
      onConfirm: () => patchTicket({ lines: [], customerName: "", customerPhone: "", address: "" }),
    });

  const handleSendToKitchen = () => {
    if (ticket.lines.length === 0) return;
    const newOrder: ActiveOrder = {
      id: `ord-${Date.now()}`,
      customerName: ticket.customerName || (ticket.tableName ? `Mesa ${ticket.tableName}` : "Mostrador"),
      total: subtotal,
      type: ticket.orderType,
      status: "PREPARING",
      address: ticket.orderType === "DELIVERY" ? ticket.address : undefined,
      tableName: ticket.orderType === "DINE_IN" ? ticket.tableName : null,
    };
    setActiveOrders((os) => [newOrder, ...os]);
    patchTicket({ lines: [] });
    toast.success("Pedido enviado a cocina");
  };

  const handleDiscount = () =>
    ticket.lines.length > 0 && openDiscount(activeTabId, subtotal);

  const handleClear = () =>
    openConfirm({
      title: "Limpiar ticket",
      message: "Se borrarán los productos y los datos del cliente.",
      confirmLabel: "Sí, limpiar",
      tone: "danger",
      onConfirm: () => patchTicket(emptyTicket()),
    });

  const handlePickTable = () => {
    const n = prompt("Número de mesa");
    if (n) patchTicket({ tableName: n.trim() });
  };

  // ── Active orders actions ──────────────────────────────────
  const onChangeOrderTypeApply = async (
    orderId: string,
    patch: { type: OrderType; address?: string; tableName?: string }
  ) => {
    setActiveOrders((os) =>
      os.map((o) =>
        o.id === orderId
          ? {
              ...o,
              type: patch.type,
              address: patch.address ?? o.address,
              tableName: patch.type === "DINE_IN" ? (patch.tableName ?? o.tableName) : null,
              driverName: patch.type === "DELIVERY" ? o.driverName : null,
            }
          : o
      )
    );
  };

  const onDeliveryAssigned = () => {
    toast.success("Repartidor asignado");
  };

  return (
    <>
      <POSShell
        rail={
          <SideRail
            section={section}
            onSection={(s) => {
              setSection(s);
              if (s === "receipts") setShowOrders((v) => !v);
            }}
          />
        }
        main={
          <div className="flex flex-col h-full p-4 gap-4 overflow-hidden">
            <div className="flex items-center justify-between">
              <CategoryTabs categories={categories} selected={selectedCat} onSelect={setSelectedCat} />
              <button
                onClick={() => setShowOrders((v) => !v)}
                className="ml-3 h-10 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2"
                style={{
                  background: showOrders ? "var(--brand)" : "var(--surface-2)",
                  color: showOrders ? "var(--brand-fg)" : "var(--text-secondary)",
                  border: "1px solid var(--border)",
                  letterSpacing: "0.06em",
                }}
              >
                <Bell size={14} /> Pedidos activos · {activeOrders.length}
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <ProductGrid
                products={filtered}
                onPick={handlePick}
                searchValue={search}
                onSearchChange={setSearch}
                cols={3}
                currency="$"
              />
            </div>
          </div>
        }
        ticket={
          <TicketPanel
            tabs={tabs}
            activeTabId={activeTabId}
            onTabSelect={setActiveTabId}
            onTabAdd={handleAddTab}
            onTabClose={handleCloseTab}
            table={ticket.tableName}

            customerName={ticket.customerName}
            customerPhone={ticket.customerPhone}
            onCustomerNameChange={(v) => patchTicket({ customerName: v })}
            onCustomerPhoneChange={(v) => patchTicket({ customerPhone: v })}

            orderType={ticket.orderType}
            orderTypeOptions={ORDER_TYPE_OPTIONS}
            onOrderTypeChange={(t) => patchTicket({ orderType: t })}

            tableLabel={ticket.tableName}
            onPickTable={handlePickTable}
            onClearTable={() => patchTicket({ tableName: null })}
            address={ticket.address}
            onAddressChange={(v) => patchTicket({ address: v })}

            lines={ticket.lines}
            onLineQty={handleQty}
            onLineRemove={handleRemove}

            onSendToKitchen={handleSendToKitchen}
            onDiscount={handleDiscount}
            onClear={handleClear}

            subtotal={subtotal}
            total={subtotal}
            currency="$"
            onPrimary={handleProcesar}
            onSecondaryLeft={handlePendiente}
            onSecondaryRight={handlePendiente}
          />
        }
      />

      {/* Active orders side-drawer */}
      {showOrders && (
        <ActiveOrdersDrawer
          orders={activeOrders}
          onClose={() => setShowOrders(false)}
          onChangeType={(o) => openChangeOrderType({
            orderId: o.id,
            currentType: o.type,
            customerName: o.customerName,
            total: o.total,
            address: o.address,
            tableName: o.tableName,
          })}
          onAssignDriver={(o) => openDeliveryAssign({
            id: o.id,
            customerName: o.customerName,
            address: o.address ?? "",
            total: o.total,
          })}
          onDetail={(o) => openOrderDetail(o.id)}
          onCobrar={(o) => openPayment({
            id: o.id, total: o.total, items: [],
            customerName: o.customerName, table: o.tableName,
          })}
        />
      )}

      <ModalStack
        currency="$"
        onChangeOrderType={onChangeOrderTypeApply}
        onDeliveryAssigned={onDeliveryAssigned}
      />
    </>
  );
}

/* ── Active Orders Drawer ────────────────────────────────────── */

const TYPE_META: Record<OrderType, { label: string; Icon: typeof Armchair }> = {
  DINE_IN:  { label: "Mesa",      Icon: Armchair },
  TAKEOUT:  { label: "Llevar",    Icon: ShoppingBag },
  DELIVERY: { label: "Domicilio", Icon: Bike },
};

function ActiveOrdersDrawer({
  orders, onClose, onChangeType, onAssignDriver, onDetail, onCobrar,
}: {
  orders: ActiveOrder[];
  onClose: () => void;
  onChangeType: (o: ActiveOrder) => void;
  onAssignDriver: (o: ActiveOrder) => void;
  onDetail: (o: ActiveOrder) => void;
  onCobrar: (o: ActiveOrder) => void;
}) {
  return (
    <div className="fixed inset-0 z-[150] flex" onClick={onClose}>
      <div className="flex-1" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md h-full overflow-y-auto scrollbar-hide flex flex-col"
        style={{
          background: "var(--surface-1)",
          borderLeft: "1px solid var(--border)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <header
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              Activas
            </p>
            <h2
              className="text-lg font-extrabold"
              style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
            >
              Pedidos
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </header>

        <ul className="flex-1 flex flex-col gap-2 p-4">
          {orders.length === 0 && (
            <li className="text-sm text-center py-12" style={{ color: "var(--text-muted)" }}>
              No hay pedidos activos
            </li>
          )}
          {orders.map((o) => {
            const meta = TYPE_META[o.type];
            const Icon = meta.Icon;
            return (
              <li
                key={o.id}
                className="rounded-2xl p-4 flex flex-col gap-3"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-sm font-bold truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {o.customerName}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-widest"
                        style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
                      >
                        <Icon size={10} /> {meta.label}
                      </span>
                      <span
                        className="text-[10px] font-bold uppercase tracking-widest"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {o.status}
                      </span>
                    </div>
                  </div>
                  <span
                    className="text-base font-extrabold"
                    style={{ color: "var(--brand)", fontFamily: "var(--font-display)" }}
                  >
                    ${o.total.toFixed(2)}
                  </span>
                </div>

                {o.type === "DELIVERY" && (
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {o.address ?? "Sin dirección"}
                    {o.driverName && (
                      <>
                        {" · "}
                        <span style={{ color: "var(--brand)" }}>Repartidor: {o.driverName}</span>
                      </>
                    )}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-1.5">
                  <DrawerAction Icon={RefreshCcw} label="Cambiar tipo" onClick={() => onChangeType(o)} />
                  {o.type === "DELIVERY" && (
                    <DrawerAction
                      Icon={Truck}
                      label={o.driverName ? "Reasignar" : "Asignar repartidor"}
                      onClick={() => onAssignDriver(o)}
                      tone="brand"
                    />
                  )}
                  <DrawerAction Icon={ChevronRight} label="Detalle" onClick={() => onDetail(o)} />
                  <DrawerAction Icon={ShoppingBag} label="Cobrar" onClick={() => onCobrar(o)} tone="brand" />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function DrawerAction({
  Icon, label, onClick, tone,
}: {
  Icon: typeof RefreshCcw;
  label: string;
  onClick: () => void;
  tone?: "brand";
}) {
  const isBrand = tone === "brand";
  return (
    <button
      onClick={onClick}
      className="h-9 rounded-lg flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wider transition-all hover:brightness-110"
      style={{
        background: isBrand ? "var(--brand-soft)" : "var(--surface-3)",
        color: isBrand ? "var(--brand)" : "var(--text-secondary)",
        border: `1px solid ${isBrand ? "var(--brand)" : "var(--border)"}`,
        letterSpacing: "0.06em",
      }}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}
