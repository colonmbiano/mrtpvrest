"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Minus, Plus, RotateCw, Search, WifiOff, X } from "lucide-react";
import type { OrderStatus } from "@mrtpvrest/types";
import api from "@/lib/api";
import { apiOrQueue } from "@/lib/offline";
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

interface MenuItem {
  id: string;
  name: string;
  price: number;
  promoPrice?: number | null;
  categoryId?: string | null;
  isAvailable?: boolean;
  isFavorite?: boolean;
  isPopular?: boolean;
  hasVariants?: boolean;
  variants?: MenuVariant[];
  complements?: MenuComplement[];
  modifierGroups?: MenuModifierGroup[];
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
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [products, setProducts] = useState<MenuItem[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<CatalogStatus>("idle");
  const [lastAddedName, setLastAddedName] = useState<string | null>(null);
  const [configProduct, setConfigProduct] = useState<MenuItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  const ticketItems = useWaiterOrderStore((state) => state.ticketItems);
  const addItem = useWaiterOrderStore((state) => state.addItem);
  const incrementItem = useWaiterOrderStore((state) => state.incrementItem);
  const decrementItem = useWaiterOrderStore((state) => state.decrementItem);
  const clearTicket = useWaiterOrderStore((state) => state.clearTicket);
  const activeTableId = useWaiterOrderStore((state) => state.activeTableId);
  const activeTableName = useWaiterOrderStore((state) => state.activeTableName);

  const loadCatalog = async () => {
    setStatus("loading");
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

  useEffect(() => {
    setCategories(readCache<MenuCategory[]>(categoriesCacheKey, []));
    setProducts(readCache<MenuItem[]>(productsCacheKey, []));
    void loadCatalog();
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

  const total = ticketItems.reduce((sum, item) => sum + item.total, 0);
  const itemCount = ticketItems.reduce((sum, item) => sum + item.quantity, 0);
  const latestTicketItems = ticketItems.slice(-1).reverse();

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
      const result = await apiOrQueue("order", "POST", "/api/orders/tpv", {
        orderType: activeTableId ? "DINE_IN" : "TAKEOUT",
        tableId: realTableId,
        tableNumber,
        numberOfGuests: activeTableId ? 1 : null,
        customerName: tableLabel || "Meseros Lite",
        paymentMethod: "PENDING",
        items,
        subtotal: total,
        discount: 0,
        total,
      });

      if (!result.ok) {
        throw new Error(result.error || "No se pudo guardar la comanda.");
      }

      clearTicket();
      setLastAddedName(null);
      setSaveMessage(result.queued ? "Comanda en cola. Se enviara al volver internet." : "Comanda guardada.");
      window.setTimeout(() => router.replace("/mesas"), 450);
    } catch (err: unknown) {
      const directMessage =
        err instanceof Error && err.message ? err.message : "";
      const message =
        typeof err === "object" &&
        err !== null &&
        "response" in err &&
        typeof (err as { response?: { data?: { error?: string } } }).response?.data?.error === "string"
          ? (err as { response: { data: { error: string } } }).response.data.error
          : directMessage || "No se pudo guardar la comanda. Revisa sesion, sucursal y turno.";
      const friendlyMessage = message.toLowerCase().includes("token")
        ? "Sesion vencida. Vuelve a configurar la tablet en Perfil / Configurar restaurante y sucursal."
        : message;
      setSaveError(friendlyMessage);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="min-h-screen bg-[#0a0a0c] px-4 py-4 pb-80 text-neutral-200 lg:pb-4">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase tracking-wide text-[#ffb84d]">
            Comanda rapida
          </p>
          <h1 className="truncate text-3xl font-black text-neutral-200">
            {activeTableName || (activeTableId ? `Mesa ${activeTableId.replace("mesa-", "")}` : "Sin mesa activa")}
          </h1>
        </div>
        <button
          type="button"
          onClick={loadCatalog}
          className="flex min-h-[64px] min-w-[64px] items-center justify-center rounded-lg border border-neutral-800 bg-[#121214] text-[#ffb84d] active:scale-95 transition-all duration-150"
          aria-label="Actualizar catalogo"
        >
          <RotateCw size={26} />
        </button>
      </header>

      <div className="mb-3 rounded-lg border border-neutral-800 bg-[#121214] p-3 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase text-neutral-500">Ticket visible</p>
            <p className="truncate text-lg font-black text-neutral-100">
              {lastAddedName
                ? `Agregado: ${lastAddedName}`
                : latestTicketItems[0]
                  ? `Ultimo: ${latestTicketItems[0].name}`
                  : "Aun sin productos"}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs font-black uppercase text-neutral-500">{itemCount} items</p>
            <p className="text-2xl font-black text-[#ffb84d]">{money(total)}</p>
          </div>
        </div>
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          <div className="mb-3 flex min-h-[64px] items-center gap-3 rounded-lg border border-neutral-800 bg-[#121214] px-4">
            <Search size={24} className="shrink-0 text-neutral-500" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar platillo"
              className="h-12 min-w-0 flex-1 bg-[#121214] text-xl font-bold text-neutral-100 outline-none placeholder:text-neutral-500"
            />
          </div>

          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setActiveCategoryId("all")}
              className={[
                "min-h-[64px] shrink-0 rounded-lg border px-5 text-base font-black",
                "active:scale-95 transition-all duration-150",
                activeCategoryId === "all"
                  ? "border-[#ffb84d] bg-[#ffb84d] text-[#0a0a0c]"
                  : "border-neutral-800 bg-[#121214] text-neutral-200",
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
                  "min-h-[64px] shrink-0 rounded-lg border px-5 text-base font-black",
                  "active:scale-95 transition-all duration-150",
                  activeCategoryId === category.id
                    ? "border-[#ffb84d] bg-[#ffb84d] text-[#0a0a0c]"
                    : "border-neutral-800 bg-[#121214] text-neutral-200",
                ].join(" ")}
              >
                {category.name}
              </button>
            ))}
          </div>

          {status === "offline" && (
            <div className="mb-3 flex min-h-[64px] items-center gap-3 rounded-lg border border-[#ffb84d] bg-[#121214] px-4 text-[#ffb84d]">
              <WifiOff size={24} />
              <p className="text-base font-black">Catalogo local activo</p>
            </div>
          )}

          {(saveError || saveMessage) && (
            <div className="mb-3 rounded-lg border border-[#ffb84d] bg-[#121214] p-4">
              <p className="text-base font-black text-[#ffb84d]">
                {saveError || saveMessage}
              </p>
            </div>
          )}

          {status === "error" ? (
            <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-neutral-800 bg-[#121214] p-6 text-center">
              <p className="text-xl font-black text-neutral-300">
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
                    className="flex min-h-[124px] flex-col justify-between rounded-lg border border-neutral-800 bg-[#121214] p-4 text-left active:scale-95 transition-all duration-150"
                  >
                    <span className="line-clamp-2 text-xl font-black leading-tight text-neutral-100">
                      {product.name}
                    </span>
                    <span className="mt-4 flex items-end justify-between gap-2">
                      <span className="text-2xl font-black text-[#ffb84d]">{money(price)}</span>
                      {hasConfigurableOptions(product) && (
                        <span className="rounded-md border border-[#ffb84d] px-2 py-1 text-xs font-black uppercase text-[#ffb84d]">
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

        <aside className="hidden rounded-lg border border-neutral-800 bg-[#121214] p-4 lg:block">
          <div className="mb-4 flex items-center justify-between border-b border-neutral-800 pb-3">
            <div>
              <p className="text-xs font-black uppercase text-neutral-500">{ticketStatus}</p>
              <h2 className="text-2xl font-black text-neutral-100">Ticket</h2>
            </div>
            <div className="text-right">
              <p className="text-xs font-black uppercase text-neutral-500">Items</p>
              <p className="text-2xl font-black text-[#ffb84d]">{itemCount}</p>
            </div>
          </div>

          <div className="max-h-[42vh] space-y-3 overflow-y-auto pr-1">
            {ticketItems.length === 0 ? (
              <p className="py-10 text-center text-base font-bold text-neutral-500">
                Agrega productos con un toque.
              </p>
            ) : (
              ticketItems.map((item) => (
                <article key={item.lineId} className="rounded-lg border border-neutral-800 bg-[#18181b] p-3">
                  <div className="flex justify-between gap-3">
                    <p className="text-base font-black leading-tight text-neutral-100">{item.name}</p>
                    <p className="shrink-0 text-base font-black text-[#ffb84d]">
                      {money(item.total)}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => decrementItem(item.lineId)}
                      className="flex min-h-[64px] min-w-[64px] items-center justify-center rounded-lg border border-neutral-700 bg-[#121214] text-neutral-200 active:scale-95 transition-all duration-150"
                      aria-label={`Quitar ${item.name}`}
                    >
                      <Minus size={24} />
                    </button>
                    <span className="px-4 text-2xl font-black text-neutral-100">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => incrementItem(item.lineId)}
                      className="flex min-h-[64px] min-w-[64px] items-center justify-center rounded-lg border border-neutral-700 bg-[#121214] text-neutral-200 active:scale-95 transition-all duration-150"
                      aria-label={`Agregar ${item.name}`}
                    >
                      <Plus size={24} />
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>

          <div className="mt-4 border-t border-neutral-800 pt-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-lg font-black text-neutral-300">Total</span>
              <span className="text-3xl font-black text-[#ffb84d]">{money(total)}</span>
            </div>
            <button
              type="button"
              onClick={handleSaveTicket}
              disabled={saving || ticketItems.length === 0}
              className={[
                "min-h-[72px] w-full rounded-lg border px-5 text-xl font-black",
                "active:scale-95 transition-all duration-150",
                saving || ticketItems.length === 0
                  ? "border-neutral-800 bg-[#18181b] text-neutral-500"
                  : "border-[#ffb84d] bg-[#ffb84d] text-[#0a0a0c]",
              ].join(" ")}
            >
              {saving ? "Guardando..." : "Guardar comanda"}
            </button>
          </div>
        </aside>
      </div>

      <aside className="fixed bottom-20 left-0 right-0 z-40 border-t border-neutral-800 bg-[#121214] p-2 lg:hidden">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase text-neutral-500">Comanda local</p>
            <p className="text-lg font-black text-neutral-100">{itemCount} productos</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-black uppercase text-neutral-500">Total</p>
            <p className="text-2xl font-black text-[#ffb84d]">{money(total)}</p>
          </div>
        </div>

        {latestTicketItems.length === 0 ? (
          <p className="min-h-[56px] rounded-lg border border-neutral-800 bg-[#18181b] px-4 py-4 text-center text-base font-bold text-neutral-500">
            Toca un producto para verlo aqui.
          </p>
        ) : (
          <div className="grid gap-2">
            {latestTicketItems.map((item) => (
              <article
                key={item.lineId}
                className="grid min-h-[56px] grid-cols-[1fr_auto] items-center gap-2 rounded-lg border border-neutral-800 bg-[#18181b] px-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-base font-black text-neutral-100">{item.name}</p>
                  <p className="text-sm font-bold text-neutral-500">
                    {item.quantity} x {money(item.unitPrice)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => decrementItem(item.lineId)}
                    className="flex min-h-[56px] min-w-[56px] items-center justify-center rounded-lg border border-neutral-700 bg-[#121214] text-neutral-200 active:scale-95 transition-all duration-150"
                    aria-label={`Quitar ${item.name}`}
                  >
                    <Minus size={22} />
                  </button>
                  <button
                    type="button"
                    onClick={() => incrementItem(item.lineId)}
                    className="flex min-h-[56px] min-w-[56px] items-center justify-center rounded-lg border border-neutral-700 bg-[#121214] text-neutral-200 active:scale-95 transition-all duration-150"
                    aria-label={`Agregar ${item.name}`}
                  >
                    <Plus size={22} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={handleSaveTicket}
          disabled={saving || ticketItems.length === 0}
          className={[
            "mt-2 min-h-[64px] w-full rounded-lg border px-5 text-lg font-black",
            "active:scale-95 transition-all duration-150",
            saving || ticketItems.length === 0
              ? "border-neutral-800 bg-[#18181b] text-neutral-500"
              : "border-[#ffb84d] bg-[#ffb84d] text-[#0a0a0c]",
          ].join(" ")}
        >
          {saving ? "Guardando..." : "Guardar comanda"}
        </button>
        {(saveError || saveMessage) && (
          <p className="mt-2 rounded-lg border border-[#ffb84d] bg-[#18181b] p-3 text-center text-sm font-black text-[#ffb84d]">
            {saveError || saveMessage}
          </p>
        )}
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
    <div className="fixed inset-0 z-[80] bg-[#0a0a0c] text-neutral-200">
      <div className="flex h-screen flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-800 bg-[#121214] p-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase text-[#ffb84d]">Configurar producto</p>
            <h2 className="truncate text-2xl font-black text-neutral-100">{product.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[64px] min-w-[64px] items-center justify-center rounded-lg border border-neutral-800 bg-[#18181b] text-neutral-200 active:scale-95 transition-all duration-150"
            aria-label="Cerrar configurador"
          >
            <X size={26} />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-4 pb-40">
          {variants.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-lg font-black text-neutral-100">Variantes</h3>
                <p className="text-sm font-black uppercase text-neutral-500">Elige una o mas</p>
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
                        "min-h-[72px] rounded-lg border bg-[#121214] p-3 text-left",
                        "active:scale-95 transition-all duration-150",
                        selected ? "border-[#ffb84d]" : "border-neutral-800",
                      ].join(" ")}
                    >
                      <p className="text-base font-black text-neutral-100">{variant.name}</p>
                      <p className="mt-1 text-xl font-black text-[#ffb84d]">
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
                  <h3 className="text-lg font-black text-neutral-100">{group.name}</h3>
                  <p className="text-sm font-black uppercase text-neutral-500">
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
                          "grid min-h-[64px] grid-cols-[32px_1fr_auto] items-center gap-3 rounded-lg border bg-[#121214] px-3 text-left",
                          "active:scale-95 transition-all duration-150",
                          selectedModifier ? "border-[#ffb84d]" : "border-neutral-800",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "flex h-8 w-8 items-center justify-center rounded-md border",
                            selectedModifier
                              ? "border-[#ffb84d] bg-[#ffb84d] text-[#0a0a0c]"
                              : "border-neutral-700 bg-[#18181b] text-neutral-500",
                          ].join(" ")}
                        >
                          {selectedModifier && <Check size={18} strokeWidth={3} />}
                        </span>
                        <span className="text-base font-black text-neutral-100">{modifier.name}</span>
                        <span className="text-sm font-black text-[#ffb84d]">
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
              <h3 className="text-lg font-black text-neutral-100">Cantidad</h3>
              <p className="text-sm font-black uppercase text-neutral-500">Antes de agregar</p>
            </div>
            <div className="grid grid-cols-[72px_1fr_72px] gap-3">
              <button
                type="button"
                onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                className="flex min-h-[72px] items-center justify-center rounded-lg border border-neutral-800 bg-[#121214] active:scale-95 transition-all duration-150"
              >
                <Minus size={26} />
              </button>
              <div className="grid min-h-[72px] place-items-center rounded-lg border border-neutral-800 bg-[#121214] text-3xl font-black text-neutral-100">
                {quantity}
              </div>
              <button
                type="button"
                onClick={() => setQuantity((current) => Math.min(99, current + 1))}
                className="flex min-h-[72px] items-center justify-center rounded-lg border border-neutral-800 bg-[#121214] active:scale-95 transition-all duration-150"
              >
                <Plus size={26} />
              </button>
            </div>
          </section>

          <label className="grid gap-2">
            <span className="text-sm font-black uppercase text-neutral-500">Nota cocina</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value.slice(0, 200))}
              rows={3}
              maxLength={200}
              placeholder="Sin cebolla, bien dorado..."
              className="min-h-[96px] resize-none rounded-lg border border-neutral-800 bg-[#121214] p-4 text-lg font-bold text-neutral-100 outline-none placeholder:text-neutral-500"
            />
          </label>
        </div>

        <footer className="fixed bottom-20 left-0 right-0 z-[90] border-t border-neutral-800 bg-[#121214] p-3">
          {validationError && (
            <p className="mb-2 rounded-lg border border-[#ffb84d] bg-[#18181b] p-3 text-center text-sm font-black text-[#ffb84d]">
              {validationError}
            </p>
          )}
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase text-neutral-500">Total</p>
              <p className="text-3xl font-black text-[#ffb84d]">{money(totalPrice)}</p>
            </div>
            <p className="text-right text-sm font-bold text-neutral-400">
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
                ? "border-neutral-800 bg-[#18181b] text-neutral-500"
                : "border-[#ffb84d] bg-[#ffb84d] text-[#0a0a0c]",
            ].join(" ")}
          >
            Agregar al ticket
          </button>
        </footer>
      </div>
    </div>
  );
}
