"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronUp, Minus, Plus, RotateCw, Search, WifiOff, X } from "lucide-react";
import type { OrderStatus } from "@mrtpvrest/types";
import api from "@/lib/api";
import { apiOrQueue } from "@/lib/offline";
import { printKitchenTickets, type TicketItem } from "@/lib/printer";
import { usePrinterStore } from "@/store/usePrinterStore";
import { useWaiterOrderStore } from "@/store/useWaiterOrderStore";

interface MenuCategory {
  id: string;
  name: string;
}

interface MenuModifier {
  id: string;
  groupId?: string;
  name: string;
  priceAdd: number;
  isDefault?: boolean;
}

interface MenuModifierGroup {
  id: string;
  name: string;
  required?: boolean;
  multiSelect?: boolean;
  minSelection?: number;
  maxSelection?: number;
  freeModifiersLimit?: number;
  modifiers: MenuModifier[];
}

interface MenuVariant {
  id: string;
  name: string;
  price: number;
  isAvailable?: boolean;
}

interface MenuComplement {
  id: string;
  name: string;
  price: number;
  isAvailable?: boolean;
}

interface PrinterGroupRef {
  printerGroup?: { id: string } | null;
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  promoPrice?: number | null;
  categoryId?: string | null;
  isAvailable?: boolean;
  isFavorite?: boolean;
  isPopular?: boolean;
  isPromo?: boolean;
  hasVariants?: boolean;
  variants?: MenuVariant[];
  complements?: MenuComplement[];
  modifierGroups?: MenuModifierGroup[];
  // Enrutamiento a impresoras: override a nivel item, con fallback a la
  // categoría. El backend ya los incluye en GET /api/menu/items.
  printerGroups?: PrinterGroupRef[];
  category?: { printerGroups?: PrinterGroupRef[] } | null;
}

type CatalogStatus = "idle" | "loading" | "ready" | "offline" | "error";
type LiteOrderStatus = OrderStatus | "LOCAL_DRAFT";

const categoriesCacheKey = "meseros-lite-menu-categories";
const productsCacheKey = "meseros-lite-menu-products";
const ticketStatus: LiteOrderStatus = "LOCAL_DRAFT";
const complementPrefix = "complement:";

function money(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}

function readCache<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeCache<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

// Un producto está "en promo" si tiene el flag isPromo o un promoPrice válido
// (positivo y menor al precio normal). Usado por el strip de sugerencias de venta.
function isOnPromo(product: MenuItem): boolean {
  return Boolean(
    product.isPromo ||
      (typeof product.promoPrice === "number" &&
        product.promoPrice > 0 &&
        product.promoPrice < product.price),
  );
}

function printerGroupIdsOf(product: MenuItem | undefined): string[] {
  if (!product) return [];
  const pick = (refs?: PrinterGroupRef[]) =>
    (refs ?? []).map((r) => r.printerGroup?.id).filter((id): id is string => Boolean(id));
  const own = pick(product.printerGroups);
  return own.length > 0 ? own : pick(product.category?.printerGroups);
}

function hasConfigurableOptions(product: MenuItem) {
  return Boolean(
    product.variants?.some((variant) => variant.isAvailable !== false) ||
      product.modifierGroups?.some((group) => group.modifiers.length > 0) ||
      product.complements?.some((complement) => complement.isAvailable !== false),
  );
}

function computeUnitExtra(
  groups: MenuModifierGroup[],
  selections: Record<string, MenuModifier[]>,
) {
  return groups.reduce((sum, group) => {
    const selected = selections[group.id] || [];
    const free = group.freeModifiersLimit || 0;
    return (
      sum +
      [...selected]
        .sort((a, b) => a.priceAdd - b.priceAdd)
        .reduce((groupSum, modifier, index) => groupSum + (index >= free ? modifier.priceAdd : 0), 0)
    );
  }, 0);
}

function resolveVariantSelectionPrice(product: MenuItem, variants: MenuVariant[]) {
  const basePrice = Number(product.promoPrice || product.price || 0);
  const fullPrice = variants
    .map((variant) => Number(variant.price || 0))
    .filter((price) => price >= basePrice);
  const extras = variants
    .map((variant) => Number(variant.price || 0))
    .filter((price) => price > 0 && price < basePrice)
    .reduce((sum, price) => sum + price, 0);
  return Math.max(basePrice, ...fullPrice) + extras;
}

function variantPriceLabel(product: MenuItem, variant: MenuVariant) {
  const basePrice = Number(product.promoPrice || product.price || 0);
  const variantPrice = Number(variant.price || 0);
  if (variantPrice <= 0) return "Incluido";
  if (variantPrice < basePrice) return `+${money(variantPrice)}`;
  return money(variantPrice);
}

export default function MenuPage() {
  const router = useRouter();
  // Prefill desde caché como estado inicial lazy (no en un effect): evita el
  // setState síncrono de montaje y muestra el catálogo guardado al instante.
  const [categories, setCategories] = useState<MenuCategory[]>(() =>
    readCache<MenuCategory[]>(categoriesCacheKey, []),
  );
  const [products, setProducts] = useState<MenuItem[]>(() =>
    readCache<MenuItem[]>(productsCacheKey, []),
  );
  const [activeCategoryId, setActiveCategoryId] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<CatalogStatus>("loading");
  const [lastAddedName, setLastAddedName] = useState<string | null>(null);
  const [configProduct, setConfigProduct] = useState<MenuItem | null>(null);
  // Panel de comanda inferior (portrait): colapsado muestra solo el resumen
  // para dar más espacio al grid; expandido muestra toda la comanda con +/-.
  const [ticketExpanded, setTicketExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  // Nombre del cliente para pedidos PARA LLEVAR (sin mesa). Opcional; si se
  // deja vacío la comanda se rotula "Para llevar".
  const [takeoutName, setTakeoutName] = useState("");

  const ticketItems = useWaiterOrderStore((state) => state.ticketItems);
  const addItem = useWaiterOrderStore((state) => state.addItem);
  const incrementItem = useWaiterOrderStore((state) => state.incrementItem);
  const decrementItem = useWaiterOrderStore((state) => state.decrementItem);
  const clearTicket = useWaiterOrderStore((state) => state.clearTicket);
  const activeTableId = useWaiterOrderStore((state) => state.activeTableId);
  const activeTableName = useWaiterOrderStore((state) => state.activeTableName);
  const activeOrderId = useWaiterOrderStore((state) => state.activeOrderId);
  const previousItemCount = useWaiterOrderStore((state) => state.previousItemCount ?? 0);
  const previousTotal = useWaiterOrderStore((state) => state.previousTotal ?? 0);
  const previousItems = useWaiterOrderStore((state) => state.previousItems ?? []);

  // Fetch puro: sin setState síncrono antes del primer await, para que el
  // effect de montaje no dispare react-hooks/set-state-in-effect.
  const applyCatalog = async () => {
    try {
      const [categoriesResponse, productsResponse] = await Promise.all([
        api.get<MenuCategory[]>("/api/menu/categories"),
        api.get<MenuItem[]>("/api/menu/items"),
      ]);
      const nextCategories = Array.isArray(categoriesResponse.data) ? categoriesResponse.data : [];
      const nextProducts = Array.isArray(productsResponse.data) ? productsResponse.data : [];
      setCategories(nextCategories);
      setProducts(nextProducts);
      writeCache(categoriesCacheKey, nextCategories);
      writeCache(productsCacheKey, nextProducts);
      setStatus("ready");
    } catch {
      const cachedCategories = readCache<MenuCategory[]>(categoriesCacheKey, []);
      const cachedProducts = readCache<MenuItem[]>(productsCacheKey, []);
      setCategories(cachedCategories);
      setProducts(cachedProducts);
      setStatus(cachedProducts.length > 0 ? "offline" : "error");
    }
  };

  // Wrapper para eventos (botón reintentar): muestra el flash de carga.
  const loadCatalog = () => {
    setStatus("loading");
    void applyCatalog();
  };

  useEffect(() => {
    // applyCatalog sólo hace setState tras el await del fetch (microtask), no
    // es un cascading render síncrono; el rule lo marca por análisis estático.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void applyCatalog();
  }, []);

  const visibleProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory =
        activeCategoryId === "all" || product.categoryId === activeCategoryId;
      const matchesQuery =
        normalizedQuery.length === 0 || product.name.toLowerCase().includes(normalizedQuery);
      return matchesCategory && matchesQuery && product.isAvailable !== false;
    });
  }, [activeCategoryId, products, query]);

  // Sugerencias de venta: productos en promo + populares para que el mesero
  // los ofrezca (upsell). Promos primero. Usa el catálogo que ya está cargado
  // (incl. caché offline), sin llamadas extra. Tope de 10 para no saturar.
  const suggestions = useMemo(() => {
    return products
      .filter((product) => product.isAvailable !== false && (isOnPromo(product) || product.isPopular))
      .sort((a, b) => Number(isOnPromo(b)) - Number(isOnPromo(a)))
      .slice(0, 10);
  }, [products]);

  const total = ticketItems.reduce((sum, item) => sum + item.total, 0);
  const itemCount = ticketItems.reduce((sum, item) => sum + item.quantity, 0);
  const accumulatedItemCount = previousItemCount + itemCount;
  const accumulatedTotal = previousTotal + total;

  const handleAddItem = (product: MenuItem) => {
    if (hasConfigurableOptions(product)) {
      setConfigProduct(product);
      return;
    }
    addConfiguredItem({ product, unitPrice: product.promoPrice || product.price });
  };

  const addConfiguredItem = ({
    product,
    unitPrice,
    quantity = 1,
    variants = [],
    modifiers = [],
    notes,
  }: {
    product: MenuItem;
    unitPrice: number;
    quantity?: number;
    variants?: MenuVariant[];
    modifiers?: Array<{
      id: string;
      name: string;
      priceAdd: number;
      kind?: "modifier" | "complement";
    }>;
    notes?: string;
  }) => {
    setSaveError("");
    setSaveMessage("");
    const variantLabel = variants.length > 0
      ? variants.map((variant) => variant.name).join(", ")
      : "";
    const itemName = variantLabel ? `${product.name} (${variantLabel})` : product.name;
    addItem({
      menuItemId: product.id,
      name: itemName,
      quantity,
      unitPrice,
      variantId: variants?.[0]?.id || null,
      variantIds: variants?.map((variant) => variant.id) || [],
      variantName: variantLabel || null,
      modifiers,
      notes,
    });
    setLastAddedName(itemName);
  };

  // Imprime la comanda a cocina/barra desde la tablet si el admin activó
  // auto-impresión y ya sincronizó impresoras. Nunca lanza; devuelve una nota
  // para anexar al mensaje de guardado.
  const maybePrintKitchen = async (orderNumber: string | null): Promise<string> => {
    const { autoPrint, printers, kitchenConfig } = usePrinterStore.getState();
    if (!autoPrint || printers.length === 0) return "";

    const productById = new Map(products.map((product) => [product.id, product]));
    const printItems: TicketItem[] = ticketItems.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      price: item.unitPrice,
      notes: item.notes,
      modifiers: item.modifiers.map((modifier) => ({ name: modifier.name, priceAdd: modifier.priceAdd })),
      printerGroupIds: printerGroupIdsOf(productById.get(item.menuItemId)),
    }));

    const result = await printKitchenTickets(printers, {
      orderNumber,
      orderType: activeTableId ? "DINE_IN" : "TAKEOUT",
      tableNumber: activeTableName ? activeTableName.replace(/^mesa\s+/i, "") : null,
      customerName: activeTableId ? null : takeoutName.trim() || "Para llevar",
      items: printItems,
      config: kitchenConfig ?? undefined,
    });

    if (result.ok === 0 && result.failed.length > 0) {
      return ` Impresion fallo: ${result.failed[0]?.error ?? "sin detalle"}`;
    }
    if (result.failed.length > 0) {
      return ` (${result.failed.length} impresora(s) fallaron)`;
    }
    return result.ok > 0 ? " Comanda impresa." : "";
  };

  const handleSaveTicket = async () => {
    if (ticketItems.length === 0 || saving) return;

    setSaving(true);
    setSaveError("");
    setSaveMessage("");

    const items = ticketItems.map((item) => ({
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      notes: item.notes || "",
      variantId: item.variantId || undefined,
      variantIds: item.variantIds && item.variantIds.length > 0 ? item.variantIds : undefined,
      modifiers: item.modifiers
        .filter((modifier) => modifier.kind !== "complement")
        .map((modifier) => ({ modifierId: modifier.id })),
      complements: item.modifiers
        .filter((modifier) => modifier.kind === "complement")
        .map((modifier) => ({ complementId: modifier.id.replace(complementPrefix, "") })),
    }));
    const realTableId = activeTableId && !activeTableId.startsWith("mesa-") ? activeTableId : null;
    const demoTableNumber =
      activeTableId?.startsWith("mesa-") ? Number(activeTableId.replace("mesa-", "")) : null;
    const tableNumber =
      !realTableId && typeof demoTableNumber === "number" && Number.isFinite(demoTableNumber)
        ? demoTableNumber
        : null;
    const tableLabel = activeTableName || (tableNumber ? `Mesa ${tableNumber}` : activeTableId);

    try {
      const result = activeOrderId
        ? await apiOrQueue<{ orderNumber?: string }>(
            "order",
            "POST",
            `/api/orders/${activeOrderId}/rounds`,
            { items },
          )
        : await apiOrQueue<{ orderNumber?: string }>("order", "POST", "/api/orders/tpv", {
            orderType: activeTableId ? "DINE_IN" : "TAKEOUT",
            tableId: realTableId,
            tableNumber,
            numberOfGuests: activeTableId ? 1 : null,
            customerName: activeTableId
              ? tableLabel || "Meseros Lite"
              : takeoutName.trim() || "Para llevar",
            paymentMethod: "PENDING",
            items,
            subtotal: total,
            discount: 0,
            total,
          });

      if (!result.ok) {
        throw new Error(result.error || "No se pudo enviar la ronda.");
      }

      // Auto-impresión local (LAN). Se hace ANTES de limpiar el ticket y
      // funciona incluso si la orden quedó en cola (WiFi local arriba, sin
      // internet) — la impresión real corre en la tablet, no en el backend.
      const printNote = await maybePrintKitchen(result.data?.orderNumber ?? null);

      clearTicket();
      setLastAddedName(null);
      setTakeoutName("");
      const baseMessage = result.queued
        ? "Ronda en cola. Se enviara al volver internet."
        : "Ronda enviada a cocina.";
      setSaveMessage(baseMessage + printNote);
      window.setTimeout(() => router.replace("/mesas"), 600);
    } catch (err: unknown) {
      const directMessage =
        err instanceof Error && err.message ? err.message : "";
      const message =
        typeof err === "object" &&
        err !== null &&
        "response" in err &&
        typeof (err as { response?: { data?: { error?: string } } }).response?.data?.error === "string"
          ? (err as { response: { data: { error: string } } }).response.data.error
          : directMessage || "No se pudo enviar la ronda. Revisa sesion, sucursal y turno.";
      const isTokenError = message.toLowerCase().includes("token");
      const friendlyMessage = isTokenError
        ? "Sesion vencida. Vuelve a ingresar tu PIN para continuar (no hace falta reconfigurar la tablet)."
        : message;
      setSaveError(friendlyMessage);
      // Sesion expirada: el interceptor ya limpio el token; llevamos al mesero
      // directo al PIN en vez de dejarlo atascado en /menu con el error. La
      // comanda actual sigue en el ticket local hasta que reingrese.
      if (isTokenError) {
        window.setTimeout(() => router.replace("/pin"), 1200);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="min-h-screen bg-[var(--bg)] px-4 py-4 pb-56 text-[var(--text-primary)] lg:pb-4">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--brand)]">
            {activeTableId ? "Toma de pedido" : "Pedido para llevar"}
          </p>
          <h1 className="truncate text-xl font-black leading-tight text-[var(--text-primary)]">
            {activeTableName || (activeTableId ? `Mesa ${activeTableId.replace("mesa-", "")}` : "Para llevar")}
          </h1>
        </div>
        <button
          type="button"
          onClick={loadCatalog}
          className="flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--brand)] active:scale-95 transition-all duration-150"
          aria-label="Actualizar catalogo"
        >
          <RotateCw size={22} />
        </button>
      </header>

      {!activeTableId && (
        <input
          id="takeout-name"
          type="text"
          value={takeoutName}
          onChange={(event) => setTakeoutName(event.target.value)}
          placeholder="Nombre del cliente (opcional)"
          autoComplete="off"
          aria-label="Nombre del cliente para llevar"
          className="mb-3 h-[52px] w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-4 text-base font-bold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--brand)]"
        />
      )}

      {suggestions.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            Sugerencias de venta
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {suggestions.map((product) => {
              const promo = isOnPromo(product);
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => handleAddItem(product)}
                  className="flex min-h-[58px] shrink-0 flex-col items-start justify-center gap-0.5 rounded-lg border border-[var(--brand)] bg-[var(--surface-1)] px-3 py-1.5 text-left active:scale-95 transition-all duration-150"
                >
                  <span className="flex items-center gap-2">
                    <span className="rounded bg-[var(--brand)] px-1.5 py-0.5 text-[10px] font-black uppercase text-[var(--brand-fg)]">
                      {promo ? "Promo" : "Popular"}
                    </span>
                    <span className="text-sm font-black text-[var(--text-primary)]">{product.name}</span>
                  </span>
                  <span className="text-sm font-black text-[var(--brand)]">
                    {promo && product.promoPrice ? (
                      <>
                        <span className="mr-1 text-xs font-bold text-[var(--text-muted)] line-through">
                          {money(product.price)}
                        </span>
                        {money(product.promoPrice)}
                      </>
                    ) : (
                      money(product.price)
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          {activeOrderId && previousItems.length > 0 && (
            <section className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase text-[var(--brand)]">
                  Ya guardado en la cuenta
                </p>
                <p className="text-sm font-black text-[var(--text-secondary)]">{money(previousTotal)}</p>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {previousItems.map((item) => (
                  <div
                    key={item.id}
                    className="min-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--surface-3)] p-3"
                  >
                    <p className="truncate text-sm font-black text-[var(--text-primary)]">
                      <span className="text-[var(--brand)]">{item.quantity}x</span> {item.name}
                    </p>
                    <p className="mt-1 text-sm font-bold text-[var(--text-muted)]">{money(item.total)}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="mb-3 flex min-h-[52px] items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-4">
            <Search size={22} className="shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar platillo"
              className="h-11 min-w-0 flex-1 bg-[var(--surface-1)] text-lg font-bold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            />
          </div>

          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setActiveCategoryId("all")}
              className={[
                "min-h-[52px] shrink-0 rounded-lg border px-5 text-base font-black",
                "active:scale-95 transition-all duration-150",
                activeCategoryId === "all"
                  ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-fg)]"
                  : "border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-primary)]",
              ].join(" ")}
            >
              Todo
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setActiveCategoryId(category.id)}
                className={[
                  "min-h-[52px] shrink-0 rounded-lg border px-5 text-base font-black",
                  "active:scale-95 transition-all duration-150",
                  activeCategoryId === category.id
                    ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-fg)]"
                    : "border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-primary)]",
                ].join(" ")}
              >
                {category.name}
              </button>
            ))}
          </div>

          {status === "offline" && (
            <div className="mb-3 flex min-h-[64px] items-center gap-3 rounded-lg border border-[var(--warning)] bg-[var(--surface-1)] px-4 text-[var(--warning)]">
              <WifiOff size={24} />
              <p className="text-base font-black">Catalogo local activo</p>
            </div>
          )}

          {(saveError || saveMessage) && (
            <div
              className={[
                "mb-3 rounded-lg border bg-[var(--surface-1)] p-4",
                saveError ? "border-[var(--danger)]" : "border-[var(--success)]",
              ].join(" ")}
            >
              <p className={["text-base font-black", saveError ? "text-[var(--danger)]" : "text-[var(--success)]"].join(" ")}>
                {saveError || saveMessage}
              </p>
            </div>
          )}

          {status === "error" ? (
            <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-6 text-center">
              <p className="text-xl font-black text-[var(--text-secondary)]">
                No hay catalogo local y la API no respondio.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {visibleProducts.map((product) => {
                const price = product.promoPrice || product.price;
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => handleAddItem(product)}
                    className="flex min-h-[124px] flex-col justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4 text-left active:scale-95 transition-all duration-150"
                  >
                    <span className="line-clamp-2 text-xl font-black leading-tight text-[var(--text-primary)]">
                      {product.name}
                    </span>
                    <span className="mt-4 flex items-end justify-between gap-2">
                      <span className="text-2xl font-black text-[var(--brand)]">{money(price)}</span>
                      {hasConfigurableOptions(product) && (
                        <span className="rounded-md border border-[var(--brand)] px-2 py-1 text-xs font-black uppercase text-[var(--brand)]">
                          Opciones
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <aside className="hidden rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4 lg:block">
          {activeOrderId && (
            <div className="mb-3 rounded-lg border border-[var(--brand)] bg-[var(--surface-3)] p-3">
              <p className="text-xs font-black uppercase text-[var(--brand)]">Cuenta abierta</p>
              <p className="mt-1 text-base font-black text-[var(--text-primary)]">
                {previousItemCount} productos anteriores · {money(previousTotal)}
              </p>
              <p className="mt-1 text-sm font-bold text-[var(--text-muted)]">
                Abajo se muestran solo los productos de la nueva ronda.
              </p>
            </div>
          )}
          <div className="mb-4 flex items-center justify-between border-b border-[var(--border)] pb-3">
            <div>
              <p className="text-xs font-black uppercase text-[var(--text-muted)]">{ticketStatus}</p>
              <h2 className="text-2xl font-black text-[var(--text-primary)]">Ticket</h2>
            </div>
            <div className="text-right">
              <p className="text-xs font-black uppercase text-[var(--text-muted)]">Items</p>
              <p className="text-2xl font-black text-[var(--brand)]">{itemCount}</p>
            </div>
          </div>

          <div className="max-h-[42vh] space-y-3 overflow-y-auto pr-1">
            {ticketItems.length === 0 ? (
              <p className="py-10 text-center text-base font-bold text-[var(--text-muted)]">
                Agrega productos con un toque.
              </p>
            ) : (
              ticketItems.map((item) => (
                <article key={item.lineId} className="rounded-lg border border-[var(--border)] bg-[var(--surface-3)] p-3">
                  <div className="flex justify-between gap-3">
                    <p className="text-base font-black leading-tight text-[var(--text-primary)]">{item.name}</p>
                    <p className="shrink-0 text-base font-black text-[var(--brand)]">
                      {money(item.total)}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => decrementItem(item.lineId)}
                      className="flex min-h-[64px] min-w-[64px] items-center justify-center rounded-lg border border-[var(--border-strong)] bg-[var(--surface-1)] text-[var(--text-primary)] active:scale-95 transition-all duration-150"
                      aria-label={`Quitar ${item.name}`}
                    >
                      <Minus size={24} />
                    </button>
                    <span className="px-4 text-2xl font-black text-[var(--text-primary)]">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => incrementItem(item.lineId)}
                      className="flex min-h-[64px] min-w-[64px] items-center justify-center rounded-lg border border-[var(--border-strong)] bg-[var(--surface-1)] text-[var(--text-primary)] active:scale-95 transition-all duration-150"
                      aria-label={`Agregar ${item.name}`}
                    >
                      <Plus size={24} />
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>

          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-lg font-black text-[var(--text-secondary)]">Total</span>
              <span className="text-3xl font-black text-[var(--brand)]">{money(total)}</span>
            </div>
            <button
              type="button"
              onClick={handleSaveTicket}
              disabled={saving || ticketItems.length === 0}
              className={[
                "min-h-[72px] w-full rounded-lg border px-5 text-xl font-black",
                "active:scale-95 transition-all duration-150",
                saving || ticketItems.length === 0
                  ? "border-[var(--border)] bg-[var(--surface-3)] text-[var(--text-muted)]"
                  : "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-fg)]",
              ].join(" ")}
            >
              {saving ? "Enviando..." : "Enviar ronda"}
            </button>
          </div>
        </aside>
      </div>

      <aside className="fixed bottom-20 left-0 right-0 z-40 border-t border-[var(--border)] bg-[var(--surface-1)] lg:hidden">
        {/* Cabecera: resumen siempre visible + toggle para ver toda la comanda. */}
        <button
          type="button"
          onClick={() => setTicketExpanded((open) => !open)}
          aria-expanded={ticketExpanded}
          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left active:scale-[0.99] transition-all duration-150"
        >
          <span className="flex min-w-0 items-center gap-2">
            <ChevronUp
              size={20}
              className={`shrink-0 text-[var(--text-muted)] transition-transform duration-200 ${ticketExpanded ? "" : "rotate-180"}`}
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span className="block text-[11px] font-black uppercase text-[var(--text-muted)]">
                {ticketExpanded ? "Toca para contraer" : "Comanda · toca para ver"}
              </span>
              <span className="block truncate text-base font-black text-[var(--text-primary)]">
                {lastAddedName && !ticketExpanded
                  ? `+ ${lastAddedName}`
                  : `${accumulatedItemCount} producto${accumulatedItemCount === 1 ? "" : "s"}`}
              </span>
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block text-[11px] font-black uppercase text-[var(--text-muted)]">Total</span>
            <span className="block text-2xl font-black text-[var(--brand)]">{money(accumulatedTotal)}</span>
          </span>
        </button>

        {/* Comanda completa: se revela al expandir, con scroll y +/- por línea.
            Render condicional (no animamos height: barato en tablets de gama baja). */}
        {ticketExpanded && (
          <div className="max-h-[50vh] overflow-y-auto px-3">
          {ticketItems.length === 0 ? (
            <p className="mb-2 rounded-lg border border-[var(--border)] bg-[var(--surface-3)] px-4 py-4 text-center text-base font-bold text-[var(--text-muted)]">
              {activeOrderId
                ? `${previousItemCount} productos anteriores. Agrega para una nueva ronda.`
                : "Toca un producto para agregarlo."}
            </p>
          ) : (
            <div className="grid gap-2 pb-2">
              {ticketItems.map((item) => (
                <article
                  key={item.lineId}
                  className="grid min-h-[56px] grid-cols-[1fr_auto] items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-3)] px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-base font-black text-[var(--text-primary)]">{item.name}</p>
                    <p className="text-sm font-bold text-[var(--text-muted)]">
                      {item.quantity} x {money(item.unitPrice)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => decrementItem(item.lineId)}
                      className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-lg border border-[var(--border-strong)] bg-[var(--surface-1)] text-[var(--text-primary)] active:scale-95 transition-all duration-150"
                      aria-label={`Quitar ${item.name}`}
                    >
                      <Minus size={20} />
                    </button>
                    <span className="min-w-[26px] text-center text-lg font-black text-[var(--text-primary)]">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => incrementItem(item.lineId)}
                      className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-lg border border-[var(--border-strong)] bg-[var(--surface-1)] text-[var(--text-primary)] active:scale-95 transition-all duration-150"
                      aria-label={`Agregar ${item.name}`}
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          </div>
        )}

        {/* Guardar: siempre visible, sin importar si la comanda está expandida. */}
        <div className="px-3 pb-2 pt-1">
          <button
            type="button"
            onClick={handleSaveTicket}
            disabled={saving || ticketItems.length === 0}
            className={[
              "min-h-[56px] w-full rounded-lg border px-5 text-lg font-black",
              "active:scale-95 transition-all duration-150",
              saving || ticketItems.length === 0
                ? "border-[var(--border)] bg-[var(--surface-3)] text-[var(--text-muted)]"
                : "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-fg)]",
            ].join(" ")}
          >
            {saving ? "Enviando..." : "Enviar ronda"}
          </button>
          {(saveError || saveMessage) && (
            <p
              className={[
                "mt-2 rounded-lg border bg-[var(--surface-3)] p-3 text-center text-sm font-black",
                saveError
                  ? "border-[var(--danger)] text-[var(--danger)]"
                  : "border-[var(--success)] text-[var(--success)]",
              ].join(" ")}
            >
              {saveError || saveMessage}
            </p>
          )}
        </div>
      </aside>

      {configProduct && (
        <LiteProductConfigurator
          product={configProduct}
          onClose={() => setConfigProduct(null)}
          onConfirm={(payload) => {
            addConfiguredItem(payload);
            setConfigProduct(null);
          }}
        />
      )}
    </section>
  );
}

function LiteProductConfigurator({
  product,
  onClose,
  onConfirm,
}: {
  product: MenuItem;
  onClose: () => void;
  onConfirm: (payload: {
    product: MenuItem;
    unitPrice: number;
    quantity: number;
    variants: MenuVariant[];
    modifiers: Array<{
      id: string;
      name: string;
      priceAdd: number;
      kind?: "modifier" | "complement";
    }>;
    notes?: string;
  }) => void;
}) {
  const variants = useMemo(
    () => (product.variants || []).filter((variant) => variant.isAvailable !== false),
    [product],
  );
  const groups = useMemo(() => {
    const baseGroups = product.modifierGroups || [];
    const complements = (product.complements || []).filter(
      (complement) => complement.isAvailable !== false,
    );
    if (complements.length === 0) return baseGroups;
    const complementGroup: MenuModifierGroup = {
      id: "__complements",
      name: "Complementos",
      required: false,
      multiSelect: true,
      minSelection: 0,
      maxSelection: 0,
      freeModifiersLimit: 0,
      modifiers: complements.map((complement) => ({
        id: `${complementPrefix}${complement.id}`,
        name: complement.name,
        priceAdd: Number(complement.price || 0),
      })),
    };
    return [
      ...baseGroups,
      complementGroup,
    ];
  }, [product]);

  const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>(
    variants[0]?.id ? [variants[0].id] : [],
  );
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [selections, setSelections] = useState<Record<string, MenuModifier[]>>(() => {
    const initial: Record<string, MenuModifier[]> = {};
    for (const group of groups) {
      const defaults = group.modifiers.filter((modifier) => modifier.isDefault);
      initial[group.id] = group.multiSelect ? defaults : defaults.slice(0, 1);
    }
    return initial;
  });

  const selectedVariants = variants.filter((variant) => selectedVariantIds.includes(variant.id));
  const unitExtra = computeUnitExtra(groups, selections);
  const unitPrice = resolveVariantSelectionPrice(product, selectedVariants) + unitExtra;
  const totalPrice = unitPrice * quantity;

  const validationError = useMemo(() => {
    if (variants.length > 0 && selectedVariants.length === 0) return "Selecciona al menos una variante";
    for (const group of groups) {
      const count = (selections[group.id] || []).length;
      const min = Math.max(group.required ? 1 : 0, group.minSelection || 0);
      if (count < min) return `Falta elegir ${min} en ${group.name}`;
      if ((group.maxSelection || 0) > 0 && count > (group.maxSelection || 0)) {
        return `Maximo ${group.maxSelection} en ${group.name}`;
      }
    }
    return "";
  }, [groups, selections, selectedVariants.length, variants.length]);

  const toggleVariant = (variantId: string) => {
    setSelectedVariantIds((current) =>
      current.includes(variantId)
        ? current.filter((id) => id !== variantId)
        : [...current, variantId],
    );
  };

  const toggleModifier = (group: MenuModifierGroup, modifier: MenuModifier) => {
    setSelections((current) => {
      const selected = current[group.id] || [];
      const isSelected = selected.some((item) => item.id === modifier.id);
      if (group.multiSelect) {
        if (isSelected) {
          return { ...current, [group.id]: selected.filter((item) => item.id !== modifier.id) };
        }
        if ((group.maxSelection || 0) > 0 && selected.length >= (group.maxSelection || 0)) {
          return current;
        }
        return { ...current, [group.id]: [...selected, modifier] };
      }
      if (isSelected) return group.required ? current : { ...current, [group.id]: [] };
      return { ...current, [group.id]: [modifier] };
    });
  };

  const selectedModifiers = groups.flatMap((group) =>
    (selections[group.id] || []).map((modifier) => ({
      id: modifier.id,
      name: modifier.name,
      priceAdd: modifier.priceAdd,
      kind: group.id === "__complements" ? ("complement" as const) : ("modifier" as const),
    })),
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-end bg-black/55 text-[var(--text-primary)]">
      <div className="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-[32px] border border-[var(--border-strong)] bg-[var(--bg)] shadow-strong">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-1)] p-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase text-[var(--ready)]">Opciones</p>
            <h2 className="truncate text-2xl font-black text-[var(--text-primary)]">{product.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[64px] min-w-[64px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-3)] text-[var(--text-primary)] active:scale-95 transition-all duration-150"
            aria-label="Cerrar configurador"
          >
            <X size={26} />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-4 pb-4">
          {variants.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-lg font-black text-[var(--text-primary)]">Variantes</h3>
                <p className="text-sm font-black uppercase text-[var(--text-muted)]">Elige una o mas</p>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {variants.map((variant) => {
                  const selected = selectedVariantIds.includes(variant.id);
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      onClick={() => toggleVariant(variant.id)}
                      className={[
                        "min-h-[72px] rounded-lg border bg-[var(--surface-1)] p-3 text-left",
                        "active:scale-95 transition-all duration-150",
                        selected ? "border-[var(--brand)]" : "border-[var(--border)]",
                      ].join(" ")}
                    >
                      <p className="text-base font-black text-[var(--text-primary)]">{variant.name}</p>
                      <p className="mt-1 text-xl font-black text-[var(--brand)]">
                        {variantPriceLabel(product, variant)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {groups.map((group) => {
            const selected = selections[group.id] || [];
            const selectedIds = new Set(selected.map((modifier) => modifier.id));
            const min = Math.max(group.required ? 1 : 0, group.minSelection || 0);
            const max = group.maxSelection || 0;
            return (
              <section key={group.id}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-lg font-black text-[var(--text-primary)]">{group.name}</h3>
                  <p className="text-sm font-black uppercase text-[var(--text-muted)]">
                    {group.multiSelect
                      ? `${min > 0 ? `Min ${min}` : "Opcional"}${max > 0 ? ` / Max ${max}` : ""}`
                      : "Elige 1"}
                  </p>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {group.modifiers.map((modifier) => {
                    const selectedModifier = selectedIds.has(modifier.id);
                    return (
                      <button
                        key={modifier.id}
                        type="button"
                        onClick={() => toggleModifier(group, modifier)}
                        className={[
                          "grid min-h-[64px] grid-cols-[32px_1fr_auto] items-center gap-3 rounded-lg border bg-[var(--surface-1)] px-3 text-left",
                          "active:scale-95 transition-all duration-150",
                          selectedModifier ? "border-[var(--brand)]" : "border-[var(--border)]",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "flex h-8 w-8 items-center justify-center rounded-md border",
                            selectedModifier
                              ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-fg)]"
                              : "border-[var(--border-strong)] bg-[var(--surface-3)] text-[var(--text-muted)]",
                          ].join(" ")}
                        >
                          {selectedModifier && <Check size={18} strokeWidth={3} />}
                        </span>
                        <span className="text-base font-black text-[var(--text-primary)]">{modifier.name}</span>
                        <span className="text-sm font-black text-[var(--brand)]">
                          {modifier.priceAdd > 0 ? `+${money(modifier.priceAdd)}` : "Incluido"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-black text-[var(--text-primary)]">Cantidad</h3>
              <p className="text-sm font-black uppercase text-[var(--text-muted)]">Antes de agregar</p>
            </div>
            <div className="grid grid-cols-[72px_1fr_72px] gap-3">
              <button
                type="button"
                onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                className="flex min-h-[72px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-1)] active:scale-95 transition-all duration-150"
              >
                <Minus size={26} />
              </button>
              <div className="grid min-h-[72px] place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-3xl font-black text-[var(--text-primary)]">
                {quantity}
              </div>
              <button
                type="button"
                onClick={() => setQuantity((current) => Math.min(99, current + 1))}
                className="flex min-h-[72px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-1)] active:scale-95 transition-all duration-150"
              >
                <Plus size={26} />
              </button>
            </div>
          </section>

          <label className="grid gap-2">
            <span className="text-sm font-black uppercase text-[var(--text-muted)]">Nota cocina</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value.slice(0, 200))}
              rows={3}
              maxLength={200}
              placeholder="Sin cebolla, bien dorado..."
              className="min-h-[96px] resize-none rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4 text-lg font-bold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            />
          </label>
        </div>

        <footer className="shrink-0 border-t border-[var(--border)] bg-[var(--surface-1)] p-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
          {validationError && (
            <p className="mb-2 rounded-lg border border-[var(--brand)] bg-[var(--surface-3)] p-3 text-center text-sm font-black text-[var(--brand)]">
              {validationError}
            </p>
          )}
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase text-[var(--text-muted)]">Total</p>
              <p className="text-3xl font-black text-[var(--brand)]">{money(totalPrice)}</p>
            </div>
            <p className="text-right text-sm font-bold text-[var(--text-secondary)]">
              {money(unitPrice)} por unidad
            </p>
          </div>
          <button
            type="button"
            disabled={Boolean(validationError)}
            onClick={() =>
              onConfirm({
                product,
                unitPrice,
                quantity,
                variants: selectedVariants,
                modifiers: selectedModifiers,
                notes: notes.trim() || undefined,
              })
            }
            className={[
              "min-h-[72px] w-full rounded-lg border px-5 text-xl font-black",
              "active:scale-95 transition-all duration-150",
              validationError
                ? "border-[var(--border)] bg-[var(--surface-3)] text-[var(--text-muted)]"
                : "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-fg)]",
            ].join(" ")}
          >
            Agregar a comanda
          </button>
        </footer>
      </div>
    </div>
  );
}
