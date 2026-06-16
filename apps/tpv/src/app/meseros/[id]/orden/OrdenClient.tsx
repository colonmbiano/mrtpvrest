"use client";
import React, { useState, useEffect, useMemo } from "react";
import {
  ChevronLeft,
  Search,
  Send,
  Minus,
  Plus,
  X,
  PlusCircle,
  Lock,
} from "lucide-react";
import CategoryRail from "@/components/pos/CategoryRail";
import ProductCard from "@/components/pos/ProductCard";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { apiOrQueue } from "@/lib/offline";
import { toast } from "sonner";
import { printKitchenTickets, type PrinterRecord, type TicketItem } from "@/lib/printer-tcp";
import { useKitchenConfig } from "@/hooks/usePrinters";
import { useActiveOrderStore } from "@/store/activeOrderStore";
import SeatCoursePicker from "@/components/pos/SeatCoursePicker";
import ProductConfigSheet from "@/components/waiter/ProductConfigSheet";
import {
  hasQuickOptions,
  splitModifierSelections,
} from "@/lib/modifiers";
import {
  modifierKey,
  type MenuItemVariant,
  type ModifierSelection,
  type Product,
} from "@/store/ticketStore";

type CartLine = {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  // Variante single-select + selecciones del configurador (modificadores,
  // complementos y variantes multi-select con id prefijado). El backend
  // re-lee los precios de DB; aquí solo viajan los ids.
  variantId?: string | null;
  variantName?: string | null;
  modifiers?: ModifierSelection[];
  notes?: string;
  // FASE 11 · COURSING — asignación opcional por item
  seatNumber?: number | null;
  course?: string | null;
};

// Dos taps al mismo producto con la misma configuración suman cantidad en
// vez de duplicar línea (mismo criterio que el TPV principal).
const lineKey = (l: Pick<CartLine, "menuItemId" | "variantId" | "modifiers" | "notes">) =>
  `${l.menuItemId}|${l.variantId ?? ""}|${modifierKey(l.modifiers)}|${l.notes ?? ""}`;

// Items previamente enviados a la orden. Se muestran solo-lectura: el
// mesero los ve para contexto pero no puede cancelarlos ni modificarlos
// sin un flujo separado con PIN de gerente. La cancelación de items ya
// enviados a cocina debe pasar por revisión administrativa.
type LockedItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
};

export default function WaiterOrderPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const tableId = params.id;

  // Si llegamos con orden activa cargada en el store, este flujo agrega
  // una RONDA. Si no, crea una orden nueva (comportamiento legacy).
  const activeOrderId = useActiveOrderStore((s) => s.activeOrderId);
  const activeTableId = useActiveOrderStore((s) => s.activeTableId);
  const activeOrderNumber = useActiveOrderStore((s) => s.activeOrderNumber);
  const clearActiveOrder = useActiveOrderStore((s) => s.clear);

  // Sólo aceptamos el orderId del store si fue registrado para ESTA mesa.
  // Evita que un orderId stale (de otra mesa) se aplique aquí por accidente.
  const isAppendMode = Boolean(activeOrderId && activeTableId === tableId);

  const [categories, setCategories] = useState<any[]>([{ id: "all", name: "Todos" }]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCat, setActiveCat] = useState("all");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [lockedItems, setLockedItems] = useState<LockedItem[]>([]);
  const [lockedTotal, setLockedTotal] = useState(0);
  const [showSheet, setShowSheet] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // FASE 11 · COURSING — picker abierto para qué línea del carrito.
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  // Producto con variantes/modificadores pendiente de configurar.
  const [configProduct, setConfigProduct] = useState<Product | null>(null);
  // Nombre real de la mesa — el param de la ruta es el id (cuid), no apto
  // para mostrarse en el header ni en el ticket de cocina.
  const [tableName, setTableName] = useState<string | null>(null);

  // Cache de impresoras de la sucursal — usadas para imprimir comanda
  // local en cocina/barra desde la tablet del mesero (misma LAN). Sólo
  // imprimimos desde cliente cuando creamos orden nueva. En modo ronda,
  // el backend imprime los items en cocina (ver orders.routes.js:369).
  const [printers, setPrinters] = useState<PrinterRecord[]>([]);
  const { kitchenConfig } = useKitchenConfig();

  useEffect(() => {
    (async () => {
      try {
        const [catsRes, itemsRes, printersRes, tableRes] = await Promise.all([
          api.get("/api/menu/categories"),
          api.get("/api/menu/items"),
          api.get<PrinterRecord[]>("/api/printers").catch(() => ({ data: [] as PrinterRecord[] })),
          api.get<{ name?: string }>(`/api/tables/${tableId}`).catch(() => ({ data: {} as { name?: string } })),
        ]);
        setCategories([{ id: "all", name: "Todos" }, ...catsRes.data]);
        setProducts(itemsRes.data);
        setPrinters(Array.isArray(printersRes.data) ? printersRes.data : []);
        if (tableRes.data?.name) setTableName(tableRes.data.name);
      } catch {
        toast.error("No se pudo cargar el menu");
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Si el store tiene un orderId stale de OTRA mesa, lo limpiamos al entrar
  // — el usuario probablemente venia de otra orden y abrio una mesa distinta.
  useEffect(() => {
    if (activeOrderId && activeTableId && activeTableId !== tableId) {
      clearActiveOrder();
    }
  }, [activeOrderId, activeTableId, tableId, clearActiveOrder]);

  // Carga de items previamente enviados a la orden activa. Estos se muestran
  // bloqueados (con candado, sin botones de cancelar/cambiar cantidad). Para
  // anularlos se requiere un flujo separado con PIN de gerente — esa pantalla
  // vive fuera del catálogo de mesero.
  useEffect(() => {
    let cancelled = false;
    // Diferido a microtask (ver impresoras): el reset síncrono de
    // lockedItems/lockedTotal ya no corre dentro del effect.
    queueMicrotask(() => {
      if (cancelled) return;
      if (!isAppendMode || !activeOrderId) {
        setLockedItems([]);
        setLockedTotal(0);
        return;
      }
      (async () => {
        try {
          const { data } = await api.get(`/api/orders/${activeOrderId}`);
          if (cancelled) return;
          const items: LockedItem[] = (data?.items || []).map((it: any) => {
            const qty = Number(it.quantity ?? 1);
            const unit = Number(it.unitPrice ?? it.price ?? 0);
            return {
              id: String(it.id),
              name: it.name || it.menuItem?.name || "Producto",
              price: unit,
              quantity: qty,
              subtotal: Number(it.subtotal ?? unit * qty),
            };
          });
          setLockedItems(items);
          setLockedTotal(Number(data?.total ?? 0));
        } catch {
          if (!cancelled) {
            setLockedItems([]);
            setLockedTotal(0);
          }
        }
      })();
    });
    return () => {
      cancelled = true;
    };
  }, [isAppendMode, activeOrderId]);

  const filtered = useMemo(() => {
    let list = activeCat === "all" ? products : products.filter((p) => p.categoryId === activeCat);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [products, activeCat, search]);

  // Inserta una línea consolidando contra las existentes (misma config →
  // suma cantidad). Usada por el tap directo y por el configurador.
  const mergeLine = (line: CartLine) => {
    setCart((prev) => {
      const key = lineKey(line);
      const idx = prev.findIndex((l) => lineKey(l) === key);
      if (idx >= 0) {
        const next = [...prev];
        const current = next[idx];
        if (!current) return prev;
        next[idx] = { ...current, quantity: current.quantity + line.quantity };
        return next;
      }
      return [...prev, line];
    });
  };

  const addToCart = (p: Product) => {
    // Producto con variantes/modificadores/complementos → configurador.
    if (hasQuickOptions(p)) {
      setConfigProduct(p);
      return;
    }
    const price = Number(p.promoPrice ?? p.price ?? 0);
    mergeLine({ menuItemId: p.id, name: p.name, price, quantity: 1 });
  };

  const handleConfigConfirm = (payload: {
    variant: MenuItemVariant | null;
    modifiers: ModifierSelection[];
    unitPrice: number;
    quantity: number;
    notes?: string;
  }) => {
    if (!configProduct) return;
    mergeLine({
      menuItemId: configProduct.id,
      name: payload.variant
        ? `${configProduct.name} (${payload.variant.name})`
        : configProduct.name,
      price: payload.unitPrice,
      quantity: payload.quantity,
      variantId: payload.variant?.id ?? null,
      variantName: payload.variant?.name ?? null,
      modifiers: payload.modifiers,
      notes: payload.notes,
    });
    setConfigProduct(null);
  };

  // Las líneas se identifican por índice: el mismo menuItemId puede existir
  // varias veces con configuración distinta.
  const changeQty = (index: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((l, i) => (i === index ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0)
    );
  };

  const removeLine = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const cartCount = cart.reduce((acc, l) => acc + l.quantity, 0);
  const total = cart.reduce((acc, l) => acc + l.price * l.quantity, 0);

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = { all: products.length };
    for (const p of products) {
      const k = p.categoryId || "_unknown";
      map[k] = (map[k] || 0) + 1;
    }
    return map;
  }, [products]);

  const handleSend = async () => {
    if (cart.length === 0) return;
    setSubmitting(true);
    try {
      // Shape canónico del backend (mismo que el TPV principal): el precio
      // NO viaja — el servidor re-lee item/variante/modificadores de DB.
      // `notes` queda solo para el texto libre del mesero.
      const itemsPayload = cart.map((l) => ({
        menuItemId: l.menuItemId,
        quantity: l.quantity,
        notes: l.notes || "",
        seatNumber: l.seatNumber ?? null,
        course: l.course ?? null,
        variantId: l.variantId ?? null,
        ...splitModifierSelections(l.modifiers || []),
      }));

      // Items para impresión LAN (no depende de internet — la cocina
      // tiene impresoras en la red local del restaurante, así que vale
      // imprimir aunque estemos sin internet).
      const printItems: TicketItem[] = cart.map((l) => ({
        name: l.name,
        quantity: l.quantity,
        price: l.price,
        notes: l.notes ?? null,
        seatNumber: l.seatNumber ?? null,
        modifiers: (l.modifiers || []).map((m) => ({ name: m.name, priceAdd: m.priceAdd })),
      }));

      if (isAppendMode && activeOrderId) {
        // Modo RONDA: agrega items a la orden existente. El backend tagea
        // los items con un nuevo roundNumber y manda a cocina solo lo nuevo.
        const res = await apiOrQueue<{ id: string }>(
          "order",
          "POST",
          `/api/orders/${activeOrderId}/items`,
          { items: itemsPayload }
        );

        if (!res.ok) {
          toast.error("Error al enviar: " + (res.error || ""));
          return;
        }

        if (res.queued) {
          toast.success(
            `Ronda en cola · se enviará al volver la red (#${activeOrderNumber || activeOrderId.slice(-6).toUpperCase()})`
          );
        } else {
          toast.success(
            `Ronda agregada a #${activeOrderNumber || activeOrderId.slice(-6).toUpperCase()}`
          );
        }
        clearActiveOrder();
      } else {
        // Modo ORDEN NUEVA: crea la cuenta de la mesa. `orderType` es el
        // nombre que valida el backend (`type` lo dejaba caer al camino
        // TAKEOUT: sin ronda 1 y sin marcar la mesa OCCUPIED). Totales y
        // precios los calcula el servidor.
        const res = await apiOrQueue<{ id: string; orderNumber?: string }>(
          "order",
          "POST",
          "/api/orders/tpv",
          {
            orderType: "DINE_IN",
            tableId,
            items: itemsPayload,
          }
        );

        if (!res.ok) {
          toast.error("Error al enviar: " + (res.error || ""));
          return;
        }

        if (res.queued) {
          toast.success("Comanda en cola · se sincronizará al volver la red");
        } else {
          toast.success("Comanda enviada a cocina");
        }

        // Imprimir comanda LAN — la cocina recibe igual aunque estemos
        // offline. En modo queued no tenemos orderNumber real todavía,
        // así que mandamos null y la impresora pondrá un placeholder
        // visible para que cocina sepa que es prepedido.
        printKitchenTickets(printers, {
          orderNumber: res.data?.orderNumber ?? null,
          orderType: "DINE_IN",
          tableNumber: tableName ?? tableId,
          items: printItems,
          config: kitchenConfig ?? undefined,
        })
          .then((p) => {
            if (p.failed.length > 0) {
              toast.warning(`Comanda: ${p.ok} ok / ${p.failed.length} fallaron`);
            }
          })
          .catch(() => {
            /* silencio */
          });
      }

      router.push(`/meseros/${tableId}`);
    } catch (e: any) {
      toast.error("Error al enviar: " + (e?.response?.data?.error || e?.message || ""));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="h-full flex flex-col bg-[var(--bg)] text-white"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      {/* HEADER */}
      <div className="px-4 py-3 bg-white/5 backdrop-blur-md border-b border-white/10 flex items-center gap-3 shrink-0">
        <button
          onClick={() => router.back()}
          className="w-12 h-12 min-h-[48px] rounded-2xl flex items-center justify-center bg-white/5 border border-white/10 active:scale-95 transition-transform"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-[10px] font-black tracking-[0.25em] text-white/40 uppercase">
            {isAppendMode ? "Agregar a comanda" : "Nueva comanda"}
          </span>
          <div className="flex items-baseline gap-2">
            <h2 className="text-lg font-black leading-none truncate">{tableName ?? "Mesa"}</h2>
            {isAppendMode && activeOrderNumber && (
              <span className="text-[11px] font-bold text-[var(--brand)]">
                · #{activeOrderNumber}
              </span>
            )}
          </div>
        </div>
        <div className="hidden sm:flex flex-col items-end px-3 py-1.5 rounded-2xl gap-0.5 bg-white/5 border border-white/10">
          <span className="text-[9px] font-bold tracking-wider text-white/40">EN COMANDA</span>
          <span className="text-sm font-bold tabular-nums">
            {cartCount} {cartCount === 1 ? "producto" : "productos"}
          </span>
        </div>
        <div className="flex flex-col items-end px-3 py-1.5 rounded-2xl gap-0.5 bg-[var(--success-soft)] border border-[var(--success)]">
          <span className="text-[9px] font-bold tracking-wider text-[var(--success)]">TOTAL</span>
          <span className="text-sm font-bold tabular-nums text-[var(--success)]">
            ${total.toFixed(2)}
          </span>
        </div>
      </div>

      {/* APPEND BANNER */}
      {isAppendMode && (
        <div className="px-4 py-3 bg-[var(--brand-soft)] border-b border-[var(--brand)] flex items-center gap-3 shrink-0">
          <PlusCircle size={16} className="text-[var(--brand)] shrink-0" />
          <span className="text-[12px] font-bold text-[var(--brand)]">
            Esta ronda se sumará a la cuenta abierta
          </span>
        </div>
      )}

      {/* SEARCH */}
      <div className="p-4 bg-white/[0.02] border-b border-white/5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={14} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto..."
            className="w-full h-12 min-h-[48px] bg-white/5 border border-white/10 rounded-2xl pl-10 pr-4 text-[13px] focus:outline-none focus:border-[var(--brand)] text-white placeholder:text-white/30"
          />
        </div>
      </div>

      {/* CATEGORIES */}
      <CategoryRail
        categories={categories}
        activeId={activeCat}
        onSelect={setActiveCat}
        counts={categoryCounts}
      />

      {/* PRODUCTS GRID */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
        {isLoading ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 pb-40">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="aspect-square bg-white/5 animate-pulse rounded-3xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-white/40 text-[13px] py-12">Sin productos</div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 pb-40">
            {filtered.map((product) => (
              <ProductCard
                key={product.id}
                id={product.id}
                name={product.name}
                price={product.price}
                imageUrl={product.imageUrl}
                promoPrice={product.promoPrice}
                onClick={() => addToCart(product)}
              />
            ))}
          </div>
        )}
      </div>

      {/* BOTTOM TICKET BAR */}
      <div className="absolute bottom-0 left-0 right-0 px-4 pt-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))] border-t border-white/5 bg-[var(--bg)] backdrop-blur-xl flex flex-col gap-3 shadow-2xl">
        <button
          onClick={() => cartCount > 0 && setShowSheet(true)}
          className="h-14 min-h-[56px] bg-white/5 border border-white/10 rounded-2xl flex items-center px-4 gap-3 active:scale-95 transition-all disabled:opacity-50"
          disabled={cartCount === 0}
        >
          <div className="w-8 h-8 rounded-xl bg-[var(--brand-soft)] text-[var(--brand)] flex items-center justify-center font-black text-xs">
            {cartCount}
          </div>
          <div className="flex-1 text-left">
            <div className="text-[10px] font-bold text-white/40 uppercase tracking-tighter leading-none">
              Comanda
            </div>
            <div className="tabular-nums text-[14px] font-black">${total.toFixed(2)}</div>
          </div>
          <ChevronLeft className="rotate-90 text-white/40" size={16} />
        </button>

        <button
          type="button"
          disabled={cartCount === 0 || submitting}
          onClick={handleSend}
          className="w-full min-h-[64px] h-16 rounded-3xl bg-[var(--brand)] text-[var(--brand-fg)] font-black uppercase tracking-[0.1em] text-sm gap-3 shadow-[0_10px_30px_var(--brand-glow)] active:scale-95 transition-transform flex items-center justify-center disabled:opacity-50 disabled:active:scale-100"
        >
          <Send size={18} strokeWidth={2.5} />
          {submitting
            ? "Enviando..."
            : isAppendMode
            ? "Agregar a la mesa"
            : "Enviar a cocina"}
        </button>
      </div>

      {/* CONFIGURADOR de variantes / modificadores / complementos */}
      {configProduct && (
        <ProductConfigSheet
          product={configProduct}
          onClose={() => setConfigProduct(null)}
          onConfirm={handleConfigConfirm}
        />
      )}

      {/* FASE 11 · PICKER de asiento + tiempo */}
      {pickerIndex != null && cart[pickerIndex] && (
        <SeatCoursePicker
          open
          itemName={cart[pickerIndex].name}
          seatNumber={cart[pickerIndex].seatNumber ?? null}
          course={cart[pickerIndex].course ?? null}
          guestsHint={null}
          onClose={() => setPickerIndex(null)}
          onConfirm={(seat, crs) => {
            setCart((prev) => {
              const next = [...prev];
              if (next[pickerIndex]) {
                next[pickerIndex] = {
                  ...next[pickerIndex],
                  seatNumber: seat,
                  course: crs,
                };
              }
              return next;
            });
          }}
        />
      )}

      {/* CART SHEET */}
      {showSheet && (
        <div
          className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowSheet(false)}
        >
          <div
            className="absolute bottom-0 left-0 right-0 max-h-[85%] bg-[var(--bg)] border-t border-white/10 rounded-t-3xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-white/5 flex items-center justify-between shrink-0">
              <div>
                <div className="text-[10px] font-black tracking-[0.25em] text-white/40 uppercase">
                  {isAppendMode ? "Ronda nueva" : "Comanda"}
                </div>
                <div className="text-[16px] font-black">{tableName ?? "Mesa"}</div>
              </div>
              <button
                onClick={() => setShowSheet(false)}
                className="w-12 h-12 min-h-[48px] rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/70"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
              {/* SECCIÓN LOCKED — items ya enviados (solo lectura) */}
              {isAppendMode && lockedItems.length > 0 && (
                <section className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <Lock size={12} className="text-white/40" />
                    <span className="text-[10px] font-black tracking-[0.25em] text-white/40 uppercase">
                      Ya en la cuenta · {lockedItems.length} item
                      {lockedItems.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="space-y-2 opacity-70">
                    {lockedItems.map((l) => (
                      <div
                        key={l.id}
                        className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/10"
                      >
                        <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 shrink-0">
                          <Lock size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-bold truncate text-white/80">
                            <span className="text-white/50 mr-2">{l.quantity}×</span>
                            {l.name}
                          </div>
                          <div className="tabular-nums text-[11px] text-white/40">
                            ${l.price.toFixed(2)} c/u
                          </div>
                        </div>
                        <div className="tabular-nums text-[13px] font-black text-white/80 shrink-0">
                          ${l.subtotal.toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] font-bold text-white/40 px-1 leading-relaxed">
                    Para cancelar un producto ya enviado a cocina pídele al
                    gerente que lo anule desde el TPV principal.
                  </p>
                </section>
              )}

              {/* SECCIÓN EDITABLE — ronda actual */}
              <section className="space-y-2">
                {isAppendMode && (
                  <div className="flex items-center gap-2 px-1">
                    <PlusCircle size={12} className="text-[var(--brand)]" />
                    <span className="text-[10px] font-black tracking-[0.25em] text-[var(--brand)] uppercase">
                      Agregando ahora · {cartCount} item
                      {cartCount === 1 ? "" : "s"}
                    </span>
                  </div>
                )}
                {cart.length === 0 ? (
                  <p className="text-center text-white/30 text-[12px] font-bold uppercase tracking-widest py-8">
                    Sin items nuevos
                  </p>
                ) : (
                  cart.map((l, idx) => {
                    const seatLabel =
                      typeof l.seatNumber === "number" ? `Asiento ${l.seatNumber}` : "+ Asiento";
                    const courseLabel = l.course ? l.course : "+ Tiempo";
                    const seatActive = typeof l.seatNumber === "number";
                    const courseActive = Boolean(l.course);
                    return (
                      <div
                        key={`${lineKey(l)}-${idx}`}
                        className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-2.5"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-bold truncate">
                              {l.name}
                            </div>
                            {(l.modifiers?.length ?? 0) > 0 && (
                              <div className="text-[11px] text-white/40 font-bold truncate">
                                {(l.modifiers || []).map((m) => m.name).join(" · ")}
                              </div>
                            )}
                            {l.notes && (
                              <div className="text-[11px] text-[var(--brand)] font-bold truncate">
                                “{l.notes}”
                              </div>
                            )}
                            <div className="tabular-nums text-[12px] text-white/50">
                              ${l.price.toFixed(2)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => changeQty(idx, -1)}
                              className="w-10 h-10 min-h-[40px] rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:scale-95 transition-transform"
                              aria-label="Restar"
                            >
                              <Minus size={14} />
                            </button>
                            <span className="tabular-nums text-[14px] font-black w-6 text-center">
                              {l.quantity}
                            </span>
                            <button
                              onClick={() => changeQty(idx, 1)}
                              className="w-10 h-10 min-h-[40px] rounded-xl bg-[var(--brand-soft)] border border-[var(--brand)] text-[var(--brand)] flex items-center justify-center active:scale-95 transition-transform"
                              aria-label="Sumar"
                            >
                              <Plus size={14} />
                            </button>
                            <button
                              onClick={() => removeLine(idx)}
                              className="ml-1 w-10 h-10 min-h-[40px] rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/50 active:scale-95 transition-transform"
                              aria-label={`Quitar ${l.name}`}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>

                        {/* FASE 11 · CHIPS de asiento + tiempo */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPickerIndex(idx)}
                            className={`flex-1 h-9 px-3 rounded-xl border text-[10px] font-black uppercase tracking-[0.15em] active:scale-95 transition-transform truncate ${
                              seatActive
                                ? "bg-[var(--brand-soft)] border-[var(--brand)] text-[var(--brand)]"
                                : "bg-white/[0.03] border-white/10 text-white/40"
                            }`}
                          >
                            {seatLabel}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPickerIndex(idx)}
                            className={`flex-1 h-9 px-3 rounded-xl border text-[10px] font-black uppercase tracking-[0.15em] active:scale-95 transition-transform truncate ${
                              courseActive
                                ? "bg-[var(--brand-soft)] border-[var(--brand)] text-[var(--brand)]"
                                : "bg-white/[0.03] border-white/10 text-white/40"
                            }`}
                          >
                            {courseLabel}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </section>
            </div>

            {/* TOTALES */}
            <div className="p-4 border-t border-white/5 space-y-2 shrink-0">
              {isAppendMode && lockedItems.length > 0 && (
                <>
                  <div className="flex items-center justify-between text-[12px] font-bold text-white/50">
                    <span>Ya en la cuenta</span>
                    <span className="tabular-nums">${lockedTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[12px] font-bold text-[var(--brand)]">
                    <span>Ronda nueva</span>
                    <span className="tabular-nums">+ ${total.toFixed(2)}</span>
                  </div>
                  <div className="h-px bg-white/10 my-1" />
                </>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black tracking-[0.25em] text-white/40 uppercase">
                  {isAppendMode && lockedItems.length > 0
                    ? "Total cuenta"
                    : "Total"}
                </span>
                <span className="tabular-nums text-2xl font-black">
                  $
                  {(
                    (isAppendMode && lockedItems.length > 0
                      ? lockedTotal
                      : 0) + total
                  ).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
