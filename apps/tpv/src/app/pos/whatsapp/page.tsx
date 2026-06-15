"use client";

/**
 * /pos/whatsapp — Captura de pedidos de WhatsApp.
 *
 * Pegas el mensaje del chat → un parser local (lib/wa-parse, sin IA) detecta
 * cantidades, cliente, teléfono, tipo de entrega y hace match contra el
 * catálogo real. Editas las líneas (producto / variante / modificadores /
 * notas) y creas el pedido vía `POST /api/orders/tpv` — los totales los calcula
 * el backend (regla de dinero del proyecto). NO cobra: cae como cuenta abierta.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  MessageCircle,
  Search,
  Plus,
  Minus,
  Trash2,
  Loader2,
  CheckCircle2,
  ClipboardPaste,
  Sparkles,
  X,
  Bike,
  ShoppingBag,
  UtensilsCrossed,
} from "lucide-react";
import api from "@/lib/api";
import { useTPVAuth } from "@/hooks/useTPVAuth";
import type { Product, Modifier, ModifierGroup } from "@/store/ticketStore";
import {
  buildOptionGroups,
  computeUnitExtra,
  flattenSelections,
  buildOrderItemsPayload,
  getValidationError,
  type OrderItemPayloadInput,
} from "@/lib/modifiers";
import {
  parseWhatsappOrder,
  matchScore,
  normalize,
  type OrderType,
} from "@/lib/wa-parse";

const CATALOG_CACHE_KEY = "tpv-catalog-cache-v1";

type Line = {
  uid: string;
  product: Product | null;
  productQuery: string;
  quantity: number;
  variantId: string | null; // single-select
  selections: Record<string, Modifier[]>; // groupId -> modifiers
  notes: string;
  raw?: string;
};

const ORDER_TYPES: { key: OrderType; label: string; icon: typeof Bike }[] = [
  { key: "DINE_IN", label: "Comer aquí", icon: UtensilsCrossed },
  { key: "TAKEOUT", label: "Para llevar", icon: ShoppingBag },
  { key: "DELIVERY", label: "Domicilio", icon: Bike },
];

function uid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `l_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  }
}

function money(n: number): string {
  return `$${(Math.round(n * 100) / 100).toFixed(2)}`;
}

/** Variantes disponibles de un producto. */
function availableVariants(p: Product) {
  return (p.variants || []).filter((v) => v.isAvailable !== false);
}

/** Grupos de opciones (variantes multi-select + modificadores + complementos). */
function groupsFor(p: Product): ModifierGroup[] {
  return buildOptionGroups(p, availableVariants(p), Boolean(p.variantMultiSelect));
}

/** ¿El nombre de una opción aparece (como palabras) en el texto del pedido? */
function optionInText(name: string, normText: string): boolean {
  const n = normalize(name);
  if (!n) return false;
  const padded = ` ${normText} `;
  if (padded.includes(` ${n} `)) return true;
  const toks = n.split(" ").filter((w) => w.length >= 3);
  return toks.length > 0 && toks.every((w) => padded.includes(` ${w} `));
}

/**
 * Auto-selecciona la variante única + los modificadores/sabores cuyo nombre
 * aparezca en el texto del cliente (ej. "BBQ", "mango habanero", "lemon pepper").
 * Así la línea cae lista sin que el cajero tenga que tocar los chips.
 */
function autoSelectOptions(
  product: Product,
  text: string,
): { variantId: string | null; selections: Record<string, Modifier[]> } {
  const t = normalize(text);
  let variantId: string | null = null;
  const selections: Record<string, Modifier[]> = {};

  if (!product.variantMultiSelect) {
    for (const v of availableVariants(product)) {
      if (optionInText(v.name, t)) {
        variantId = v.id;
        break;
      }
    }
  }

  for (const g of groupsFor(product)) {
    for (const m of g.modifiers) {
      if (!optionInText(m.name, t)) continue;
      if (g.multiSelect) {
        selections[g.id] = [...(selections[g.id] || []), m];
      } else if (!selections[g.id]) {
        selections[g.id] = [m];
      }
    }
  }
  return { variantId, selections };
}

/** Precio unitario estimado (el real lo recalcula el backend). */
function estimateUnit(line: Line): number {
  const p = line.product;
  if (!p) return 0;
  let unit = Number(p.promoPrice ?? p.price ?? 0);
  if (line.variantId) {
    const v = availableVariants(p).find((x) => x.id === line.variantId);
    if (v) {
      const vp = Number(v.price || 0);
      if (vp >= unit) unit = vp;
      else unit += vp;
    }
  }
  unit += computeUnitExtra(groupsFor(p), line.selections);
  return unit;
}

export default function WhatsappCapturePage() {
  const router = useRouter();
  const { currentEmployee, locationName } = useTPVAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [menuError, setMenuError] = useState("");
  const [rawText, setRawText] = useState("");

  const [orderType, setOrderType] = useState<OrderType>("TAKEOUT");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [lines, setLines] = useState<Line[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [createdOrder, setCreatedOrder] = useState<{ number: string; total: number } | null>(null);

  // Picker de producto para una línea concreta.
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  // ── Cargar catálogo ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    // Pinta de inmediato la cache si existe (mismo key que el POS principal).
    try {
      const cached = localStorage.getItem(CATALOG_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        const items: Product[] = parsed?.items || parsed?.products || [];
        if (Array.isArray(items) && items.length) setProducts(items);
      }
    } catch {
      /* cache corrupta — ignorar */
    }

    api
      .get("/api/menu/items?admin=true")
      .then(({ data }) => {
        if (cancelled) return;
        const items: Product[] = Array.isArray(data) ? data : data?.items || data?.menuItems || [];
        if (Array.isArray(items) && items.length) {
          setProducts(items);
          setMenuError("");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setProducts((prev) => {
          if (prev.length === 0) setMenuError("No se pudo cargar el menú. Revisa la conexión.");
          return prev;
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Parsear el texto pegado ────────────────────────────────────────────────
  const handleParse = () => {
    if (!rawText.trim() || products.length === 0) return;
    const parsed = parseWhatsappOrder(rawText, products);
    setOrderType(parsed.orderType);
    if (parsed.customerName) setCustomerName(parsed.customerName);
    if (parsed.customerPhone) setCustomerPhone(parsed.customerPhone);
    if (parsed.deliveryAddress) setDeliveryAddress(parsed.deliveryAddress);
    setCreatedOrder(null);
    setError("");
    setLines(
      parsed.lines.map((pl) => {
        const auto = pl.match
          ? autoSelectOptions(pl.match, `${pl.productQuery} ${pl.notes}`)
          : { variantId: null, selections: {} };
        return {
          uid: uid(),
          product: pl.match,
          productQuery: pl.productQuery,
          quantity: pl.quantity,
          variantId: auto.variantId,
          selections: auto.selections,
          notes: pl.notes,
          raw: pl.raw,
        };
      }),
    );
  };

  const pasteFromClipboard = async () => {
    try {
      const txt = await navigator.clipboard.readText();
      if (txt) setRawText(txt);
    } catch {
      /* sin permiso de portapapeles — el usuario pega a mano */
    }
  };

  // ── Mutaciones de línea ────────────────────────────────────────────────────
  const patchLine = (id: string, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.uid === id ? { ...l, ...patch } : l)));

  const removeLine = (id: string) => setLines((prev) => prev.filter((l) => l.uid !== id));

  const addBlankLine = () =>
    setLines((prev) => [
      ...prev,
      { uid: uid(), product: null, productQuery: "", quantity: 1, variantId: null, selections: {}, notes: "" },
    ]);

  const setProductForLine = (id: string, product: Product) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.uid !== id) return l;
        // Auto-selecciona sabores/variantes usando el texto original de la línea.
        const auto = autoSelectOptions(product, `${l.productQuery} ${l.notes}`);
        return { ...l, product, variantId: auto.variantId, selections: auto.selections };
      }),
    );
    setPickerFor(null);
  };

  const toggleModifier = (id: string, group: ModifierGroup, mod: Modifier) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.uid !== id) return l;
        const current = l.selections[group.id] || [];
        const exists = current.some((m) => m.id === mod.id);
        let next: Modifier[];
        if (group.multiSelect) {
          next = exists ? current.filter((m) => m.id !== mod.id) : [...current, mod];
        } else {
          next = exists ? [] : [mod];
        }
        return { ...l, selections: { ...l.selections, [group.id]: next } };
      }),
    );
  };

  // ── Validación + total estimado ────────────────────────────────────────────
  const matchedLines = lines.filter((l) => l.product);
  const estimateTotal = useMemo(
    () => matchedLines.reduce((sum, l) => sum + estimateUnit(l) * l.quantity, 0),
    [matchedLines],
  );

  const lineValidation = (l: Line): string | null => {
    if (!l.product) return null;
    return getValidationError(
      groupsFor(l.product),
      l.selections,
      availableVariants(l.product).length,
      l.variantId ? availableVariants(l.product).find((v) => v.id === l.variantId) ?? null : null,
      Boolean(l.product.variantMultiSelect),
    );
  };

  const firstValidationError = matchedLines.map(lineValidation).find(Boolean) || null;
  const canSubmit =
    !submitting &&
    matchedLines.length > 0 &&
    !firstValidationError &&
    (orderType !== "DELIVERY" || deliveryAddress.trim().length > 0);

  // ── Crear pedido ────────────────────────────────────────────────────────────
  const createOrder = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const inputs: OrderItemPayloadInput[] = matchedLines.map((l) => ({
        menuItemId: l.product!.id,
        variantId: l.variantId,
        quantity: l.quantity,
        notes: l.notes,
        modifiers: flattenSelections(groupsFor(l.product!), l.selections),
      }));

      const body = {
        orderType,
        items: buildOrderItemsPayload(inputs),
        customerName: customerName.trim() || "Público General",
        customerPhone: customerPhone.trim() || null,
        deliveryAddress: orderType === "DELIVERY" ? deliveryAddress.trim() || null : null,
        clientOrderId: uid(),
      };

      const { data } = await api.post("/api/orders/tpv", body);
      setCreatedOrder({
        number: data?.orderNumber || data?.id || "—",
        total: Number(data?.total ?? estimateTotal),
      });
      // Limpia para el siguiente pedido (deja el menú cargado).
      setRawText("");
      setLines([]);
      setCustomerName("");
      setCustomerPhone("");
      setDeliveryAddress("");
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        e?.message ||
        "No se pudo crear el pedido.";
      setError(String(msg));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-[100dvh] w-full font-sans"
      style={{ background: "var(--bg)", color: "var(--text-primary)" }}
    >
      {/* Glow de marca */}
      <div
        aria-hidden
        className="pointer-events-none fixed -top-40 -right-40 h-[560px] w-[560px] rounded-full opacity-30 blur-[120px]"
        style={{ background: "radial-gradient(circle, var(--brand-glow, rgba(255,184,77,0.5)) 0%, transparent 70%)" }}
      />

      <div className="relative z-10 mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
        {/* Header */}
        <header className="mb-6 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/pos/order-type")}
              aria-label="Volver"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border bg-white/5 text-white/70 transition active:scale-95"
              style={{ borderColor: "var(--border)" }}
            >
              <ArrowLeft size={18} strokeWidth={2.5} />
            </button>
            <div className="min-w-0">
              <span className="block text-[10px] font-black uppercase tracking-[0.25em]" style={{ color: "var(--brand)" }}>
                Captura
              </span>
              <h1 className="flex items-center gap-2 text-2xl font-black leading-none tracking-tight sm:text-3xl">
                <MessageCircle size={26} style={{ color: "var(--brand)" }} />
                Pedidos WhatsApp
              </h1>
            </div>
          </div>
          <div className="hidden text-right sm:block">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/40">{locationName || "Sucursal"}</p>
            <p className="text-[11px] font-bold text-white/30">{currentEmployee?.name || ""}</p>
          </div>
        </header>

        {/* Éxito */}
        {createdOrder && (
          <div className="mb-5 flex items-center justify-between gap-3 rounded-3xl border p-4" style={{ borderColor: "rgba(136,214,108,0.35)", background: "rgba(136,214,108,0.10)" }}>
            <div className="flex items-center gap-3">
              <CheckCircle2 size={22} className="text-[#88D66C]" />
              <div>
                <p className="text-sm font-black text-[#88D66C]">Pedido creado · {createdOrder.number}</p>
                <p className="text-xs font-semibold text-white/55">
                  Total {money(createdOrder.total)} · cayó en cuentas abiertas, listo para cobrar.
                </p>
              </div>
            </div>
            <button type="button" onClick={() => setCreatedOrder(null)} className="rounded-full p-2 text-white/50 active:scale-90">
              <X size={18} />
            </button>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          {/* ── Columna izquierda: pegar + cliente ──────────────────────────── */}
          <div className="space-y-5">
            <div className="rounded-3xl border bg-white/5 p-4 backdrop-blur-md sm:p-5" style={{ borderColor: "var(--border)" }}>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Mensaje de WhatsApp</p>
                <button
                  type="button"
                  onClick={pasteFromClipboard}
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-white/70 active:scale-95"
                  style={{ borderColor: "var(--border)" }}
                >
                  <ClipboardPaste size={13} /> Pegar
                </button>
              </div>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={7}
                placeholder={"Pega aquí el pedido del chat. Ej:\nCliente: Garibay\nTel: 7228447174\nDomicilio: Calle 5 #12\n1 Hamburguesa Hawaiana (queso aparte)\n2 Coca 600ml"}
                className="w-full resize-y rounded-2xl border bg-black/30 p-3 text-sm font-medium text-white outline-none placeholder:text-white/25 focus:border-[var(--brand)]"
                style={{ borderColor: "var(--border)" }}
              />
              <button
                type="button"
                onClick={handleParse}
                disabled={!rawText.trim() || products.length === 0}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black uppercase tracking-wide transition active:scale-[0.98] disabled:opacity-40"
                style={{ background: "var(--brand)", color: "var(--brand-fg, #0C0C0E)" }}
              >
                <Sparkles size={16} /> Detectar pedido
              </button>
              {menuError && <p className="mt-2 text-xs font-bold text-red-300">{menuError}</p>}
              {products.length > 0 && (
                <p className="mt-2 text-[11px] font-semibold text-white/30">{products.length} productos en catálogo</p>
              )}
            </div>

            {/* Cliente / entrega */}
            <div className="rounded-3xl border bg-white/5 p-4 backdrop-blur-md sm:p-5" style={{ borderColor: "var(--border)" }}>
              <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-white/45">Cliente y entrega</p>

              <div className="mb-3 grid grid-cols-3 gap-2">
                {ORDER_TYPES.map((t) => {
                  const active = orderType === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setOrderType(t.key)}
                      className="flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-[11px] font-black uppercase tracking-wide transition active:scale-95"
                      style={
                        active
                          ? { background: "var(--brand)", color: "var(--brand-fg, #0C0C0E)", borderColor: "var(--brand)" }
                          : { background: "transparent", color: "rgba(255,255,255,0.6)", borderColor: "var(--border)" }
                      }
                    >
                      <t.icon size={18} />
                      {t.label}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2.5">
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Nombre del cliente"
                  className="w-full rounded-2xl border bg-black/30 px-3 py-2.5 text-sm font-medium text-white outline-none placeholder:text-white/25 focus:border-[var(--brand)]"
                  style={{ borderColor: "var(--border)" }}
                />
                <input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value.replace(/[^\d+]/g, ""))}
                  inputMode="tel"
                  placeholder="Teléfono"
                  className="w-full rounded-2xl border bg-black/30 px-3 py-2.5 text-sm font-medium text-white outline-none placeholder:text-white/25 focus:border-[var(--brand)]"
                  style={{ borderColor: "var(--border)" }}
                />
                {orderType === "DELIVERY" && (
                  <textarea
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    rows={2}
                    placeholder="Dirección de entrega (requerida)"
                    className="w-full resize-y rounded-2xl border bg-black/30 px-3 py-2.5 text-sm font-medium text-white outline-none placeholder:text-white/25 focus:border-[var(--brand)]"
                    style={{ borderColor: deliveryAddress.trim() ? "var(--border)" : "rgba(248,113,113,0.5)" }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* ── Columna derecha: líneas + crear ─────────────────────────────── */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/45">
                Productos {matchedLines.length > 0 && `· ${matchedLines.length}`}
              </p>
              <button
                type="button"
                onClick={addBlankLine}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-white/70 active:scale-95"
                style={{ borderColor: "var(--border)" }}
              >
                <Plus size={13} /> Agregar
              </button>
            </div>

            {lines.length === 0 && (
              <div className="rounded-3xl border border-dashed p-8 text-center" style={{ borderColor: "var(--border)" }}>
                <MessageCircle size={28} className="mx-auto mb-2 text-white/20" />
                <p className="text-sm font-bold text-white/40">Pega un pedido y toca "Detectar", o agrega productos a mano.</p>
              </div>
            )}

            <div className="space-y-3">
              {lines.map((line) => (
                <LineCard
                  key={line.uid}
                  line={line}
                  products={products}
                  pickerOpen={pickerFor === line.uid}
                  onOpenPicker={() => setPickerFor(pickerFor === line.uid ? null : line.uid)}
                  onPickProduct={(p) => setProductForLine(line.uid, p)}
                  onQty={(q) => patchLine(line.uid, { quantity: Math.max(1, q) })}
                  onVariant={(vid) => patchLine(line.uid, { variantId: vid })}
                  onToggleMod={(g, m) => toggleModifier(line.uid, g, m)}
                  onNotes={(n) => patchLine(line.uid, { notes: n })}
                  onRemove={() => removeLine(line.uid)}
                  validationError={lineValidation(line)}
                  estUnit={estimateUnit(line)}
                />
              ))}
            </div>

            {/* Resumen + crear */}
            {lines.length > 0 && (
              <div className="sticky bottom-3 rounded-3xl border bg-[#131316]/95 p-4 backdrop-blur-md" style={{ borderColor: "var(--border)" }}>
                <div className="mb-3 flex items-end justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Total estimado</p>
                    <p className="text-[11px] font-semibold text-white/30">El definitivo lo calcula el servidor</p>
                  </div>
                  <p className="text-2xl font-black tracking-tight" style={{ color: "var(--brand)" }}>
                    {money(estimateTotal)}
                  </p>
                </div>

                {firstValidationError && (
                  <p className="mb-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-200">
                    {firstValidationError}
                  </p>
                )}
                {error && (
                  <p className="mb-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300">{error}</p>
                )}

                <button
                  type="button"
                  onClick={createOrder}
                  disabled={!canSubmit}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-black uppercase tracking-wide transition active:scale-[0.98] disabled:opacity-40"
                  style={{ background: "var(--brand)", color: "var(--brand-fg, #0C0C0E)" }}
                >
                  {submitting ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                  {submitting ? "Creando…" : "Crear pedido"}
                </button>
                <p className="mt-2 text-center text-[11px] font-semibold text-white/30">No cobra · cae como cuenta abierta</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tarjeta de línea ──────────────────────────────────────────────────────────
function LineCard({
  line,
  products,
  pickerOpen,
  onOpenPicker,
  onPickProduct,
  onQty,
  onVariant,
  onToggleMod,
  onNotes,
  onRemove,
  validationError,
  estUnit,
}: {
  line: Line;
  products: Product[];
  pickerOpen: boolean;
  onOpenPicker: () => void;
  onPickProduct: (p: Product) => void;
  onQty: (q: number) => void;
  onVariant: (vid: string | null) => void;
  onToggleMod: (g: ModifierGroup, m: Modifier) => void;
  onNotes: (n: string) => void;
  onRemove: () => void;
  validationError: string | null;
  estUnit: number;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pickerOpen) {
      setQuery(line.product ? "" : line.productQuery);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [pickerOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = useMemo(() => {
    const q = query.trim();
    const list = products.filter((p) => p.isAvailable !== false);
    if (!q) return list.slice(0, 40);
    return list
      .map((p) => ({ p, s: matchScore(p.name, q) }))
      .filter((r) => r.s > 0.15)
      .sort((a, b) => b.s - a.s)
      .slice(0, 25)
      .map((r) => r.p);
  }, [query, products]);

  const p = line.product;
  const singleVariants = p && !p.variantMultiSelect ? availableVariants(p) : [];
  const groups = p ? groupsFor(p) : [];

  return (
    <div
      className="rounded-3xl border bg-white/[0.04] p-3.5"
      style={{ borderColor: validationError ? "rgba(251,191,36,0.4)" : "var(--border)" }}
    >
      <div className="flex items-start gap-3">
        {/* Cantidad */}
        <div className="flex flex-col items-center gap-1">
          <button type="button" onClick={() => onQty(line.quantity + 1)} className="flex h-8 w-8 items-center justify-center rounded-xl border text-white/70 active:scale-90" style={{ borderColor: "var(--border)" }}>
            <Plus size={14} />
          </button>
          <span className="w-8 text-center text-lg font-black tabular-nums" style={{ color: "var(--brand)" }}>{line.quantity}</span>
          <button type="button" onClick={() => onQty(line.quantity - 1)} className="flex h-8 w-8 items-center justify-center rounded-xl border text-white/70 active:scale-90" style={{ borderColor: "var(--border)" }}>
            <Minus size={14} />
          </button>
        </div>

        {/* Producto */}
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpenPicker}
            className="flex w-full items-center justify-between gap-2 rounded-2xl border bg-black/20 px-3 py-2.5 text-left active:scale-[0.99]"
            style={{ borderColor: p ? "var(--border)" : "rgba(251,191,36,0.45)" }}
          >
            <span className="min-w-0">
              {p ? (
                <span className="block truncate text-sm font-black text-white">{p.name}</span>
              ) : (
                <span className="block truncate text-sm font-bold text-amber-200">
                  {line.productQuery ? `¿"${line.productQuery}"?` : "Elegir producto"}
                </span>
              )}
              {p && <span className="block text-[11px] font-semibold text-white/35">{money(estUnit)} c/u · tocar para cambiar</span>}
            </span>
            <Search size={16} className="shrink-0 text-white/40" />
          </button>

          {/* Picker */}
          {pickerOpen && (
            <div className="mt-2 rounded-2xl border bg-[#16161a] p-2" style={{ borderColor: "var(--border)" }}>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar producto…"
                className="mb-2 w-full rounded-xl border bg-black/40 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-[var(--brand)]"
                style={{ borderColor: "var(--border)" }}
              />
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {results.map((rp) => (
                  <button
                    key={rp.id}
                    type="button"
                    onClick={() => onPickProduct(rp)}
                    className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-white/85 hover:bg-white/5 active:scale-[0.99]"
                  >
                    <span className="min-w-0 truncate">{rp.name}</span>
                    <span className="shrink-0 text-xs font-bold text-white/40">{money(Number(rp.promoPrice ?? rp.price ?? 0))}</span>
                  </button>
                ))}
                {results.length === 0 && <p className="px-3 py-4 text-center text-xs text-white/40">Sin resultados</p>}
              </div>
            </div>
          )}

          {/* Variantes single-select */}
          {singleVariants.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {singleVariants.map((v) => {
                const active = line.variantId === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => onVariant(active ? null : v.id)}
                    className="rounded-full border px-3 py-1.5 text-[11px] font-bold transition active:scale-95"
                    style={active ? { background: "var(--brand)", color: "var(--brand-fg, #0C0C0E)", borderColor: "var(--brand)" } : { borderColor: "var(--border)", color: "rgba(255,255,255,0.7)" }}
                  >
                    {v.name}{Number(v.price) ? ` · ${money(Number(v.price))}` : ""}
                  </button>
                );
              })}
            </div>
          )}

          {/* Grupos de modificadores / complementos */}
          {groups.map((g) => (
            <div key={g.id} className="mt-2">
              <p className="mb-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/35">
                {g.name}{g.required ? " ·obligatorio" : ""}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {g.modifiers.map((m) => {
                  const active = (line.selections[g.id] || []).some((x) => x.id === m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onToggleMod(g, m)}
                      className="rounded-full border px-3 py-1.5 text-[11px] font-bold transition active:scale-95"
                      style={active ? { background: "var(--brand)", color: "var(--brand-fg, #0C0C0E)", borderColor: "var(--brand)" } : { borderColor: "var(--border)", color: "rgba(255,255,255,0.7)" }}
                    >
                      {m.name}{Number(m.priceAdd) ? ` · ${money(Number(m.priceAdd))}` : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Notas */}
          <input
            value={line.notes}
            onChange={(e) => onNotes(e.target.value)}
            placeholder="Nota (ej. sin cebolla)"
            className="mt-2 w-full rounded-xl border bg-black/20 px-3 py-2 text-xs font-medium text-white outline-none placeholder:text-white/25 focus:border-[var(--brand)]"
            style={{ borderColor: "var(--border)" }}
          />

          {validationError && <p className="mt-1.5 text-[11px] font-bold text-amber-300">{validationError}</p>}
        </div>

        {/* Eliminar */}
        <button type="button" onClick={onRemove} aria-label="Quitar" className="shrink-0 rounded-xl p-2 text-white/40 active:scale-90 hover:text-red-400">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
